// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type AuthoritySnapshot, createActionGateway } from './actionGateway';
import type { ActionRequest, DurableReceipt } from './contracts';
import { createFileActionExecutor } from './fileActionExecutor';
import { ScopedFileWriter } from './scopedFileWriter';
import { ACTION_RECEIPT_SCHEMA_SQL, SqlDurableReceiptStore } from './sqlReceiptStore';

const receipt = (id = 'receipt'): DurableReceipt => ({
  schemaVersion: 1,
  id,
  requestDigest: 'digest',
  idempotencyKey: 'key',
  commitmentId: 'commitment',
  actionKind: 'file.write',
  status: 'prepared',
  createdAt: 1,
  updatedAt: 1,
  evidence: [],
  fence: {
    tenantId: 'tenant',
    principalId: 'principal',
    taskId: 'task',
    grantId: 'grant',
    ownerId: 'owner',
    leaseId: 'lease',
    epoch: 1,
    policyRevision: 1,
    stateRevision: 1,
  },
});

describe('durable PostgreSQL receipt reservation', () => {
  let directory: string;
  let database: PGlite;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'orvilo-sql-receipts-'));
    database = new PGlite(directory);
    await database.exec(ACTION_RECEIPT_SCHEMA_SQL);
  });
  afterEach(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('returns one owner under concurrent reservations and fences all losing instances', async () => {
    const stores = Array.from({ length: 8 }, () => new SqlDurableReceiptStore(database));
    const results = await Promise.all(
      stores.map((store, i) => store.reserve('key', receipt(`receipt-${i}`))),
    );
    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    const winner = results.findIndex((result) => result.claimed);
    for (let i = 0; i < stores.length; i++) {
      expect(results[i].receipt.id).toBe(results[winner].receipt.id);
      if (i !== winner)
        await expect(
          stores[i].save('key', { ...results[i].receipt, status: 'applied' }),
        ).rejects.toThrow('owned');
    }
    expect((await database.query('SELECT * FROM action_receipts')).rows).toHaveLength(1);
  });

  it.each(['prepared', 'applied', 'outcome_unknown'] as const)(
    'preserves %s across disk reopen without permitting takeover',
    async (status) => {
      const store = new SqlDurableReceiptStore(database);
      await store.reserve('key', receipt());
      if (status !== 'prepared') await store.save('key', { ...receipt(), status });
      await database.close();
      database = new PGlite(directory);
      const recovered = new SqlDurableReceiptStore(database);
      expect(await recovered.reserve('key', receipt('new'))).toMatchObject({
        claimed: false,
        receipt: { id: 'receipt', status },
      });
      await expect(recovered.save('key', { ...receipt(), status: 'applied' })).rejects.toThrow(
        'owned',
      );
    },
  );

  it('rejects identity changes, time rollback, skipped verification and terminal overwrites', async () => {
    const store = new SqlDurableReceiptStore(database);
    await store.reserve('key', receipt());
    await expect(
      store.save('key', { ...receipt(), requestDigest: 'changed', status: 'applied' }),
    ).rejects.toThrow();
    await expect(
      store.save('key', {
        ...receipt(),
        fence: { ...receipt().fence, tenantId: 'other' },
        status: 'applied',
      }),
    ).rejects.toThrow();
    await expect(
      store.save('key', { ...receipt(), updatedAt: 0, status: 'applied' }),
    ).rejects.toThrow();
    await expect(store.save('key', { ...receipt(), status: 'verified' })).rejects.toThrow();
    await store.save('key', { ...receipt(), status: 'applied' });
    await store.save('key', { ...receipt(), status: 'verified', evidence: ['checked'] });
    await expect(store.save('key', { ...receipt(), status: 'outcome_unknown' })).rejects.toThrow();
    const replay = await new SqlDurableReceiptStore(database).reserve('key', receipt('retry'));
    expect(replay.receipt.status).toBe('verified');
  });
  it('reopens SQL and real file executor without repeating a verified filesystem effect', async () => {
    const output = path.join(directory, 'output');
    await mkdir(output);
    const target = path.join(output, 'result');
    const request: ActionRequest = {
      schemaVersion: 1,
      fence: receipt().fence,
      idempotencyKey: 'once',
      commitmentId: 'commitment',
      action: { kind: 'file.write', path: target, content: 'approved' },
    };
    // Authority and isolation are explicit fixtures; SQL and filesystem executor are real.
    const snapshot: AuthoritySnapshot = {
      fence: request.fence,
      grant: { expiresAt: 200, revoked: false, permittedKinds: ['file.write'] },
      leaseExpiresAt: 200,
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
        id: 'commitment',
        taskId: 'task',
        actionKinds: ['file.write'],
        postconditions: [
          {
            verifierId: 'file.sha256',
            expected: createHash('sha256').update('approved').digest('hex'),
          },
        ],
      },
    };
    let writer = await ScopedFileWriter.open(output);
    const gateway = () =>
      createActionGateway({
        authority: { withAdmission: async (_request, run) => run(snapshot) },
        executor: createFileActionExecutor(writer),
        receipts: new SqlDurableReceiptStore(database),
        now: () => 100,
      });
    try {
      const first = await gateway().execute(request);
      expect(first).toMatchObject({ ok: true, value: { status: 'verified' } });
      expect(await readFile(target, 'utf8')).toBe('approved');
      await writer.close();
      await database.close();
      database = new PGlite(directory);
      writer = await ScopedFileWriter.open(output);
      await writeFile(target, 'later independent edit');
      expect(await gateway().execute(request)).toEqual(first);
      expect(await readFile(target, 'utf8')).toBe('later independent edit');
      snapshot.grant.revoked = true;
      expect(await gateway().execute(request)).toMatchObject({
        ok: false,
        error: { code: 'revoked' },
      });
    } finally {
      await writer.close();
    }
  });

  it('fences the original adapter if its durable ownership token no longer matches', async () => {
    const store = new SqlDurableReceiptStore(database);
    await store.reserve('key', receipt());
    await database.query('UPDATE action_receipts SET owner_token=$1 WHERE reservation_key=$2', [
      'different-owner',
      'key',
    ]);
    await expect(store.save('key', { ...receipt(), status: 'applied' })).rejects.toThrow('owner');
    expect(
      (await new SqlDurableReceiptStore(database).reserve('key', receipt('retry'))).receipt.status,
    ).toBe('prepared');
  });
});
