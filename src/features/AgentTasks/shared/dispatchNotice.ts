import type { TaskDispatchPhase } from '@orvilo/types';

/**
 * Why work that was asked for has not started, as the server reports it.
 *
 * Two independent signals, and neither is the other:
 * - `orchestrationAdmission` is the current gate for NEW automatic dispatches
 *   in this workspace. It says nothing about runs already in flight, and runs
 *   the user starts by hand are not gated at all.
 * - `dispatchWaitingReason` is the reason persisted on the active dispatch. It
 *   can outlive its cause: a dispatch held while admission was closed keeps
 *   that reason until the next sweep re-drives it.
 *
 * So the admission line only shows while the gate is closed, and a leftover
 * admission reason is never presented as the current state once it is open.
 */

type OrchestrationAdmission = 'enabled' | 'disabled';

export const ADMISSION_DISABLED_REASON = 'caid_dispatch_disabled';

export interface DispatchNoticeCopy {
  key: string;
  params?: Record<string, string>;
}

export const GOAL_DISPATCH_HELD_KEY = 'goalProcess.frontier.dispatchHeld';
export const ISSUE_DISPATCH_HELD_KEY = 'taskDetail.dispatchNotice.admissionDisabled';

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
  const notices: DispatchNoticeCopy[] = [];

  if (isOrchestrationHeld(input.orchestrationAdmission) && isNotStarted(input.dispatchPhase))
    notices.push({ key: ISSUE_DISPATCH_HELD_KEY });

  const reason = input.dispatchWaitingReason?.trim();
  // The admission line above already covers a current admission hold; with the
  // gate open the same reason is a leftover, not the state of the Issue.
  if (input.dispatchPhase !== 'waiting' || !reason || reason === ADMISSION_DISABLED_REASON)
    return notices;

  const key = WAITING_REASON_KEYS[reason];
  notices.push(
    key ? { key } : { key: 'taskDetail.dispatchNotice.reason.other', params: { reason } },
  );
  return notices;
};
