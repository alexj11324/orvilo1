import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, truncate } from 'node:fs/promises';
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

const withFileLock = <T>(filePath: string, fn: () => Promise<T>): Promise<T> => {
  const queued = (fileLocks.get(filePath) ?? Promise.resolve()).then(fn, fn);
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
 * Repair an unterminated tail left by a crash mid-append. A tail that still
 * parses as a complete record is re-framed canonically; dead bytes are
 * truncated. Without this the next append would fuse onto the torn line and
 * corrupt BOTH records — the exact SC-SB06 failure.
 */
const repairTail = async (filePath: string): Promise<void> => {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return;
  }
  if (raw.length === 0 || raw.endsWith('\n')) return;
  const boundary = raw.lastIndexOf('\n') + 1;
  const tail = raw.slice(boundary);
  const salvaged = decodeLine(tail);
  await truncate(filePath, boundary);
  if (salvaged !== undefined) await appendRecord(filePath, salvaged);
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
   * request identity reached this layer — the call is always fresh.
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
