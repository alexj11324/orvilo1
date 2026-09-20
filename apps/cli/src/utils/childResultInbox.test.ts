import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  persistChildResultInboxRecord,
  readChildResultInboxRecords,
  resolveInboxDir,
  resolvePersistentToolCallId,
} from './childResultInbox';

/**
 * SC-SB06/D02 — the durable child-result inbox must survive torn tails,
 * concurrent appends, and crash-before/after-ACK replays. Every test runs
 * against a real temp `ORVILO_CLI_HOME`, never mocks: the failure mode being
 * covered is filesystem-level (a crash mid-append leaves an unterminated
 * tail that must never fuse with the next record).
 */
describe('childResultInbox', () => {
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

  const eventIdsIn = (records: Array<{ deliveries: Array<{ eventId: string }> }>) =>
    records.flatMap((record) => record.deliveries.map((delivery) => delivery.eventId));

  it('D02: a torn tail at ANY byte offset can never fuse with the next append', async () => {
    const operationId = 'op_torn';
    // One durably-recorded settle, then a crash mid-append leaves a second
    // record truncated at every possible byte.
    await persistChildResultInboxRecord(settleInput(['e_stable'], operationId));
    const file = inboxFile(operationId);
    const prefix = await readFile(file, 'utf8');
    const victim = `${JSON.stringify({
      deliveries: [{ childOperationId: 'c_e_torn', eventId: 'e_torn' }],
      operationId,
      recordedAt: Date.now(),
      resultHash: 'x'.repeat(64),
      results: [{ content: 'partial write', operationId: 'c_e_torn', status: 'done' }],
      toolCallId: 'tc_1',
    })}`;

    // Step of 13 still walks every residue class of cut position; a record
    // written past the torn tail must parse on EVERY offset.
    for (let keep = 0; keep <= victim.length; keep += 13) {
      await writeFile(file, prefix + victim.slice(0, keep), 'utf8');
      await persistChildResultInboxRecord(settleInput([`e_new_${keep}`], operationId));

      const raw = await readFile(file, 'utf8');
      // Every line on disk is self-contained JSON — a torn tail must never
      // merge into the freshly appended record.
      for (const line of raw.split('\n').filter(Boolean)) {
        expect(() => JSON.parse(line), `unparseable line after tail cut at ${keep}`).not.toThrow();
      }
      const recovered = await readChildResultInboxRecords(operationId);
      expect(eventIdsIn(recovered)).toContain('e_stable');
      expect(eventIdsIn(recovered)).toContain(`e_new_${keep}`);
    }
  });

  it('D02: concurrent appends never interleave or drop records', async () => {
    const operationId = 'op_concurrent';
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        persistChildResultInboxRecord(settleInput([`e_c${index}`], operationId)),
      ),
    );

    const raw = await readFile(inboxFile(operationId), 'utf8');
    for (const line of raw.split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const records = await readChildResultInboxRecords(operationId);
    expect(eventIdsIn(records).sort()).toEqual(
      Array.from({ length: 8 }, (_, index) => `e_c${index}`).sort(),
    );
  });

  it('D02: concurrent appends racing a torn tail stay recoverable', async () => {
    const operationId = 'op_torn_race';
    await persistChildResultInboxRecord(settleInput(['e_base'], operationId));
    const file = inboxFile(operationId);
    const prefix = await readFile(file, 'utf8');
    await writeFile(file, `${prefix}{"deliveries":[{"eventId":"e_torn"`, 'utf8');

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        persistChildResultInboxRecord(settleInput([`e_r${index}`], operationId)),
      ),
    );

    const records = await readChildResultInboxRecords(operationId);
    const ids = eventIdsIn(records);
    expect(ids).toContain('e_base');
    for (let index = 0; index < 6; index += 1) expect(ids).toContain(`e_r${index}`);
  });

  it('D02: a replayed eventId must carry the recorded resultHash — a divergence refuses', async () => {
    const operationId = 'op_hash';
    await persistChildResultInboxRecord(settleInput(['e_dup'], operationId));

    // Same delivery id, different content — corruption or a server-side
    // replay bug; the record must be refused rather than silently deduped.
    const tampered = {
      ...settleInput(['e_dup'], operationId),
      results: [{ content: 'DIFFERENT', operationId: 'c_e_dup', status: 'done' }],
    };
    await expect(persistChildResultInboxRecord(tampered)).rejects.toThrow(/e_dup/);

    // The refused write left nothing behind — the stored record still reads
    // back exactly once with its original hash.
    const records = await readChildResultInboxRecords(operationId);
    expect(eventIdsIn(records)).toEqual(['e_dup']);
    expect(records[0].resultHash).toMatch(/^[0-9a-f]{64}$/);

    // A byte-identical replay is the transport resend — deduped silently.
    await persistChildResultInboxRecord(settleInput(['e_dup'], operationId));
    expect(eventIdsIn(await readChildResultInboxRecords(operationId))).toEqual(['e_dup']);
  });

  it('D02: the recovery reader replays everything persisted before a crash', async () => {
    const operationId = 'op_crash';
    // Persisted-before-ACK: the record must be replayable even if the ack
    // response never reached the server.
    await persistChildResultInboxRecord(settleInput(['e_1', 'e_2'], operationId));
    await persistChildResultInboxRecord(settleInput(['e_3'], operationId));

    const records = await readChildResultInboxRecords(operationId);
    expect(eventIdsIn(records)).toEqual(['e_1', 'e_2', 'e_3']);
    expect(records[0]).toMatchObject({
      operationId,
      resultHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      toolCallId: 'tc_1',
    });
    expect(records[0].results).toHaveLength(2);
  });
});

/**
 * SC-SB06/P1-A — invocation identity. Same protocol request resend reuses
 * the persisted id; a genuinely new same-args call mints a fresh one; the
 * args hash only validates content consistency, never replaces identity.
 */
describe('resolvePersistentToolCallId', () => {
  let homeDirName: string;

  beforeEach(() => {
    homeDirName = `.orvilo-inbox-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
    process.env.ORVILO_CLI_HOME = homeDirName;
  });

  afterEach(async () => {
    delete process.env.ORVILO_CLI_HOME;
    await rm(path.join(os.homedir(), homeDirName), { force: true, recursive: true });
  });

  const call = (requestKey?: string, argsHash = 'hash_a') => ({
    apiName: 'spawn',
    argsHash,
    identifier: 'orvilo-agent',
    operationId: 'op_inv',
    requestKey,
  });

  it('D01: a transport resend reuses the persisted id; a new request mints a fresh one', async () => {
    const first = await resolvePersistentToolCallId(call('req-1'));
    const resent = await resolvePersistentToolCallId(call('req-1'));
    expect(resent).toBe(first);

    const second = await resolvePersistentToolCallId(call('req-2'));
    expect(second).not.toBe(first);
    expect(first).toMatch(/^mcp_[0-9a-f]{48}$/);
    expect(second).toMatch(/^mcp_[0-9a-f]{48}$/);
  });

  it('D01: identical args under a NEW request key is a new invocation, not a replay', async () => {
    const first = await resolvePersistentToolCallId(call('req-1', 'same_args'));
    const second = await resolvePersistentToolCallId(call('req-2', 'same_args'));
    expect(second).not.toBe(first);
  });

  it('D01: a request key rebound to different args resolves both occurrences distinctly', async () => {
    // A transport that recycles its request id for different content cannot
    // claim the first binding — the args hash separates them.
    const original = await resolvePersistentToolCallId(call('req-1', 'hash_a'));
    const rebound = await resolvePersistentToolCallId(call('req-1', 'hash_b'));
    expect(rebound).not.toBe(original);
    // And both stay resend-stable.
    expect(await resolvePersistentToolCallId(call('req-1', 'hash_a'))).toBe(original);
    expect(await resolvePersistentToolCallId(call('req-1', 'hash_b'))).toBe(rebound);
  });

  it('D01: a call with no request identity is always a fresh occurrence', async () => {
    const first = await resolvePersistentToolCallId(call(undefined));
    const second = await resolvePersistentToolCallId(call(undefined));
    expect(first).toMatch(/^mcp_[0-9a-f]{48}$/);
    expect(second).toMatch(/^mcp_[0-9a-f]{48}$/);
    expect(second).not.toBe(first);
  });
});
