import { createHash, randomBytes } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveCliDirName } from '../constants/identity';

const INBOX_DIR_NAME = 'inbox';

/**
 * Receiver-side durable inbox for child-operation results (SA04-A, hardened
 * in SC-SB06), plus the persisted transport-retry map for invocation ids.
 *
 * Layout:
 *
 *   ~/.orvilo/inbox/<operationId>.jsonl        one record per accepted settle
 *   ~/.orvilo/inbox/<operationId>.calls.jsonl  requestKey → toolCallId map
 *
 * Every line is a self-verifying frame `{body, crc}` where `crc` is the
 * sha256 of the exact payload bytes — a torn tail can never be mistaken for
 * a complete record, and on append the unterminated tail is repaired (a
 * still-parseable record is re-framed, dead bytes are truncated) BEFORE the
 * new frame is written, under a per-file write lock. Records are appended
 * BEFORE the server ack is sent, so a crash anywhere between "results
 * received" and "ack consumed" leaves the delivery replayable — the next
 * settle re-offers the same event ids, this file already knows them, and
 * the retried call reuses the same stable invocation id (no second side
 * effect).
 */
export interface ChildResultInboxInput {
  deliveries: Array<{ childOperationId: string; eventId: string }>;
  operationId: string;
  results: Array<{ content?: string; error?: string; operationId: string; status: string }>;
  toolCallId: string;
}

/** One durably-recorded settle — what the recovery reader replays. */
export interface ChildResultInboxRecord {
  deliveries: Array<{ childOperationId: string; eventId: string }>;
  operationId: string;
  recordedAt: number;
  resultHash: string;
  results: Array<{ content?: string; error?: string; operationId: string; status: string }>;
  toolCallId: string;
}

export const resolveInboxDir = (): string =>
  path.join(os.homedir(), resolveCliDirName(), INBOX_DIR_NAME);

const safeOperationId = (operationId: string): string => operationId.replaceAll(/[^\w-]/g, '_');

const inboxFileFor = (operationId: string): string =>
  path.join(resolveInboxDir(), `${safeOperationId(operationId)}.jsonl`);

const callsFileFor = (operationId: string): string =>
  path.join(resolveInboxDir(), `${safeOperationId(operationId)}.calls.jsonl`);

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

// ─── framed append store ────────────────────────────────────────────────────

const encodeFrame = (record: Record<string, unknown>): string => {
  const body = JSON.stringify(record);
  return `${JSON.stringify({ body, crc: sha256Hex(body) })}\n`;
};

/**
 * Decode one line. Framed records verify their checksum; a bare JSON object
 * is a legacy pre-frame record and is still adopted (a rolled-forward reader
 * must understand data written by the previous version). Anything else —
 * torn or spliced bytes — decodes to undefined and is never trusted.
 */
const decodeLine = (line: string): Record<string, unknown> | undefined => {
  if (!line.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const frame = parsed as { body?: unknown; crc?: unknown };
  if (typeof frame.body === 'string' && typeof frame.crc === 'string') {
    if (sha256Hex(frame.body) !== frame.crc) return undefined;
    try {
      const record = JSON.parse(frame.body) as unknown;
      return record && typeof record === 'object' && !Array.isArray(record)
        ? (record as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
  return parsed as Record<string, unknown>;
};

/**
 * In-process write lock per file — repair/read/append must be serialized or
 * two writers could interleave frames or both "repair" the same tail.
 */
const fileLocks = new Map<string, Promise<unknown>>();

const LOCK_RETRY_MS = 25;
/** A wedged holder blocks callers at most this long — then the call fails closed. */
const LOCK_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the holder exists but belongs to another user — liveness cannot
    // be confirmed, so it is treated as alive (block, never steal).
    return (error as NodeJS.ErrnoException)?.code === 'EPERM';
  }
};

/**
 * Take over a lock whose holder is provably dead. A single-writer ticket
 * (`<lock>.reclaim`, O_EXCL) arbitrates between reclaimers so the
 * verify-then-replace section is held by at most one; the winner re-checks
 * the lock still carries the dead record, then `rename`s its own token onto
 * the lock path — the path never goes absent, so no new owner can land in a
 * check-to-unlink gap. Returns true when this caller became the owner.
 */
const takeOverDeadFileLock = async (
  lockPath: string,
  deadRecord: string,
  token: string,
): Promise<boolean> => {
  const ticketPath = `${lockPath}.reclaim`;
  try {
    await writeFile(ticketPath, token, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
    // Another reclaimer holds the ticket. A dead ticket holder's stale ticket
    // is cleared by the same verified-unlink rule — losing a ticket only
    // costs the holder a retry, its pre-rename token check catches it.
    const holder = await readFile(ticketPath, 'utf8').catch(() => undefined);
    const holderPid = holder === undefined ? Number.NaN : Number.parseInt(holder, 10);
    if (Number.isInteger(holderPid) && holderPid > 0 && !isProcessAlive(holderPid)) {
      const current = await readFile(ticketPath, 'utf8').catch(() => undefined);
      if (current === holder) await rm(ticketPath, { force: true });
    }
    return false;
  }
  try {
    const now = await readFile(lockPath, 'utf8').catch(() => undefined);
    const stillMine = (await readFile(ticketPath, 'utf8').catch(() => undefined)) === token;
    if (now === undefined || now !== deadRecord || !stillMine) return false;
    await rename(ticketPath, lockPath);
    return (await readFile(lockPath, 'utf8').catch(() => undefined)) === token;
  } finally {
    const current = await readFile(ticketPath, 'utf8').catch(() => undefined);
    if (current === token) await rm(ticketPath, { force: true });
  }
};

/**
 * Cross-process mutex for one inbox file (the `<file>.lock` sibling). Every
 * writer — repair, dedupe read, append — runs inside it, so separate CLI
 * processes sharing the same inbox directory can never interleave a
 * truncate with an append.
 *
 * Acquisition is an atomic O_EXCL create. The `<pid>:<token>` payload makes
 * ownership verifiable in both directions: release removes the lock only
 * while it still carries OUR token, and a dead holder's lock is taken over
 * only while it still carries that dead token — never a fresh owner's.
 * Liveness is `kill(pid, 0)`; a holder that cannot be proven dead blocks
 * callers until LOCK_TIMEOUT_MS rather than being stolen from (fail-closed).
 */
const acquireFileLock = async (filePath: string): Promise<() => Promise<void>> => {
  const lockPath = `${filePath}.lock`;
  await mkdir(path.dirname(lockPath), { recursive: true });
  const token = `${process.pid}:${randomBytes(8).toString('hex')}`;
  const started = Date.now();
  for (;;) {
    try {
      await writeFile(lockPath, token, { flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      const existing = await readFile(lockPath, 'utf8').catch(() => undefined);
      if (existing === undefined) continue;
      const ownerPid = Number.parseInt(existing, 10);
      const deadHolder = Number.isInteger(ownerPid) && ownerPid > 0 && !isProcessAlive(ownerPid);
      // Dead holder — take over under the single-writer reclaim ticket
      // rather than unlinking a lock a fresh owner may already hold.
      if (deadHolder && (await takeOverDeadFileLock(lockPath, existing, token))) break;
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out acquiring inbox file lock ${lockPath}`, { cause: error });
      }
      await sleep(LOCK_RETRY_MS / 2 + Math.random() * LOCK_RETRY_MS);
    }
  }
  return async () => {
    const current = await readFile(lockPath, 'utf8').catch(() => undefined);
    if (current === token) await rm(lockPath, { force: true });
  };
};

const withFileLock = <T>(filePath: string, fn: () => Promise<T>): Promise<T> => {
  const exclusive = async (): Promise<T> => {
    const release = await acquireFileLock(filePath);
    try {
      return await fn();
    } finally {
      await release();
    }
  };
  const queued = (fileLocks.get(filePath) ?? Promise.resolve()).then(exclusive, exclusive);
  fileLocks.set(
    filePath,
    queued.then(
      () => undefined,
      () => undefined,
    ),
  );
  return queued;
};

/** Append one framed record and fsync — "persisted" means past the page cache. */
const appendRecord = async (filePath: string, record: Record<string, unknown>): Promise<void> => {
  const handle = await open(filePath, 'a');
  try {
    await handle.appendFile(encodeFrame(record), 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/**
 * Repair an unterminated tail left by a crash mid-append. The file is
 * scanned as BYTES: 0x0A can never appear inside a multi-byte UTF-8
 * sequence, so the last newline byte is a byte-exact frame boundary that
 * `truncate` accepts directly — a UTF-16 code-unit index would cut inside a
 * complete record's bytes whenever earlier frames carry CJK/emoji (the R5
 * SC04 failure). A tail that still parses as a complete record is re-framed
 * canonically; dead bytes are truncated. Only the final unterminated span
 * is touched — corrupt content ahead of it is left for the fail-closed
 * reader, never rewritten. Without this the next append would fuse onto the
 * torn line and corrupt BOTH records — the exact SC-SB06 failure.
 */
const repairTail = async (filePath: string): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let raw: Buffer;
    try {
      raw = await readFile(filePath);
    } catch {
      return;
    }
    if (raw.length === 0 || raw.at(-1) === 0x0a) return;
    const boundary = raw.lastIndexOf(0x0a) + 1;
    const salvaged = decodeLine(raw.subarray(boundary).toString('utf8'));

    let handle: FileHandle;
    try {
      handle = await open(filePath, 'r+');
    } catch {
      return;
    }
    let repaired = false;
    try {
      // Truncate is byte-exact only if the file is still exactly what was
      // scanned — otherwise rescan rather than cut a late-arriving append.
      if ((await handle.stat()).size === raw.length) {
        await handle.truncate(boundary);
        // fsync before the repair counts as done — and before any ack the
        // caller may send afterwards — so a crash cannot resurrect the tail.
        await handle.sync();
        repaired = true;
      }
    } finally {
      await handle.close();
    }
    if (repaired) {
      if (salvaged !== undefined) await appendRecord(filePath, salvaged);
      return;
    }
  }
  throw new Error(`child-result inbox tail did not stabilize for repair: ${filePath}`);
};

const readRecords = async (filePath: string): Promise<Record<string, unknown>[]> => {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  // A trailing unterminated line still yields to split — decodeLine salvages
  // it when the bytes happen to form a complete record.
  for (const line of raw.split('\n')) {
    const record = decodeLine(line);
    if (record !== undefined) records.push(record);
  }
  return records;
};

const eventIdsOf = (record: Record<string, unknown>): string[] => {
  if (!Array.isArray(record.deliveries)) return [];
  return record.deliveries.flatMap((delivery) =>
    delivery && typeof delivery === 'object' && typeof delivery.eventId === 'string'
      ? [delivery.eventId]
      : [],
  );
};

const isInboxRecord = (record: Record<string, unknown>): record is ChildResultInboxRecord =>
  Array.isArray(record.deliveries) &&
  Array.isArray(record.results) &&
  typeof record.resultHash === 'string' &&
  typeof record.toolCallId === 'string';

/**
 * Real recovery reader (SC-SB06): replays every durably-persisted settle for
 * the operation — complete-but-unacked results the next run must re-ack —
 * ignoring only genuinely torn/corrupt bytes.
 */
export const readChildResultInboxRecords = async (
  operationId: string,
): Promise<ChildResultInboxRecord[]> => {
  const filePath = inboxFileFor(operationId);
  return withFileLock(filePath, async () => {
    const records = await readRecords(filePath);
    return records.filter(isInboxRecord);
  });
};

/**
 * Append the settled deliveries + results to the operation's inbox file.
 * Idempotent per `eventId` — a settle replayed after a crash re-offers the
 * same receipts and must not double-record. A replayed eventId carrying a
 * DIFFERENT result payload than the recorded one is a corruption/replay
 * violation and is refused, never silently deduped. Throws on IO failure so
 * the caller can surface the error instead of acknowledging what was never
 * durably received.
 */
export const persistChildResultInboxRecord = async (
  input: ChildResultInboxInput,
): Promise<void> => {
  const dir = resolveInboxDir();
  await mkdir(dir, { recursive: true });
  const filePath = inboxFileFor(input.operationId);
  const resultHash = sha256Hex(JSON.stringify(input.results));

  await withFileLock(filePath, async () => {
    // Repair BEFORE dedupe-check + append: a torn tail must never fuse with
    // the frame being written.
    await repairTail(filePath);
    const records = await readRecords(filePath);
    const storedHashByEventId = new Map<string, string>();
    for (const record of records) {
      const storedHash = typeof record.resultHash === 'string' ? record.resultHash : '';
      for (const eventId of eventIdsOf(record)) storedHashByEventId.set(eventId, storedHash);
    }
    for (const delivery of input.deliveries) {
      const storedHash = storedHashByEventId.get(delivery.eventId);
      if (storedHash === undefined) continue;
      if (storedHash !== resultHash) {
        throw new Error(
          `Child-result inbox refuses '${delivery.eventId}': replayed results diverge from the recorded resultHash`,
        );
      }
    }

    const fresh = input.deliveries.filter((delivery) => !storedHashByEventId.has(delivery.eventId));
    if (fresh.length === 0) return;

    await appendRecord(filePath, {
      deliveries: fresh,
      operationId: input.operationId,
      recordedAt: Date.now(),
      resultHash,
      results: input.results,
      toolCallId: input.toolCallId,
    });
  });
};

// ─── persistent invocation-identity map (SC-SB06 P1-A) ──────────────────────

export interface ResolveInvocationCallInput {
  apiName: string;
  /**
   * sha256 over the canonical call payload — a content-consistency check
   * only. It can distinguish two different calls that recycled the same
   * request key, but must NEVER stand in for occurrence identity.
   */
  argsHash: string;
  identifier: string;
  operationId: string;
  /**
   * Per-request identity from the MCP transport (e.g. `_meta.progressToken`).
   * A resend of the same protocol request carries the same key and resolves
   * to the persisted id; a new key is a new occurrence. `undefined` means no
   * request identity reached this layer — the call mints a random fresh id
   * which is deliberately NOT replay-stable across restarts: without a
   * transport-supplied key a resend cannot be matched, so it is always a new
   * occurrence rather than a claimed replay of an earlier one.
   */
  requestKey?: string;
}

const mintInvocationId = (): string => `mcp_${randomBytes(24).toString('hex')}`;

/**
 * Resolve the stable toolCallId for one logical invocation. The durable
 * `<operationId>.calls.jsonl` map makes a transport resend reuse the FIRST
 * id while every genuinely new occurrence mints a fresh one — two
 * same-args calls can never share the first call's spent approval.
 */
export const resolvePersistentToolCallId = async (
  input: ResolveInvocationCallInput,
): Promise<string> => {
  if (input.requestKey === undefined) return mintInvocationId();
  const dir = resolveInboxDir();
  await mkdir(dir, { recursive: true });
  const filePath = callsFileFor(input.operationId);

  return withFileLock(filePath, async () => {
    await repairTail(filePath);
    const records = await readRecords(filePath);
    const binding = records.find(
      (record) => record.requestKey === input.requestKey && record.argsHash === input.argsHash,
    );
    if (binding !== undefined && typeof binding.toolCallId === 'string') {
      return binding.toolCallId;
    }
    const toolCallId = mintInvocationId();
    await appendRecord(filePath, {
      apiName: input.apiName,
      argsHash: input.argsHash,
      identifier: input.identifier,
      operationId: input.operationId,
      recordedAt: Date.now(),
      requestKey: input.requestKey,
      toolCallId,
    });
    return toolCallId;
  });
};
