/** Disposable loopback PostgreSQL only: independent committed receipts survive authority rollback. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import type { DurableReceipt } from '../../packages/agent-execution/src/controlPlane/contracts';
import {
  ACTION_RECEIPT_SCHEMA_SQL,
  SqlDurableReceiptStore,
} from '../../packages/agent-execution/src/controlPlane/sqlReceiptStore';

async function main() {
  const connectionString = process.argv[2];
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1')
    throw new Error('An explicitly supplied disposable loopback PostgreSQL URL is required');
  const schema = `core_receipt_acceptance_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, max: 10, options: `-c search_path=${schema}` });
  const receipt = (id: string): DurableReceipt => ({
    schemaVersion: 1,
    id,
    requestDigest: 'fixture-digest',
    idempotencyKey: 'fixture-key',
    commitmentId: 'fixture-commitment',
    actionKind: 'file.write',
    status: 'prepared',
    createdAt: 1,
    updatedAt: 1,
    evidence: [],
    fence: {
      tenantId: 'fixture',
      principalId: 'fixture',
      taskId: 'fixture',
      grantId: 'fixture',
      ownerId: 'fixture',
      leaseId: 'fixture',
      epoch: 1,
      policyRevision: 1,
      stateRevision: 1,
    },
  });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(ACTION_RECEIPT_SCHEMA_SQL);
    const stores = Array.from({ length: 8 }, () => new SqlDurableReceiptStore(pool));
    const reservations = await Promise.all(
      stores.map((store, index) => store.reserve('race', receipt(`r${index}`))),
    );
    assert.equal(reservations.filter((item) => item.claimed).length, 1);
    assert.equal(new Set(reservations.map((item) => item.receipt.id)).size, 1);

    // This transaction stands for a separately connected authority transaction.
    // It does not claim to implement the canonical application's authority checks.
    const authority = await pool.connect();
    authority.on('error', () => {
      /* Expected backend termination below. */
    });
    try {
      await authority.query('BEGIN');
      const {
        rows: [{ pid }],
      } = await authority.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const store = new SqlDurableReceiptStore(pool);
      const pending = receipt('crash-receipt');
      assert.equal((await store.reserve('crash', pending)).claimed, true);
      await store.save('crash', {
        ...pending,
        status: 'applied',
        updatedAt: 2,
        evidence: ['fixture-effect'],
      });
      await admin.query('SELECT pg_terminate_backend($1)', [pid]);
      await assert.rejects(authority.query('COMMIT'));
    } finally {
      authority.release(true);
    }
    const reopened = new SqlDurableReceiptStore(pool);
    const recovered = await reopened.reserve('crash', receipt('replacement'));
    assert.equal(recovered.claimed, false);
    assert.equal(recovered.receipt.status, 'applied');
    await assert.rejects(reopened.save('crash', { ...recovered.receipt, status: 'verified' }));
    console.log(
      JSON.stringify({
        concurrentReservations: 8,
        owners: 1,
        authorityBackendKilled: true,
        independentlyCommittedReceiptSurvived: true,
        staleOwnerTakeoverDenied: true,
        canonicalAuthority: 'not exercised by this probe',
      }),
    );
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}
main().catch(() => {
  console.error('SQL recovery acceptance failed');
  process.exitCode = 1;
});
