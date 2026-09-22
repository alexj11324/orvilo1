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

/**
 * Completion readout for one project milestone — Linear's `N issues · 100%`.
 *
 * Derived from the tasks actually linked to the milestone
 * (`tasks.project_milestone_id`), never stored: a milestone has no completion
 * column of its own, and a cached percentage would drift from the work. A
 * `null` readout means it could not be computed honestly (an unclassifiable
 * workflow category is linked) — never render that as 0%.
 *
 * The denominator convention is an **unverified choice**; see
 * `ProjectModel.listMilestoneProgress` for what was chosen, why, and what
 * could not be observed on the reference.
 *
 * **Nothing renders this yet, and that is deliberate — not an oversight.** On
 * the reference the readout is one thing with its destination, not bare text:
 * the overview row measures `<a href="…/issues?projectMilestoneId=<id>">N
 * issues · 100%</a>`, and the rail variant reads `100% of N`. Rendering the
 * numbers without that link would put a non-interactive element exactly where
 * the reference is interactive — a fresh parity gap that a diff reads as
 * "already done", which is worse than absent. Rendering the link would mean
 * half-building the milestone-filtered issue list, a page deliberately left to
 * its own task. So the readout and its `<a>` target are one unit and land
 * together, there. (That landing also needs two new i18n keys for the two text
 * variants, which is why none were added here.) This payload field *is* the
 * readout; nothing is waiting on data.
 */
export interface ProjectMilestoneProgress {
  /** Linked tasks in scope whose workflow category is `done`. */
  completed: number;
  /** Linked tasks in scope — see the denominator note on the model method. */
  issues: number;
  /** `completed / issues` as a rounded 0–100 integer. */
  percent: number;
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
