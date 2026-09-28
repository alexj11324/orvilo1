import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('R5-SC04: a torn tail after a Unicode frame is repaired at the byte boundary', async () => {
    const operationId = 'op_unicode_tail';
    // Multi-byte content makes the complete frame's BYTE length exceed its
    // UTF-16 code-unit length — the exact R5 failure mode, where a code-unit
    // boundary fed to truncate() cut inside the complete record's bytes.
    await persistChildResultInboxRecord({
      deliveries: [{ childOperationId: 'c_e_uni', eventId: 'e_uni' }],
      operationId,
      results: [
        {
          content: '中文内容与 emoji 🚀✅ —— 多字节字符让代码单元数不等于字节数',
          operationId: 'c_e_uni',
          status: 'done',
        },
      ],
      toolCallId: 'tc_1',
    });
    const file = inboxFile(operationId);
    const completeFrame = await readFile(file);
    // A crash mid-append leaves a torn second frame behind the intact first.
    const torn = Buffer.from('{"body":"{\\"deliveries\\":[{\\"eventId\\":\\"e_torn_', 'utf8');
    await writeFile(file, Buffer.concat([completeFrame, torn]));

    await persistChildResultInboxRecord(settleInput(['e_new'], operationId));

    const after = await readFile(file);
    expect(after.subarray(0, completeFrame.length)).toEqual(completeFrame);
    for (const line of after.toString('utf8').split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const ids = eventIdsIn(await readChildResultInboxRecords(operationId));
    expect(ids).toContain('e_uni');
    expect(ids).toContain('e_new');
  });

  it('R5-SC04: a Unicode record survives a tail torn at EVERY byte offset', async () => {
    const operationId = 'op_torn_bytes';
    await persistChildResultInboxRecord({
      deliveries: [{ childOperationId: 'c_e_stable', eventId: 'e_stable' }],
      operationId,
      results: [
        { content: '稳定记录：中文 + emoji 🧪', operationId: 'c_e_stable', status: 'done' },
      ],
      toolCallId: 'tc_1',
    });
    const file = inboxFile(operationId);
    const prefix = await readFile(file);
    // The victim frame as raw bytes — a crash can cut it mid-UTF-8 sequence,
    // so the cut position is stepped by BYTES, not code units.
    const victimBody = JSON.stringify({
      deliveries: [{ childOperationId: 'c_e_torn', eventId: 'e_torn' }],
      operationId,
      recordedAt: 1_700_000_000_000,
      resultHash: 'x'.repeat(64),
      results: [{ content: '断尾帧 🪓', operationId: 'c_e_torn', status: 'done' }],
      toolCallId: 'tc_1',
    });
    const victim = Buffer.from(
      `${JSON.stringify({
        body: victimBody,
        crc: createHash('sha256').update(victimBody).digest('hex'),
      })}\n`,
      'utf8',
    );

    for (let keep = 0; keep <= victim.length; keep += 1) {
      await writeFile(file, Buffer.concat([prefix, victim.subarray(0, keep)]));
      await persistChildResultInboxRecord(settleInput([`e_b${keep}`], operationId));

      const raw = await readFile(file);
      for (const line of raw.toString('utf8').split('\n').filter(Boolean)) {
        expect(() => JSON.parse(line), `unparseable line after byte cut ${keep}`).not.toThrow();
      }
      const ids = eventIdsIn(await readChildResultInboxRecords(operationId));
      expect(ids).toContain('e_stable');
      expect(ids).toContain(`e_b${keep}`);
    }
  }, 60_000);

  it('R5-SC04: corrupt content ahead of the tail is left fail-closed, never rewritten', async () => {
    const operationId = 'op_front_corrupt';
    await persistChildResultInboxRecord(settleInput(['e_first'], operationId));
    await persistChildResultInboxRecord(settleInput(['e_second'], operationId));
    const file = inboxFile(operationId);
    const onDisk = await readFile(file);
    const firstNl = onDisk.indexOf(0x0a);
    const frame1 = onDisk.subarray(0, firstNl + 1);
    const frame2 = onDisk.subarray(firstNl + 1);

    // Splice a frame-shaped but crc-invalid line between the good frames,
    // plus a torn tail. Repair must only touch the tail.
    const corrupt = Buffer.from('{"body":"{}","crc":"deadbeef"}', 'utf8');
    const torn = Buffer.from('{"body":"{"deliv', 'utf8');
    await writeFile(
      file,
      Buffer.concat([frame1, corrupt, Buffer.from('\n', 'utf8'), frame2, torn]),
    );

    await persistChildResultInboxRecord(settleInput(['e_new'], operationId));

    const lines = (await readFile(file)).toString('utf8').split('\n');
    expect(lines[1]).toBe('{"body":"{}","crc":"deadbeef"}');
    const ids = eventIdsIn(await readChildResultInboxRecords(operationId));
    expect(ids).toEqual(expect.arrayContaining(['e_first', 'e_second', 'e_new']));
    expect(ids).toHaveLength(3);
  });

  it('R5-SC04: writers with independent lock tables serialize through the on-disk lock', async () => {
    const operationId = 'op_xlocks';
    await persistChildResultInboxRecord(settleInput(['e_base'], operationId));
    const file = inboxFile(operationId);
    const prefix = await readFile(file);
    await writeFile(file, Buffer.concat([prefix, Buffer.from('{"body":"{"torn')]));

    // A fresh module instance = a second process's in-process lock map: only
    // the on-disk lockfile can serialize its repair+append against ours.
    vi.resetModules();
    const peer = await import('./childResultInbox');

    await Promise.all([
      ...Array.from({ length: 4 }, (_, index) =>
        persistChildResultInboxRecord(settleInput([`e_a${index}`], operationId)),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        peer.persistChildResultInboxRecord(settleInput([`e_b${index}`], operationId)),
      ),
    ]);

    const raw = await readFile(file);
    for (const line of raw.toString('utf8').split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const ids = eventIdsIn(await readChildResultInboxRecords(operationId));
    for (let index = 0; index < 4; index += 1) {
      expect(ids).toContain(`e_a${index}`);
      expect(ids).toContain(`e_b${index}`);
    }
    expect(ids).toContain('e_base');
  });

  it('R5-SC04: a lockfile left by a dead holder is reclaimed by token match', async () => {
    const operationId = 'op_stale_lock';
    await persistChildResultInboxRecord(settleInput(['e_seed'], operationId));
    const file = inboxFile(operationId);

    // A real (now-dead) pid owns the stale lock — reclamation must verify
    // liveness AND token, not mtime alone.
    const deadPid = spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid;
    await writeFile(`${file}.lock`, `${deadPid}:dead-token`);

    await persistChildResultInboxRecord(settleInput(['e_after'], operationId));
    expect(eventIdsIn(await readChildResultInboxRecords(operationId))).toEqual(
      expect.arrayContaining(['e_seed', 'e_after']),
    );
  });

  const bunAvailable = spawnSync('bun', ['--version'], { timeout: 10_000 }).status === 0;
  it.runIf(bunAvailable)(
    'R5-SC04: real concurrent processes serialize repair + append via the lockfile',
    async () => {
      const operationId = 'op_xproc';
      await persistChildResultInboxRecord(settleInput(['e_seed'], operationId));
      const file = inboxFile(operationId);
      const prefix = await readFile(file);
      await writeFile(file, Buffer.concat([prefix, Buffer.from('{"body":"{"torn')]));

      const modulePath = fileURLToPath(new URL('./childResultInbox.ts', import.meta.url));
      const workers = Array.from({ length: 4 }, (_, index) => {
        const tag = `p${index}`;
        const script = `(async () => {
          const m = await import(${JSON.stringify(modulePath)});
          for (let i = 0; i < 3; i += 1) {
            await m.persistChildResultInboxRecord({
              deliveries: [{ childOperationId: 'c_${tag}_' + i, eventId: 'e_${tag}_' + i }],
              operationId: ${JSON.stringify(operationId)},
              results: [{ content: 'r' + i, operationId: 'c_${tag}_' + i, status: 'done' }],
              toolCallId: 'tc_${tag}',
            });
          }
        })().catch((error) => { console.error(error); process.exit(1); });`;
        return new Promise<void>((resolve, reject) => {
          const child = spawn('bun', ['-e', script], {
            env: { ...process.env, ORVILO_CLI_HOME: homeDirName },
          });
          let stderr = '';
          child.stderr.on('data', (chunk) => {
            stderr += chunk;
          });
          child.on('error', reject);
          child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`worker ${tag} exited ${code}: ${stderr}`)),
          );
        });
      });
      await Promise.all(workers);

      const raw = await readFile(file);
      for (const line of raw.toString('utf8').split('\n').filter(Boolean)) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
      const ids = eventIdsIn(await readChildResultInboxRecords(operationId));
      expect(ids).toContain('e_seed');
      for (let index = 0; index < 4; index += 1) {
        for (let i = 0; i < 3; i += 1) expect(ids).toContain(`e_p${index}_${i}`);
      }
    },
    60_000,
  );
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
