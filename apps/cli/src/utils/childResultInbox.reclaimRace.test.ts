import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  InboxLockRecoveryRequiredError,
  persistChildResultInboxRecord,
  readChildResultInboxRecords,
  resolveInboxDir,
} from './childResultInbox';

/**
 * SC02 R7 — a leftover `<file>.lock.reclaim` ticket is fail-closed, never
 * recycled inside the racing acquire path. The R6 cleanup's
 * check-then-unlink window let a racing reclaimer delete a FRESH ticket, so
 * a rename landed a lock record whose owner never acquired it (the R7
 * counterexample: 0 acquisitions, lock attributed to a live pid). The
 * contract now: ticket residue blocks every contender with a
 * recovery-required error until controlled recovery removes it.
 *
 * These tests exercise the CLI's OWN implementation through its public API
 * — the registry-package suite does not stand in for this file's lock
 * boundary (the two paths share a contract, not code).
 */
describe('childResultInbox reclaim-ticket residue (SC02 R7)', () => {
  let homeDirName: string;

  beforeEach(() => {
    homeDirName = `.orvilo-inbox-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
    process.env.ORVILO_CLI_HOME = homeDirName;
  });

  afterEach(async () => {
    delete process.env.ORVILO_CLI_HOME;
    await rm(path.join(os.homedir(), homeDirName), { force: true, recursive: true });
  });

  const inboxFile = (operationId: string) => path.join(resolveInboxDir(), `${operationId}.jsonl`);

  const settleInput = (eventIds: string[], operationId = 'op_t') => ({
    deliveries: eventIds.map((eventId) => ({ childOperationId: `c_${eventId}`, eventId })),
    operationId,
    results: eventIds.map((eventId) => ({
      content: `content for ${eventId}`,
      operationId: `c_${eventId}`,
      status: 'done',
    })),
    toolCallId: 'tc_1',
  });

  const deadPid = () => spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid;

  /** Plant the residue a crashed reclaimer leaves: dead lock + dead ticket. */
  const plantDeadResidue = async (file: string) => {
    await mkdir(path.dirname(file), { recursive: true });
    const deadRecord = `${deadPid()}:dead-owner`;
    const deadTicket = `${deadPid()}:dead-reclaimer`;
    await writeFile(file, '');
    await writeFile(`${file}.lock`, deadRecord);
    await writeFile(`${file}.lock.reclaim`, deadTicket);
    return { deadRecord, deadTicket };
  };

  it('dead lock + dead ticket: every contender fails closed, nothing is mutated', async () => {
    const operationId = 'op_ticket_residue';
    const file = inboxFile(operationId);
    const { deadRecord, deadTicket } = await plantDeadResidue(file);

    const results = await Promise.allSettled([
      persistChildResultInboxRecord(settleInput(['e_a'], operationId)),
      persistChildResultInboxRecord(settleInput(['e_b'], operationId)),
    ]);

    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(InboxLockRecoveryRequiredError);
        expect((result.reason as InboxLockRecoveryRequiredError).code).toBe(
          'INBOX_LOCK_RECOVERY_REQUIRED',
        );
      }
    }
    // Explicit blocking means NO mutation — the lock is not re-attributed to
    // a requester and the ticket is neither deleted nor moved.
    expect(await readFile(`${file}.lock`, 'utf8')).toBe(deadRecord);
    expect(await readFile(`${file}.lock.reclaim`, 'utf8')).toBe(deadTicket);
    // Readers share the same boundary: recovery replay fails closed too.
    await expect(readChildResultInboxRecords(operationId)).rejects.toBeInstanceOf(
      InboxLockRecoveryRequiredError,
    );
  });

  it('an unattributable ticket fails closed — garbage content is never a free slot', async () => {
    const operationId = 'op_ticket_garbage';
    const file = inboxFile(operationId);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '');
    await writeFile(`${file}.lock`, `${deadPid()}:dead-owner`);
    await writeFile(`${file}.lock.reclaim`, 'not-a-pid-record');

    await expect(
      persistChildResultInboxRecord(settleInput(['e_a'], operationId)),
    ).rejects.toBeInstanceOf(InboxLockRecoveryRequiredError);
    expect(await readFile(`${file}.lock.reclaim`, 'utf8')).toBe('not-a-pid-record');
  });

  it('after controlled recovery removes the residue, takeover proceeds and writes', async () => {
    const operationId = 'op_ticket_recovery';
    const file = inboxFile(operationId);
    const { deadRecord } = await plantDeadResidue(file);

    await expect(
      persistChildResultInboxRecord(settleInput(['e_blocked'], operationId)),
    ).rejects.toBeInstanceOf(InboxLockRecoveryRequiredError);

    // Controlled recovery: all writers quiesced, residue verified, removed.
    await rm(`${file}.lock.reclaim`);

    await persistChildResultInboxRecord(settleInput(['e_after'], operationId));
    const landed = await readFile(`${file}.lock`, 'utf8').catch(() => undefined);
    // The takeover renamed the winner's ticket onto the lock; the section
    // released owner-verified — the lock file may be gone or carry a new
    // token, but never the dead record again.
    if (landed !== undefined) expect(landed).not.toBe(deadRecord);
    const records = await readChildResultInboxRecords(operationId);
    expect(records.flatMap((r) => r.deliveries.map((d) => d.eventId))).toContain('e_after');
  });

  const bunAvailable = spawnSync('bun', ['--version'], { timeout: 10_000 }).status === 0;
  it.runIf(bunAvailable)(
    'two real processes both fail closed on ticket residue',
    async () => {
      const operationId = 'op_ticket_xproc';
      const file = inboxFile(operationId);
      const { deadRecord, deadTicket } = await plantDeadResidue(file);

      const modulePath = fileURLToPath(new URL('./childResultInbox.ts', import.meta.url));
      const worker = (tag: string) =>
        new Promise<string>((resolve, reject) => {
          const script = `(async () => {
            const m = await import(${JSON.stringify(modulePath)});
            await m.persistChildResultInboxRecord({
              deliveries: [{ childOperationId: 'c_${tag}', eventId: 'e_${tag}' }],
              operationId: ${JSON.stringify(operationId)},
              results: [{ content: 'r', operationId: 'c_${tag}', status: 'done' }],
              toolCallId: 'tc_${tag}',
            });
          })().then(() => process.exit(0)).catch((error) => {
            console.error(String(error && error.name || error));
            process.exit(2);
          });`;
          const child = spawn('bun', ['-e', script], {
            env: { ...process.env, ORVILO_CLI_HOME: homeDirName },
          });
          let stderr = '';
          child.stderr.on('data', (chunk) => {
            stderr += chunk;
          });
          child.on('error', reject);
          child.on('exit', (code) =>
            code === 2
              ? resolve(stderr)
              : reject(
                  new Error(`worker ${tag} exited ${code} — expected fail-closed (2): ${stderr}`),
                ),
          );
        });

      const outputs = await Promise.all([worker('p0'), worker('p1')]);
      for (const stderr of outputs) {
        expect(stderr).toContain('InboxLockRecoveryRequiredError');
      }
      // Cross-process result: no contender acquired, and the residue files
      // were never deleted or re-attributed.
      expect(await readFile(`${file}.lock`, 'utf8')).toBe(deadRecord);
      expect(await readFile(`${file}.lock.reclaim`, 'utf8')).toBe(deadTicket);
    },
    30_000,
  );
});
