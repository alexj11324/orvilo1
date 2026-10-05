// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ActionRequest } from '@orvilo/agent-execution';
import { PRIME_RUNTIME_PIN } from '@orvilo/agent-execution/controlPlane/server';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { TaskExecutionControlModel } from '@/database/models/taskExecutionControl';
import { taskDispatches, workspaces } from '@/database/schemas';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import { createCanonicalRunFixture, fixtureTaskId } from './canonicalRun.test-utils';
import { CanonicalCoreRuntimeHost } from './coreRuntimeHost';

const command = promisify(execFile);
it.skipIf(!process.env.CORE_DOCKER_IMAGE || process.env.TEST_SERVER_DB !== '1')(
  'transfers actual stopped Prime ownership once and fences old actions, receipts and stop recovery',
  async () => {
    const imageId = process.env.CORE_DOCKER_IMAGE!;
    const dockerPath = process.env.DOCKER_PATH ?? 'docker';
    const [image] = JSON.parse((await command(dockerPath, ['image', 'inspect', imageId])).stdout);
    expect(image.Id).toBe(imageId);
    expect(image.Config.Labels['orvilo.prime.commit']).toBe(PRIME_RUNTIME_PIN.commit);
    const db = await getTestDB();
    const binding = await createCanonicalRunFixture(db, 'registering');
    const directory = await mkdtemp(path.join(tmpdir(), 'core-handoff-acceptance-'));
    await chmod(directory, 0o755);
    const workspace = path.join(directory, 'workspace');
    await mkdir(workspace);
    await chmod(workspace, 0o755);
    const supervisorId = `handoff-${randomUUID()}`;
    const options = {
      binding,
      database: db,
      controlDirectory: path.join(directory, 'source'),
      outputDirectory: path.join(directory, 'output'),
      runtimeLeaseMs: 300_000,
      docker: {
        dockerPath,
        imageId,
        executable: '/usr/local/bin/prime-pinned',
        workspace,
        supervisorId,
        memoryMiB: 1024,
      },
      fileCommitments: ['source', 'successor'].map((content) => ({
        id: content,
        taskId: fixtureTaskId(binding),
        actionKinds: ['file.write' as const],
        postconditions: [
          {
            verifierId: 'file.sha256',
            expected: createHash('sha256').update(content).digest('hex'),
          },
        ],
      })),
      verifyArtifact: async () => ({ ok: true as const, value: true as const }),
    };
    const host = await CanonicalCoreRuntimeHost.open(options);
    let successor: CanonicalCoreRuntimeHost | undefined;
    let duplicate: CanonicalCoreRuntimeHost | undefined;
    let recovered: CanonicalCoreRuntimeHost | undefined;
    let reopenedSuccessor: CanonicalCoreRuntimeHost | undefined;
    try {
      const started = await host.start();
      expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
      if (!started.ok) throw new Error('Source startup failed');
      const request: ActionRequest = {
        schemaVersion: 1,
        fence: started.value.fence,
        idempotencyKey: 'shared-key',
        commitmentId: 'source',
        action: {
          kind: 'file.write',
          path: path.join(options.outputDirectory, 'result'),
          content: 'source',
        },
      };
      expect(await host.execute(request)).toMatchObject({ ok: true });
      // A provisioning lease is not process ownership.
      await db
        .update(taskDispatches)
        .set({ leaseOwner: null, leaseExpiresAt: null })
        .where(eq(taskDispatches.id, binding.dispatchId));
      const intent = {
        id: randomUUID(),
        successorOwnerId: 'successor-owner',
        successorRegistrationId: randomUUID(),
        successorLeaseId: randomUUID(),
        leaseMs: 300_000,
      };
      const nextOptions = { ...options, controlDirectory: path.join(directory, 'successor') };
      const result = await host.handoffTo(intent, nextOptions);
      expect(
        result,
        JSON.stringify(result, (key, value) => (key === 'host' ? undefined : value)),
      ).toMatchObject({ ok: true });
      if (!result.ok || !result.value.host || !result.value.session)
        throw new Error('Actual successor startup failed');
      successor = result.value.host;
      expect(result.value.session.fence.epoch).toBe(started.value.fence.epoch + 1);
      expect(result.value.transportReady).toBe(true);
      expect(await host.execute(request)).toMatchObject({ ok: false });
      const collision = { ...request, fence: result.value.session.fence };
      expect(await successor.execute(collision)).toMatchObject({
        ok: false,
        error: { code: 'idempotency_conflict' },
      });
      expect(
        await readFile(request.action.kind === 'file.write' ? request.action.path : '', 'utf8'),
      ).toBe('source');
      expect(
        await successor.execute({
          ...collision,
          idempotencyKey: 'next-key',
          commitmentId: 'successor',
          action: {
            kind: 'file.write',
            path: path.join(options.outputDirectory, 'result'),
            content: 'successor',
          },
        }),
      ).toMatchObject({ ok: true });
      recovered = await CanonicalCoreRuntimeHost.open(options);
      const replay = await recovered.handoffTo(intent, nextOptions);
      expect(replay).toMatchObject({
        ok: true,
        value: { transportReady: false, sessionId: result.value.sessionId },
      });
      // A stale host can kill only its already stopped tree, never cancel the successor dispatch.
      expect(await recovered.recoverStop()).toMatchObject({ ok: false });
      duplicate = await CanonicalCoreRuntimeHost.open({
        ...nextOptions,
        binding: result.value.binding,
        controlDirectory: path.join(directory, 'duplicate'),
      });
      expect(await duplicate.start()).toMatchObject({ ok: false });
      const [dispatch] = await db
        .select()
        .from(taskDispatches)
        .where(eq(taskDispatches.id, binding.dispatchId));
      expect(dispatch.phase).toBe('running');
      expect(dispatch.fence).toBe(binding.dispatchFence);
      const model = new TaskExecutionControlModel(db, binding.userId, binding.workspaceId);
      expect(await model.read(intent.id)).toMatchObject({ phase: 'resumed' });
      const containers = (
        await command(dockerPath, [
          'ps',
          '-q',
          '--filter',
          `label=orvilo.core.supervisor=${supervisorId}`,
        ])
      ).stdout
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      expect(containers).toHaveLength(1);
      // Omitted receiptDirectory must recover the internally selected source namespace.
      reopenedSuccessor = await CanonicalCoreRuntimeHost.open({
        ...nextOptions,
        binding: result.value.binding,
      });
      const successorJournal = JSON.parse(
        await readFile(path.join(nextOptions.controlDirectory, 'host.json'), 'utf8'),
      );
      expect(successorJournal.receiptDirectory).toBe(
        path.join(options.controlDirectory, 'receipts'),
      );
      expect(await reopenedSuccessor.start()).toMatchObject({ ok: false });
      const [receiptKey] = await readdir(successorJournal.receiptDirectory);
      const receiptPath = path.join(successorJournal.receiptDirectory, receiptKey, 'receipt.json');
      const receiptText = await readFile(receiptPath, 'utf8');
      // Fault injection of durable ambiguous status in the original shared namespace.
      await writeFile(
        receiptPath,
        JSON.stringify({ ...JSON.parse(receiptText), status: 'outcome_unknown' }),
      );
      expect(await reopenedSuccessor.recoverStop()).toMatchObject({ ok: false });
      await writeFile(receiptPath, receiptText);
      expect(await reopenedSuccessor.recoverStop()).toMatchObject({
        ok: true,
        value: { remainingProcesses: 0, pendingActions: 0 },
      });
      expect(await recovered.handoffTo(intent, nextOptions)).toMatchObject({ ok: false });
    } finally {
      await reopenedSuccessor?.close();
      await duplicate?.close();
      await recovered?.close();
      await successor?.close();
      await host.close();
      const ids = (
        await command(dockerPath, [
          'ps',
          '-aq',
          '--filter',
          `label=orvilo.core.supervisor=${supervisorId}`,
        ])
      ).stdout;
      for (const id of ids.split(/\s+/).filter(Boolean))
        await command(dockerPath, ['rm', '-f', id]);
      await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
      await cleanupTestUser(db, binding.userId);
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);
