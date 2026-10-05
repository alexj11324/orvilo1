// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ActionRequest, Commitment, DurableReceipt } from '@orvilo/agent-execution';
import type { ActionAuthority } from '@orvilo/agent-execution/controlPlane/server';
import {
  ACTION_RECEIPT_SCHEMA_SQL,
  createActionGateway,
  createActionReceiptRecovery,
  createFileActionExecutor,
  FileDurableReceiptStore,
  ScopedFileWriter,
  SqlDurableReceiptStore,
} from '@orvilo/agent-execution/controlPlane/server';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { CanonicalRunAuthority } from './canonicalRun';
import { createCanonicalRunFixture, fixtureTaskId } from './canonicalRun.test-utils';
import {
  CanonicalSessionSnapshots,
  CORE_SESSION_SNAPSHOT_CANDIDATE_SQL,
} from './canonicalSessionSnapshot';
import { CanonicalCoreRuntimeHost } from './coreRuntimeHost';

const execute = promisify(execFile);
const databaseUrl = process.env.CORE_RECOVERY_DATABASE_URL;
const container = 'orvilo-core-recovery-20260930';
const docker = process.env.DOCKER_PATH ?? 'docker';

// Explicit opt-in: this suite restarts ONLY its labelled disposable PostgreSQL.
describe.runIf(!!databaseUrl)('real PostgreSQL receipt recovery after server restart', () => {
  let pool: Pool;
  let db: OrviloDatabase;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/core_recovery')
      throw new Error('Disposable loopback database required');
    const [owned] = JSON.parse((await execute(docker, ['inspect', container])).stdout);
    if (
      owned.Config.Labels['orvilo.acceptance'] !== 'core-recovery' ||
      owned.HostConfig.PortBindings['5432/tcp'][0].HostIp !== '127.0.0.1'
    )
      throw new Error('Not the owned disposable database');
    pool = new Pool({ connectionString: databaseUrl });
    pool.on('error', () => {
      /* Idle sockets are expected to close on this test's server restart. */
    });
    db = drizzle(pool, { schema }) as unknown as OrviloDatabase;
    await migrate(drizzle(pool, { schema }), {
      migrationsFolder: path.resolve('packages/database/migrations'),
    });
    const exists = await pool.query("SELECT to_regclass('public.action_receipts') AS name");
    if (!exists.rows[0].name) await pool.query(ACTION_RECEIPT_SCHEMA_SQL);
    await pool.query(CORE_SESSION_SNAPSHOT_CANDIDATE_SQL);
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
  });

  async function fixture() {
    const binding = await createCanonicalRunFixture(db);
    const directory = await mkdtemp(path.join(tmpdir(), 'orvilo-receipt-restart-'));
    const target = path.join(directory, 'result');
    const content = 'durable action before lost acknowledgement';
    const commitment: Commitment = {
      id: randomUUID(),
      taskId: fixtureTaskId(binding),
      actionKinds: ['file.write'],
      postconditions: [
        { verifierId: 'file.sha256', expected: createHash('sha256').update(content).digest('hex') },
      ],
    };
    const authority: ActionAuthority = {
      withAdmission: async (_request, run) => {
        const result = await new CanonicalRunAuthority(db).withRun(binding, async (snapshot) =>
          run({
            fence: snapshot.fence,
            grant: {
              expiresAt: snapshot.grantExpiresAt,
              revoked: false,
              permittedKinds: ['file.write'],
            },
            leaseExpiresAt: snapshot.leaseExpiresAt,
            mutationEnabled: true,
            commitment,
            // Structural trusted guard fixture only. This suite does not claim OS process isolation.
            isolation: {
              treeId: snapshot.treeId!,
              supervisorId: snapshot.supervisorId!,
              enforced: true,
              filesystem: true,
              network: true,
              processes: true,
              sanitizedEnvironment: true,
              credentialsExcluded: true,
            },
          }),
        );
        if (!result.ok) throw new Error('Canonical admission rejected');
        return result.value;
      },
    };
    const admitted = await new CanonicalRunAuthority(db).withRun(
      binding,
      async (snapshot) => snapshot.fence,
    );
    if (!admitted.ok) throw new Error('Fixture admission failed');
    const request: ActionRequest = {
      schemaVersion: 1,
      fence: admitted.value,
      idempotencyKey: randomUUID(),
      commitmentId: commitment.id,
      action: { kind: 'file.write', path: target, content },
    };
    const writer = await ScopedFileWriter.open(directory);
    const executor = createFileActionExecutor(writer);
    const originalStore = new SqlDurableReceiptStore(pool);
    let applied = 0;
    const result = await createActionGateway({
      authority,
      // Crash boundary: durable reservation exists, target write occurs, but no
      // completion callback reaches SQL. An old prepared->applied callback would
      // otherwise be a legal transition, so later denial proves token fencing.
      receipts: {
        reserve: originalStore.reserve.bind(originalStore),
        save: async () => {
          throw new Error('Interrupted receipt persistence');
        },
      },
      executor: {
        ...executor,
        apply: async (value) => {
          applied++;
          await executor.apply(value);
          throw new Error('Lost acknowledgement after actual write');
        },
      },
    }).execute(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'outcome_unknown' } });
    await writer.close();
    const reader = await ScopedFileWriter.open(directory);
    const verifier = createFileActionExecutor(reader);
    const recovery = (beforeVerify?: () => Promise<void>) =>
      createActionReceiptRecovery({
        authority,
        receipts: new SqlDurableReceiptStore(pool),
        verifier: {
          authorize: verifier.authorize,
          verify: async (request, commitment) => {
            await beforeVerify?.();
            return verifier.verify(request, commitment);
          },
        },
        // The only effect-capable instance is closed/drained above; no kernel was launched.
        confirmQuiescent: async () => true,
      });
    return {
      binding,
      commitment,
      directory,
      target,
      content,
      request,
      originalStore,
      recovery,
      applied: () => applied,
      cleanup: async () => {
        await reader.close();
        await rm(directory, { recursive: true, force: true });
        await db.delete(schema.workspaces).where(eq(schema.workspaces.id, binding.workspaceId));
        await db.delete(schema.users).where(eq(schema.users.id, binding.userId));
      },
    };
  }

  it('reconciles the persisted receipt without replay and fences a delayed old callback after restart', async () => {
    const setup = await fixture();
    try {
      const before = await stat(setup.target);
      const row = (
        await pool.query<{ reservation_key: string; receipt: DurableReceipt }>(
          "SELECT reservation_key,receipt FROM action_receipts WHERE receipt->>'idempotencyKey'=$1",
          [setup.request.idempotencyKey],
        )
      ).rows[0];
      expect(row.receipt.status).toBe('prepared');
      const initial = (await pool.query('SELECT pg_postmaster_start_time() AS started')).rows[0]
        .started;
      await execute(docker, ['restart', '--time', '5', container]);
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await pool.query('SELECT 1');
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      const restarted = (await pool.query('SELECT pg_postmaster_start_time() AS started')).rows[0]
        .started;
      expect(new Date(restarted).getTime()).toBeGreaterThan(new Date(initial).getTime());
      let releaseVerification!: () => void;
      let enteredVerification!: () => void;
      const verificationGate = new Promise<void>((resolve) => {
        releaseVerification = resolve;
      });
      const verificationEntered = new Promise<void>((resolve) => {
        enteredVerification = resolve;
      });
      const pendingRecovery = setup
        .recovery(async () => {
          enteredVerification();
          await verificationGate;
        })
        .recover(setup.request);
      try {
        await verificationEntered;
        // Token rotation has committed, but finishRecovery has not. Status remains
        // prepared: the old callback transition is legal except for reservation ownership.
        const during = (
          await pool.query('SELECT receipt FROM action_receipts WHERE reservation_key=$1', [
            row.reservation_key,
          ])
        ).rows[0].receipt;
        expect(during.status).toBe('prepared');
        await expect(
          setup.originalStore.save(row.reservation_key, {
            ...row.receipt,
            status: 'applied',
            updatedAt: Date.now(),
          }),
        ).rejects.toThrow();
      } finally {
        releaseVerification();
      }
      const recovered = await pendingRecovery;
      expect(recovered).toMatchObject({
        ok: true,
        value: { status: 'verified', id: row.receipt.id },
      });
      expect(setup.applied()).toBe(1);
      expect((await stat(setup.target)).ino).toBe(before.ino);
      expect(await readFile(setup.target, 'utf8')).toBe(setup.content);
      await expect(
        setup.originalStore.save(row.reservation_key, {
          ...row.receipt,
          status: 'applied',
          updatedAt: Date.now(),
        }),
      ).rejects.toThrow();
      expect(await setup.recovery().recover(setup.request)).toEqual(recovered);
    } finally {
      await setup.cleanup();
    }
  }, 45_000);

  it('refuses recovery after a canonical policy revision changes without trusting the old snapshot', async () => {
    const setup = await fixture();
    try {
      await db
        .update(schema.tasks)
        .set({ policyRevision: setup.binding.policyRevision + 1 })
        .where(eq(schema.tasks.id, fixtureTaskId(setup.binding)));
      expect(await setup.recovery().recover(setup.request)).toMatchObject({ ok: false });
      const row = (
        await pool.query(
          "SELECT receipt FROM action_receipts WHERE receipt->>'idempotencyKey'=$1",
          [setup.request.idempotencyKey],
        )
      ).rows[0];
      expect(row.receipt.status).toBe('prepared');
      expect(setup.applied()).toBe(1);
    } finally {
      await setup.cleanup();
    }
  });
  async function snapshotFixture() {
    const setup = await fixture();
    await db.insert(schema.agentOperations).values({
      id: setup.binding.operationId,
      userId: setup.binding.userId,
      workspaceId: setup.binding.workspaceId,
      taskId: fixtureTaskId(setup.binding),
      topicId: setup.binding.topicId,
      status: 'running',
    });
    const [criterion] = await db
      .insert(schema.verifyCriteria)
      .values({
        userId: setup.binding.userId,
        workspaceId: setup.binding.workspaceId,
        title: 'durable file criterion',
        verifierType: 'program',
      })
      .returning();
    const [verify] = await db
      .insert(schema.verifyRuns)
      .values({
        operationId: setup.binding.operationId,
        userId: setup.binding.userId,
        workspaceId: setup.binding.workspaceId,
        status: 'planned',
        planConfirmedAt: new Date(),
        plan: [
          {
            id: 'check',
            index: 0,
            title: 'durable file criterion',
            required: true,
            onFail: 'manual',
            sourceCriterionId: criterion.id,
            verifierType: 'program',
            verifierConfig: {},
          },
        ],
      })
      .returning();
    const row = (
      await pool.query<{ receipt: DurableReceipt }>(
        "SELECT receipt FROM action_receipts WHERE receipt->>'idempotencyKey'=$1",
        [setup.request.idempotencyKey],
      )
    ).rows[0];
    const receipt: DurableReceipt = { ...row.receipt, status: 'prepared', error: undefined };
    const privateRoot = await mkdtemp(path.join(tmpdir(), 'orvilo-snapshot-host-'));
    const workspace = path.join(privateRoot, 'runtime');
    await mkdir(workspace);
    const receiptDirectory = path.join(privateRoot, 'receipts');
    const files = new FileDurableReceiptStore(receiptDirectory);
    await files.reserve('a'.repeat(64), receipt);
    const mappings = [
      {
        checkItemId: 'check',
        sourceCriterionId: criterion.id,
        receiptId: receipt.id,
        requestDigest: receipt.requestDigest,
      },
    ];
    const options = {
      binding: setup.binding,
      database: db,
      controlDirectory: path.join(privateRoot, 'control'),
      outputDirectory: path.join(privateRoot, 'output'),
      receiptDirectory,
      fileCommitments: [setup.commitment],
      completionMappings: mappings,
      docker: {
        supervisorId: 'snapshot-no-launch',
        workspace,
        executable: '/unavailable-prime',
        imageId: `sha256:${'0'.repeat(64)}`,
      },
      verifyArtifact: async () => {
        throw new Error('Snapshot inspection must not launch a runtime');
      },
    };
    const host = await CanonicalCoreRuntimeHost.open(options);
    return {
      ...setup,
      host,
      options,
      receipt,
      files,
      verify,
      mappings,
      evidence: {
        commitments: [setup.commitment],
        completionMappings: mappings,
        loadReceipts: async () => [receipt],
      },
      cleanup: async () => {
        await host.close();
        await setup.cleanup();
        await rm(privateRoot, { recursive: true, force: true });
      },
    };
  }

  it('persists a host snapshot through a real DB restart but blocks pending receipt and unsupported ACP execution resume', async () => {
    const setup = await snapshotFixture();
    let reopened: CanonicalCoreRuntimeHost | undefined;
    try {
      const historyHash = createHash('sha256')
        .update('non-authoritative session history')
        .digest('hex');
      const captured = await setup.host.captureRecoverySnapshot(historyHash);
      expect(captured.ok).toBe(true);
      if (!captured.ok) throw new Error(captured.error.message);
      await setup.host.close();
      await execute(docker, ['restart', '--time', '5', container]);
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await pool.query('SELECT 1');
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      reopened = await CanonicalCoreRuntimeHost.open(setup.options);
      expect(await reopened.inspectRecoverySnapshot(captured.value.id, historyHash)).toMatchObject({
        ok: true,
        value: {
          executionResume: 'unsupported',
          blockedReceiptIds: [setup.receipt.id],
          snapshot: { digest: captured.value.digest },
        },
      });
      expect(await reopened.resumeFromSnapshot(captured.value.id, historyHash)).toMatchObject({
        ok: false,
        error: { code: 'outcome_unknown' },
      });
      expect(
        await reopened.inspectRecoverySnapshot(captured.value.id, '1'.repeat(64)),
      ).toMatchObject({ ok: false });
      await setup.files.save('a'.repeat(64), {
        ...setup.receipt,
        status: 'applied',
        updatedAt: Date.now(),
      });
      await setup.files.save('a'.repeat(64), {
        ...setup.receipt,
        status: 'verified',
        updatedAt: Date.now(),
        evidence: ['fixture verified digest'],
      });
      expect(await reopened.inspectRecoverySnapshot(captured.value.id, historyHash)).toMatchObject({
        ok: false,
      });
      const fresh = await reopened.captureRecoverySnapshot(historyHash);
      if (!fresh.ok) throw new Error(fresh.error.message);
      expect(await reopened.resumeFromSnapshot(fresh.value.id, historyHash)).toMatchObject({
        ok: false,
        error: { code: 'unsupported_capability' },
      });
      const saved = (
        await pool.query('SELECT snapshot FROM core_session_snapshots WHERE id=$1', [
          captured.value.id,
        ])
      ).rows[0].snapshot;
      expect(saved.authority.receipts[0].status).toBe('prepared');
      expect(saved.digest).toBe(captured.value.digest);
    } finally {
      await reopened?.close();
      await setup.cleanup();
    }
  }, 45_000);

  it.each(['decision', 'dependency', 'deleted', 'mapping'] as const)(
    'invalidates saved authority after %s changes',
    async (change) => {
      const setup = await snapshotFixture();
      try {
        const service = new CanonicalSessionSnapshots(db);
        const captured = await service.capture(setup.binding, setup.evidence);
        if (!captured.ok) throw new Error(captured.error.message);
        if (change === 'decision')
          await db
            .update(schema.verifyRuns)
            .set({ decisionDetail: { comment: 'new authoritative review' } })
            .where(eq(schema.verifyRuns.id, setup.verify.id));
        if (change === 'deleted')
          await db
            .update(schema.tasks)
            .set({ isDeleted: true, deletedAt: new Date() })
            .where(eq(schema.tasks.id, fixtureTaskId(setup.binding)));
        if (change === 'dependency') {
          const [prerequisite] = await db
            .insert(schema.tasks)
            .values({
              workspaceId: setup.binding.workspaceId,
              createdByUserId: setup.binding.userId,
              identifier: 'RECOVERY-PREREQ',
              seq: 2,
              instruction: 'new dependency',
              status: 'done',
            })
            .returning();
          await db.insert(schema.taskDependencies).values({
            taskId: fixtureTaskId(setup.binding),
            dependsOnId: prerequisite.id,
            workspaceId: setup.binding.workspaceId,
            userId: setup.binding.userId,
          });
        }
        const evidence =
          change === 'mapping' ? { ...setup.evidence, completionMappings: [] } : setup.evidence;
        expect(await service.recover(setup.binding, captured.value.id, evidence)).toMatchObject({
          ok: false,
        });
      } finally {
        await setup.cleanup();
      }
    },
  );
  it.each(['missing', 'unknown'] as const)(
    'rejects a persisted snapshot with %s schema version',
    async (version) => {
      const setup = await snapshotFixture();
      try {
        const service = new CanonicalSessionSnapshots(db);
        const captured = await service.capture(setup.binding, setup.evidence);
        if (!captured.ok) throw new Error(captured.error.message);
        if (version === 'missing')
          await pool.query(
            "UPDATE core_session_snapshots SET snapshot = snapshot - 'schemaVersion' WHERE id=$1",
            [captured.value.id],
          );
        else
          await pool.query(
            "UPDATE core_session_snapshots SET snapshot = jsonb_set(snapshot, '{schemaVersion}', '999'::jsonb) WHERE id=$1",
            [captured.value.id],
          );
        expect(
          await service.recover(setup.binding, captured.value.id, setup.evidence),
        ).toMatchObject({ ok: false });
      } finally {
        await setup.cleanup();
      }
    },
  );
});
