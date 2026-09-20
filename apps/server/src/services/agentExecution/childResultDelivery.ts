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
