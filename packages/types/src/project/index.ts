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

/** Statuses a caller may set at create time — 'reviewing'/'completed' are terminal-of-flow. */
export const PROJECT_CREATABLE_STATUSES = [
  'backlog',
  'planned',
  'active',
  'paused',
  'canceled',
  'archived',
] as const;

export type ProjectCreatableStatus = (typeof PROJECT_CREATABLE_STATUSES)[number];

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

/** Linear-style project health reported by project updates. */
export const PROJECT_HEALTH_STATES = ['onTrack', 'atRisk', 'offTrack'] as const;

export type ProjectHealth = (typeof PROJECT_HEALTH_STATES)[number];

/** Linear's activity composer splits notes into status updates and plain comments. */
export const PROJECT_UPDATE_KINDS = ['update', 'comment'] as const;

export type ProjectUpdateKind = (typeof PROJECT_UPDATE_KINDS)[number];

/** A single project update post — Linear's project-update entity. */
export interface ProjectUpdate {
  authorAvatar?: string;
  authorId: string;
  authorName?: string;
  body: string;
  createdAt: string;
  health?: ProjectHealth;
  id: string;
  kind: ProjectUpdateKind;
  projectId: string;
}

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
