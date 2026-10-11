import type { TaskDispatchPhase } from '@orvilo/types';

/**
 * Why work that was asked for has not started, as the server reports it.
 *
 * Two independent signals, and neither is the other:
 * - `orchestrationAdmission` is the current gate for NEW automatic dispatches
 *   in this workspace, computed for the person viewing. It says nothing about
 *   runs already in flight. Automatic intake is admitted under a different
 *   identity, so this value can read `enabled` while a dispatch still waits on
 *   admission.
 * - `dispatchWaitingReason` is the reason persisted on the active dispatch. It
 *   can outlive its cause: a dispatch held while admission was closed keeps
 *   that reason until the next sweep re-drives it.
 *
 * So one line is shown, the most specific one that is true: the dispatch's own
 * reason when it has one; otherwise the admission line while the gate is
 * closed. A dispatch still waiting on admission while the gate reads open is
 * neither hidden nor described as the current workspace state — it says what
 * held it.
 */

type OrchestrationAdmission = 'enabled' | 'disabled';

export const ADMISSION_DISABLED_REASON = 'caid_dispatch_disabled';

export interface DispatchNoticeCopy {
  key: string;
  params?: Record<string, string>;
}

export const GOAL_DISPATCH_HELD_KEY = 'goalProcess.frontier.dispatchHeld';
export const ISSUE_DISPATCH_HELD_KEY = 'taskDetail.dispatchNotice.admissionDisabled';
export const ISSUE_DISPATCH_HELD_EARLIER_KEY = 'taskDetail.dispatchNotice.heldByAdmission';

/** Older payloads carry no admission field; absent never reads as closed. */
export const isOrchestrationHeld = (admission?: OrchestrationAdmission | null): boolean =>
  admission === 'disabled';

/** Goal statuses with nothing left to dispatch — the notice would describe nothing. */
const CLOSED_GOAL_STATUSES = new Set(['achieved', 'canceled', 'failed']);

export const resolveGoalDispatchNotice = (input: {
  goalStatus: string;
  orchestrationAdmission?: OrchestrationAdmission | null;
}): DispatchNoticeCopy | undefined => {
  if (!isOrchestrationHeld(input.orchestrationAdmission)) return undefined;
  if (CLOSED_GOAL_STATUSES.has(input.goalStatus)) return undefined;
  return { key: GOAL_DISPATCH_HELD_KEY };
};

/**
 * Stable machine reasons the dispatch layer persists. Anything else is either
 * an internal code or server-authored prose and renders verbatim.
 */
const WAITING_REASON_KEYS: Record<string, string> = {
  execution_agent_missing: 'taskDetail.dispatchNotice.reason.noAgent',
  goal_paused: 'taskDetail.dispatchNotice.reason.goalPaused',
  no_eligible_agent: 'taskDetail.dispatchNotice.reason.noAgent',
};

/** A dispatch that exists but has not been picked up by any runtime yet. */
const isNotStarted = (phase?: TaskDispatchPhase | null): boolean =>
  phase === 'requested' || phase === 'waiting';

export const resolveIssueDispatchNotices = (input: {
  dispatchPhase?: TaskDispatchPhase | null;
  dispatchWaitingReason?: string | null;
  orchestrationAdmission?: OrchestrationAdmission | null;
}): DispatchNoticeCopy[] => {
  if (!isNotStarted(input.dispatchPhase)) return [];

  // A persisted reason describes the dispatch only while it is still waiting.
  const reason =
    input.dispatchPhase === 'waiting'
      ? input.dispatchWaitingReason?.trim() || undefined
      : undefined;

  // The dispatch's own reason is the whole explanation: a run waiting for an
  // agent is not waiting on workspace admission, whatever the gate reads.
  if (reason && reason !== ADMISSION_DISABLED_REASON) {
    const key = WAITING_REASON_KEYS[reason];
    return [key ? { key } : { key: 'taskDetail.dispatchNotice.reason.other', params: { reason } }];
  }

  if (isOrchestrationHeld(input.orchestrationAdmission)) return [{ key: ISSUE_DISPATCH_HELD_KEY }];

  // Still waiting on admission although the gate reads open for this viewer:
  // either the sweep has not re-driven it yet, or intake is admitted under a
  // different identity. Say what held it without claiming the gate is closed.
  if (reason === ADMISSION_DISABLED_REASON) return [{ key: ISSUE_DISPATCH_HELD_EARLIER_KEY }];

  return [];
};
