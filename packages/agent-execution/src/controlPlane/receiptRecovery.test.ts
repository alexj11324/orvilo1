// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

import { createActionGateway, createActionReceiptRecovery } from './actionGateway';
import type { ActionRequest, DurableReceipt } from './contracts';
import { createFileActionExecutor } from './fileActionExecutor';
import { ScopedFileWriter } from './scopedFileWriter';
import { ACTION_RECEIPT_SCHEMA_SQL, SqlDurableReceiptStore } from './sqlReceiptStore';

it('reopens ambiguous durable effects for read-only recovery, blocks missing proof, and fences late saves', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'receipt-recovery-'));
  let db = new PGlite(path.join(directory, 'db'));
  await db.exec(ACTION_RECEIPT_SCHEMA_SQL);
  const output = path.join(directory, 'output');
  await mkdir(output);
  let writer = await ScopedFileWriter.open(output);
  const request: ActionRequest = {
    schemaVersion: 1,
    fence: {
      tenantId: 't',
      principalId: 'p',
      taskId: 'task',
      grantId: 'g',
      ownerId: 'o',
      leaseId: 'l',
      epoch: 1,
      policyRevision: 1,
      stateRevision: 1,
    },
    idempotencyKey: 'once',
    commitmentId: 'c',
    action: { kind: 'file.write', path: path.join(output, 'result'), content: 'approved' },
  };
  const snapshot = {
    fence: request.fence,
    grant: { expiresAt: 1000, revoked: false, permittedKinds: ['file.write' as const] },
    leaseExpiresAt: 1000,
    mutationEnabled: true,
    isolation: {
      supervisorId: 'fixture',
      treeId: 'fixture',
      enforced: true,
      filesystem: true,
      network: true,
      processes: true,
      sanitizedEnvironment: true,
      credentialsExcluded: true,
    },
    commitment: {
      id: 'c',
      taskId: 'task',
      actionKinds: ['file.write' as const],
      postconditions: [
        {
          verifierId: 'file.sha256',
          expected: createHash('sha256').update('approved').digest('hex'),
        },
      ],
    },
  };
  const authority = {
    withAdmission: async <T>(
      _request: ActionRequest,
      run: (value: typeof snapshot) => Promise<T>,
    ) => run(snapshot),
  };
  // Boundary authority/proof are named fixtures, not production OS evidence.
  let key = '';
  let applyCount = 0;
  const original = new SqlDurableReceiptStore({
    query: (sql, parameters) => db.query(sql, parameters),
  });
  try {
    const executor = createFileActionExecutor(writer);
    const gateway = createActionGateway({
      authority,
      now: () => 100,
      receipts: {
        reserve: async (value, receipt) => {
          key = value;
          return original.reserve(value, receipt);
        },
        save: (value, receipt) => original.save(value, receipt),
      },
      executor: {
        ...executor,
        apply: async (value) => {
          applyCount++;
          await executor.apply(value);
          throw new Error('Lost acknowledgement');
        },
      },
    });
    expect(await gateway.execute(request)).toMatchObject({
      ok: false,
      error: { code: 'outcome_unknown' },
    });
    const incomplete = (await original.read(key))!;
    await writer.close();
    await db.close();
    db = new PGlite(path.join(directory, 'db'));
    writer = await ScopedFileWriter.open(output);
    const recovered = new SqlDurableReceiptStore(db);
    let quiescent = false;
    let verifies = 0;
    const real = createFileActionExecutor(writer);
    const recovery = createActionReceiptRecovery({
      authority,
      receipts: recovered,
      now: () => 101,
      confirmQuiescent: async () => quiescent,
      verifier: {
        authorize: real.authorize,
        verify: async (...args) => {
          verifies++;
          return real.verify(...args);
        },
      },
    });
    expect(await recovery.recover(request)).toMatchObject({
      ok: false,
      error: { code: 'not_quiescent' },
    });
    expect(verifies).toBe(0);
    quiescent = true;
    await writeFile(path.join(output, 'result'), 'unproven');
    expect(await recovery.recover(request)).toMatchObject({
      ok: false,
      error: { code: 'outcome_unknown' },
    });
    expect((await recovered.read(key))?.status).toBe('outcome_unknown');
    await writeFile(path.join(output, 'result'), 'approved');
    expect(await recovery.recover(request)).toMatchObject({
      ok: true,
      value: { status: 'verified' },
    });
    await expect(
      original.save(key, { ...incomplete, status: 'applied', updatedAt: 102 }),
    ).rejects.toThrow();
    await writeFile(path.join(output, 'result'), 'later edit');
    const count = verifies;
    expect(await recovery.recover(request)).toMatchObject({ ok: true });
    expect(verifies).toBe(count);
    expect(applyCount).toBe(1);
    expect(await readFile(path.join(output, 'result'), 'utf8')).toBe('later edit');
    snapshot.grant.revoked = true;
    expect(await recovery.recover(request)).toMatchObject({
      ok: false,
      error: { code: 'revoked' },
    });
  } finally {
    await writer.close();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(['prepared', 'applied', 'outcome_unknown'] as const)(
  'CAS-fences competing recovery and old %s owners',
  async (status) => {
    const db = new PGlite();
    await db.exec(ACTION_RECEIPT_SCHEMA_SQL);
    const receipt: DurableReceipt = {
      schemaVersion: 1,
      id: 'id',
      requestDigest: 'd',
      idempotencyKey: 'k',
      commitmentId: 'c',
      actionKind: 'file.write',
      status: 'prepared',
      createdAt: 1,
      updatedAt: 1,
      evidence: [],
      fence: {
        tenantId: 't',
        principalId: 'p',
        taskId: 'task',
        grantId: 'g',
        ownerId: 'o',
        leaseId: 'l',
        epoch: 1,
        policyRevision: 1,
        stateRevision: 1,
      },
    };
    try {
      const original = new SqlDurableReceiptStore(db);
      await original.reserve('k', receipt);
      if (status !== 'prepared') await original.save('k', { ...receipt, status });
      const expected = (await original.read('k'))!;
      const a = new SqlDurableReceiptStore(db);
      const b = new SqlDurableReceiptStore(db);
      const first = (await a.claimRecovery('k', expected))!;
      const second = (await b.claimRecovery('k', expected))!;
      const verified = {
        ...expected,
        status: 'verified' as const,
        evidence: ['read-only proof'],
        updatedAt: 2,
      };
      expect(await a.finishRecovery('k', first, expected, verified)).toBe(false);
      expect(await b.finishRecovery('k', second, expected, verified)).toBe(true);
      await expect(
        original.save('k', { ...expected, status: 'outcome_unknown', updatedAt: 3 }),
      ).rejects.toThrow();
      expect(await a.claimRecovery('k', expected)).toBeUndefined();
      expect(await original.read('k')).toEqual(verified);
    } finally {
      await db.close();
    }
  },
);
