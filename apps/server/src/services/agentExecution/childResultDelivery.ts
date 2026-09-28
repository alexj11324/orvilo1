/**
 * Durable child-result delivery ledger helpers.
 *
 * Every forked child op (sub-agent, group member) that a parent awaits gets a
 * dedupe-stable `event_outbox` row: `pending` once the completion bridge has
 * persisted the result (`persisted`), `delivered` once a consumer has handed
 * it to the parent (`consumed`). The `eventId` is the dedupe key —
 * parent/child/toolCall/generation — so Hatchet/webhook redeliveries and
 * late completions from a superseded parent generation are no-ops, and a
 * parked-busy parent accumulates results durably instead of relying on a live
 * poller.
 */
export const CHILD_RESULT_EVENT_TYPE = 'agent_operation.child_result';

/**
 * Delivery state machine for a child-result receipt (SA04/F06):
 * - `received` — the completion bridge committed the result into the ledger;
 * - `offered` — the parent await settled and handed the result to the host
 *   (the HTTP/MCP response may still be lost in flight — this is NOT consume);
 * - `acked` — the parent-side durable inbox acknowledged the delivery; the
 *   ONLY state that marks consumption;
 * - `superseded` — the anchor's generation went terminal under a different
 *   event id; the row is terminal and never consumed.
 *
 * The ledger row's `status` stays `pending` until `acked`/`superseded`; the
 * sweep shield is `nextAttemptAt` = `deadlineAt` (see {@link CHILD_RESULT_RECEIPT_TTL_MS}),
 * so the room projector cannot flip a live receipt to `delivered` early.
 */
export type ChildResultDeliveryState = 'acked' | 'offered' | 'received' | 'superseded';

/**
 * Persisted deadline every delegation receipt carries: results committed
 * longer than this ago are no longer offerable — the parent polls its own
 * deadline, so a receipt outliving any possible consumer is inspection noise.
 */
export const CHILD_RESULT_RECEIPT_TTL_MS = 60 * 60 * 1000;

export interface ChildResultDedupeParts {
  childOperationId: string;
  /** Parent `appContext.executionGeneration` — separates re-dispatch waves. */
  generation?: number;
  parentOperationId: string;
  /** The parked attempt's tool-call id that forked this child. */
  toolCallId?: string;
}

export const childResultEventId = (parts: ChildResultDedupeParts): string =>
  [
    'child-result',
    parts.parentOperationId,
    parts.childOperationId,
    parts.toolCallId ?? '',
    String(parts.generation ?? 0),
  ].join(':');

/**
 * Tool-call ids a deferred orchestration call owns: the call's own id plus
 * `::<m<index>>` member anchors (`call` → `call::m1`, `call::m2`, ...). The
 * anchored suffix matters — a bare `LIKE '<id>%'` sweep matches OTHER calls
 * whose ids merely share a prefix, settling placeholders that don't belong
 * to this invocation.
 */
export const isOwnedToolCallId = (candidate: string | null | undefined, toolCallId: string) => {
  if (!candidate) return false;
  if (candidate === toolCallId) return true;
  return (
    candidate.startsWith(`${toolCallId}::`) && /^::m\d+$/.test(candidate.slice(toolCallId.length))
  );
};
