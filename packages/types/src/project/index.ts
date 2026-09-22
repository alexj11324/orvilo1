export const PROJECT_IDENTIFIER_REGEX = /^[A-Z][A-Z0-9]{2,5}$/;

export const PROJECT_STATUSES = [
  'backlog',
  'planned',
  'active',
  'paused',
  'reviewing',
  'completed',
  'canceled',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Linear-style project priority, ordered from no priority to low priority. */
export const PROJECT_PRIORITIES = [0, 1, 2, 3, 4] as const;

export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

/** Precision used when a project date represents a period rather than a day. */
export const PROJECT_DATE_PRECISIONS = ['day', 'month', 'quarter', 'halfYear', 'year'] as const;

export type ProjectDatePrecision = (typeof PROJECT_DATE_PRECISIONS)[number];

export const PROJECT_VISIBILITIES = ['private', 'public'] as const;

export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

export const PROJECT_WORKING_DIRECTORY_PERMISSIONS = ['readOnly', 'readWrite'] as const;

export type ProjectWorkingDirectoryPermission =
  (typeof PROJECT_WORKING_DIRECTORY_PERMISSIONS)[number];

export const PROJECT_COMPLETION_DECISIONS = ['accepted', 'rejected'] as const;

export type ProjectCompletionDecision = (typeof PROJECT_COMPLETION_DECISIONS)[number];

export interface ProjectOrchestrationPolicy {
  allowedAgentIds?: string[];
  allowedRoles?: string[];
  autoDispatch: boolean;
  concurrencyLimit?: number;
  executionBudget?: {
    maxCost?: number;
    maxRuns?: number;
  };
  planningBudget?: {
    maxRevisions?: number;
  };
  replanMode: 'disabled' | 'observe' | 'suggest' | 'apply';
  requireHumanReview: boolean;
}
