import type { TaskWorkflowCategory } from './task';

/**
 * Team domain contract (linear-workspace-v3, WM-01).
 *
 * A Team is the long-lived responsibility domain inside a workspace: it owns
 * the workflow states, cycles, default execution resources and the issues
 * (tasks) that are not attached to any project. Projects stay cross-team
 * delivery goals — a Team page may list the projects it participates in, but
 * there is exactly one Project row, never one copy per team.
 */

export type TeamStatus = 'active' | 'archived';

/** Mirrors task/agent visibility: private teams are member-visible only. */
export type TeamVisibility = 'private' | 'public';

/** Role inside one team — distinct from the workspace-level role. */
export type TeamMembershipRole = 'lead' | 'member';

/**
 * How a task's business ownership is resolved. Every workspace-mode task
 * eventually belongs to exactly one team (explicit assignment, or the
 * workspace default team); personal-mode tasks keep `teamId = null`.
 */
export type TeamAssignmentSource = 'default' | 'import' | 'manual' | 'planning';

/**
 * Execution policy a team applies to projectless work in its scope. Shares the
 * project policy vocabulary (`replanMode`, budgets, allowed agents) so one
 * normalization path serves both scopes — `defaultAgentId` is the team-only
 * fallback assignee.
 */
export interface TeamOrchestrationPolicy {
  allowedAgentIds?: string[];
  allowedRoles?: string[];
  /** Whether the team planner may auto-dispatch ready work. */
  autoDispatch?: boolean;
  /** Cap on concurrently running tasks inside this team's scope. */
  concurrencyLimit?: number;
  /** Agent picked when a task in this team has no explicit assignee. */
  defaultAgentId?: string;
  executionBudget?: {
    maxCost?: number;
    maxRuns?: number;
  };
  planningBudget?: {
    maxRevisions?: number;
  };
  replanMode?: 'disabled' | 'observe' | 'suggest' | 'apply';
  /** Whether human review is required before work in this team closes. */
  requireHumanReview?: boolean;
  /**
   * Whether this team runs a triage intake. Absent defaults to enabled —
   * legacy teams keep their triage surface; `false` hides the Triage
   * navigation item, the page section, and rejects triage writes.
   */
  triageEnabled?: boolean;
}

/**
 * Domain DTO for one team row. `key` is the issue prefix (e.g. `ENG`);
 * `nextIssueSeq` is the transactional counter used to allocate `<key>-<n>`
 * identifiers — never `max(seq)+1` computed across rows.
 */
export interface TeamItem {
  coordinatorAgentId?: string | null;
  createdAt: Date;
  createdBySnapshot?: {
    displayName?: string;
    externalId?: string;
    kind: 'agent' | 'integration' | 'system' | 'user';
  } | null;
  createdBySubjectId?: string | null;
  createdBySubjectKind?: 'agent' | 'integration' | 'system' | 'user';
  createdByUserId?: string | null;
  /** Default execution agent for unassigned work in this team's scope. */
  defaultAgentId?: string | null;
  description?: string | null;
  id: string;
  /** Exactly one team per workspace carries `isDefault = true`. */
  isDefault: boolean;
  /**
   * Viewer annotation: whether the requesting user is a `team_members` row.
   * Only set by list endpoints that resolve membership; absent elsewhere.
   */
  joined?: boolean;
  key: string;
  name: string;
  /** Next value handed out by the transactional identifier allocator. */
  nextIssueSeq: number;
  orchestrationPolicy: TeamOrchestrationPolicy;
  policyRevision: number;
  status: TeamStatus;
  updatedAt: Date;
  visibility: TeamVisibility;
  workspaceId: string;
}

export interface NewTeam {
  defaultAgentId?: string | null;
  description?: string | null;
  isDefault?: boolean;
  key: string;
  name: string;
  orchestrationPolicy?: TeamOrchestrationPolicy;
  status?: TeamStatus;
  visibility?: TeamVisibility;
}

export interface UpdateTeam {
  defaultAgentId?: string | null;
  description?: string | null;
  key?: string;
  name?: string;
  orchestrationPolicy?: TeamOrchestrationPolicy;
  status?: TeamStatus;
  visibility?: TeamVisibility;
}

export interface TeamMemberItem {
  deletedAt?: Date | null;
  id: string;
  joinedAt: Date;
  role: TeamMembershipRole;
  teamId: string;
  userId: string;
  workspaceId: string;
}

/**
 * Local workflow-state row referenced by `tasks.workflow_state_ref_id`.
 * `remoteStateId` preserves the provider's exact state UUID for round-trip
 * sync; `tasks.workflow_state_id` keeps the same value as a plain-text
 * external projection for backward compatibility.
 */
export interface TeamWorkflowStateItem {
  category: TaskWorkflowCategory;
  id: string;
  name: string;
  position: number | null;
  /** Provider state UUID when this state was imported; null for local states. */
  remoteStateId: string | null;
  teamId: string;
  workspaceId: string;
}

/**
 * First-pass cycle record: team scope, source identity and task association
 * are kept readable; full cycle planning is a later scope.
 */
export interface TeamCycleItem {
  endsAt: Date | null;
  id: string;
  name: string | null;
  number: number | null;
  /** Provider cycle UUID when imported; null for local cycles. */
  remoteCycleId: string | null;
  startsAt: Date | null;
  teamId: string;
  workspaceId: string;
}

/**
 * Migration-review marker for pre-existing projects. Not a user-facing level —
 * it only records how a legacy project should be treated while delivery
 * semantics are rolled out.
 */
export type ProjectMigrationClass = 'delivery_project' | 'legacy_work_container' | 'undetermined';
