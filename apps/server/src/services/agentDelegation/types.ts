/**
 * Execution-grant lifecycle. A grant authorizes one agent to act on one task
 * under a bounded action list, on behalf of a recorded delegation subject —
 * never under a silently substituted identity.
 */
export type ExecutionGrantStatus = 'active' | 'expired' | 'revoked';

/**
 * Who a delegated run is attributed to. `'user'` is a concrete workspace
 * member whose current membership must validate at run time; `'policy'` is a
 * pre-approved automation rule the workspace admin registered (v1 delegates
 * always use 'user' — the column carries the contract forward).
 */
export type DelegationSubjectType = 'policy' | 'user';

/**
 * Actions a grant can authorize. Checked at run start against the requested
 * action — the allowlist is an intersection, not a floor.
 */
export const DELEGATION_ACTIONS = ['pause', 'resume', 'run', 'steer'] as const;
export type DelegationAction = (typeof DELEGATION_ACTIONS)[number];

/** `delegateAgent` omits `allowedActions` → the minimum useful grant. */
export const DEFAULT_ALLOWED_ACTIONS: readonly DelegationAction[] = ['run'] as const;

export const TASK_INPUT_INTENT_TYPES = ['comment', 'decision', 'instruction', 'proposal'] as const;
export type TaskInputIntentType = (typeof TASK_INPUT_INTENT_TYPES)[number];

/** task_inputs.status — the lifecycle an input row moves through. */
export const TASK_INPUT_STATUSES = ['accepted', 'pending', 'rejected', 'superseded'] as const;
export type TaskInputStatus = (typeof TASK_INPUT_STATUSES)[number];

export type ApprovalDecision = 'approved' | 'rejected';
export type ActionApprovalStatus = ApprovalDecision | 'consumed' | 'expired' | 'pending';
