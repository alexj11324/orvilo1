/**
 * Intent-bound operation ids for review writes.
 *
 * The write contract needs one stable operationId per *intent* — the same
 * logical write retried after a failure, a reconnect, or a page refresh must
 * replay under the same id so the server can dedupe or reconcile it, while a
 * genuinely different intent (edited body, different thread, new head) must
 * never reuse one. Deriving the id from the intent itself instead of
 * `crypto.randomUUID()` per click gives both properties without extra state.
 */

export type ReviewWriteAction = 'addFileComment' | 'replyToThread' | 'submitReview';

/** Every field that makes one review write distinct from another. */
export interface ReviewWriteIntent {
  action: ReviewWriteAction;
  body: string;
  event?: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';
  headSha: string | null;
  line?: number;
  path?: string;
  pullRequestId: string;
  reviewSessionId?: string | null;
  side?: 'LEFT' | 'RIGHT';
  snapshotId: string;
  threadId?: string;
  viewerLogin?: string | null;
  workspaceId: string | null;
}

// FNV-1a (64-bit) — synchronous, dependency-free; collision scope is the
// user's own write intents, where a collision surfaces as a server-side
// OPERATION_CONFLICT rather than a duplicate write.
const fnv1a64 = (value: string): string => {
  let hash = 0xcb_f2_9c_e4_84_22_23_25n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x1_00_00_00_01_b3n);
  }
  return hash.toString(16).padStart(16, '0');
};

/**
 * The operationId for one write intent. Deterministic: the same fields
 * produce the same id across retries and remounts, and any field change —
 * head drift, a different review session, an edited body — produces a new
 * operation rather than a payload conflict on the old one.
 */
export const reviewOperationId = (intent: ReviewWriteIntent): string =>
  `ri_${fnv1a64(
    // JSON.stringify is injective over the field array — unlike a plain
    // separator join, fields containing whitespace or quotes cannot collide.
    JSON.stringify([
      intent.workspaceId ?? '',
      intent.pullRequestId,
      intent.headSha ?? '',
      intent.snapshotId,
      intent.viewerLogin ?? '',
      intent.reviewSessionId ?? '',
      intent.action,
      intent.event ?? '',
      intent.threadId ?? '',
      intent.path ?? '',
      intent.line == null ? '' : String(intent.line),
      intent.side ?? '',
      intent.body,
    ]),
  )}`;
