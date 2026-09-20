import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveCliDirName } from '../constants/identity';

const INBOX_DIR_NAME = 'inbox';

/**
 * Receiver-side durable inbox for child-operation results (SA04-A).
 *
 * Layout:
 *
 *   ~/.orvilo/inbox/<operationId>.jsonl   one record per accepted settle
 *
 * Each record persists the delivery event ids plus the full result payload
 * and a content hash. Records are appended BEFORE the server ack is sent, so
 * a crash anywhere between "results received" and "ack consumed" leaves the
 * delivery replayable — the next settle re-offers the same event ids, this
 * file already knows them, and the retried call reuses the same stable
 * invocation id (no second side effect).
 */
export interface ChildResultInboxInput {
  deliveries: Array<{ childOperationId: string; eventId: string }>;
  operationId: string;
  results: Array<{ content?: string; error?: string; operationId: string; status: string }>;
  toolCallId: string;
}

export const resolveInboxDir = (): string =>
  path.join(os.homedir(), resolveCliDirName(), INBOX_DIR_NAME);

const inboxFileFor = (operationId: string): string =>
  path.join(resolveInboxDir(), `${operationId.replaceAll(/[^\w-]/g, '_')}.jsonl`);

const readKnownEventIds = async (filePath: string): Promise<Set<string>> => {
  const known = new Set<string>();
  let existing: string;
  try {
    existing = await readFile(filePath, 'utf8');
  } catch {
    return known;
  }
  for (const line of existing.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { deliveries?: Array<{ eventId?: string }> };
      for (const delivery of record.deliveries ?? []) {
        if (typeof delivery.eventId === 'string') known.add(delivery.eventId);
      }
    } catch {
      // A torn last line (crash mid-append) is ignored — the delivery ids it
      // may have carried are simply recorded again below.
    }
  }
  return known;
};

/**
 * Append the settled deliveries + results to the operation's inbox file.
 * Idempotent per `eventId` — a settle replayed after a crash re-offers the
 * same receipts and must not double-record. Throws on IO failure so the
 * caller can surface the error instead of acknowledging what was never
 * durably received.
 */
export const persistChildResultInboxRecord = async (
  input: ChildResultInboxInput,
): Promise<void> => {
  const dir = resolveInboxDir();
  await mkdir(dir, { recursive: true });
  const filePath = inboxFileFor(input.operationId);

  const known = await readKnownEventIds(filePath);
  const fresh = input.deliveries.filter((delivery) => !known.has(delivery.eventId));
  if (fresh.length === 0) return;

  const record = {
    deliveries: fresh,
    operationId: input.operationId,
    recordedAt: Date.now(),
    resultHash: createHash('sha256').update(JSON.stringify(input.results)).digest('hex'),
    results: input.results,
    toolCallId: input.toolCallId,
  };
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
};
