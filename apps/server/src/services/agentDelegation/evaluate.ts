import type { DelegationAction, ExecutionGrantStatus } from './types';

/** Minimal grant shape the evaluator needs — satisfied by the drizzle row. */
export interface EvaluatedGrant {
  allowedActions: string[] | null;
  delegationSubjectId: string | null;
  delegationSubjectType: string;
  expiresAt: Date | null;
  status: string;
  workspaceId: string | null;
}

export type GrantDenial =
  | 'action_not_allowed'
  | 'expired'
  | 'foreign_workspace'
  | 'not_active'
  | 'subject_inactive'
  | 'subject_missing';

export type GrantVerdict = { ok: true } | { denial: GrantDenial; ok: false };

/**
 * Pure run-start check over a fetched grant row:
 *
 *   grant active AND not expired AND inside this workspace
 *   AND requested action ∈ allowedActions
 *   AND a user delegation subject is still an active member
 *
 * A removed/suspended delegator denies — the run is never re-attributed to a
 * surviving principal (that would silently launder authorization).
 */
export const evaluateGrant = (
  grant: EvaluatedGrant | null | undefined,
  input: {
    action: DelegationAction | string;
    now: Date;
    subjectActive: boolean;
    workspaceId: string;
  },
): GrantVerdict => {
  if (!grant || grant.workspaceId !== input.workspaceId) {
    return { denial: 'foreign_workspace', ok: false };
  }

  const status = grant.status as ExecutionGrantStatus;
  if (status !== 'active') {
    return { denial: 'not_active', ok: false };
  }

  if (grant.expiresAt && grant.expiresAt.getTime() <= input.now.getTime()) {
    return { denial: 'expired', ok: false };
  }

  if (grant.delegationSubjectType === 'user') {
    if (!grant.delegationSubjectId) return { denial: 'subject_missing', ok: false };
    if (!input.subjectActive) return { denial: 'subject_inactive', ok: false };
  }

  // Fail closed: creation always writes a concrete list, so a null/empty
  // whitelist belongs to a row outside this contract and allows nothing.
  const allowed = grant.allowedActions;
  if (!allowed || !allowed.includes(input.action)) {
    return { denial: 'action_not_allowed', ok: false };
  }

  return { ok: true };
};

/**
 * Fencing check for the execution epoch carried by `task_topics`: a run may
 * commit only while the epoch it claimed is still the row's current epoch and
 * still bound to its grant. A newer epoch means a later execution supersedes
 * it — the stale worker is fenced off, even if its lease looked unexpired.
 */
export const isEpochCurrent = (
  topic: { executionEpoch?: number | null; executionGrantId?: string | null } | null | undefined,
  input: { epoch: number; grantId: string },
): boolean =>
  !!topic && topic.executionEpoch === input.epoch && topic.executionGrantId === input.grantId;
