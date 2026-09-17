import type { TaskStatus, TaskWorkflowCategory } from './task';

/** Lifecycle of a workspace's Linear installation. */
export type LinearInstallationStatus = 'active' | 'error' | 'paused' | 'revoked';

/** Authentication actor persisted for a Linear installation. */
export type LinearInstallationActor = 'app';

/** State of one Orvilo task ↔ Linear issue binding. */
export type LinearIssueLinkSyncState =
  'conflict' | 'outcome_unknown' | 'pending' | 'removed' | 'synced' | 'unlinked';

/** Which system first created or last authored an external mapping. */
export type LinearExternalSyncSource = 'linear' | 'orvilo';

/** Which durable boundary recorded an external mapping change. */
export type LinearExternalSyncOrigin = 'inbound' | 'outbound' | 'reconciliation';

/** Whether an external mapping has a confirmed remote/local baseline. */
export type LinearExternalConfirmationState =
  'confirmed' | 'conflict' | 'tombstoned' | 'unconfirmed' | 'unresolved';

export type LinearRelationKind = 'blocks' | 'parent' | 'relates';

export type LinearTombstoneKind = 'archived' | 'deleted' | 'forbidden' | 'out_of_scope' | 'revoked';

/** Durable state of a received Linear delivery. */
export type LinearSyncInboxStatus =
  | 'dead_letter'
  | 'failed'
  | 'ignored'
  | 'pending_binding'
  | 'paused'
  | 'processed'
  | 'processing'
  | 'received';

/** Durable state of a local change waiting to reach Linear. */
export type LinearSyncOutboxStatus =
  | 'cancelled'
  | 'dead_letter'
  | 'failed'
  | 'outcome_unknown'
  | 'paused'
  | 'pending'
  | 'sent'
  | 'sending';

/** Scope of a persisted planning cursor. */
export type TaskPlanningScopeType = 'goal' | 'project' | 'team' | 'workspace';

export type TaskPlanningScopeStatus = 'failed' | 'idle' | 'queued' | 'running';

/** Durable lifecycle of one versioned incremental planning attempt. */
export type TaskPlanningRevisionStatus =
  'applied' | 'failed' | 'proposed' | 'running' | 'superseded';

/** Safe queue records exposed to workspace administrators for recovery. */
export type LinearSyncRecoveryKind = 'inbox' | 'outbox' | 'planning';

export interface LinearSyncRecoveryRow {
  attempts: number;
  availableAt: string | Date | null;
  createdAt: string | Date;
  id: string;
  installationId: string | null;
  kind: LinearSyncRecoveryKind;
  lastError: string | null;
  scopeId: string | null;
  status: string;
  updatedAt: string | Date;
}

export interface LinearInstallationRecoveryState {
  accessTokenExpiresAt: string | Date | null;
  id: string;
  lastError: string | null;
  lastSyncAt: string | Date | null;
  organizationId: string;
  organizationName: string | null;
  reauthRequired: boolean;
  status: LinearInstallationStatus;
}

/** Which boundary produced a domain change. */
export type TaskDomainEventSource = 'agent' | 'linear' | 'system' | 'user';

export type TaskDomainEventType =
  | 'linear.issue.changed'
  | 'linear.import.completed'
  | 'linear.import.progress'
  | 'linear.project.changed'
  | 'linear.team.changed'
  | 'project.changed'
  | 'task.assigned'
  | 'task.comment.changed'
  | 'task.created'
  | 'task.deleted'
  | 'task.dependency.changed'
  | 'task.moved'
  | 'task.requirement.changed'
  | 'task.scope.changed'
  | 'task.status.changed'
  | 'team.changed';

/** Status mapping is explicit per Linear workflow-state UUID. */
export interface LinearStatusMapping {
  linearStateId: string;
  /** Legacy execution projection retained for existing bindings. */
  localStatus?: TaskStatus;
  /** Business workflow projection. This must be used for new mappings. */
  workflowCategory?: TaskWorkflowCategory;
}

/** Optional mapping from a Linear user UUID to an Orvilo member or agent. */
export interface LinearAssignmentMapping {
  linearUserId: string;
  orviloAgentId?: string;
  orviloUserId?: string;
}

/** Settings attached to a workspace/project binding. */
export interface LinearProjectBindingSettings {
  assignmentMappings?: LinearAssignmentMapping[];
  autoExecutionEnabled?: boolean;
  /** Independent rollout control. Missing values inherit legacy syncEnabled. */
  readEnabled?: boolean;
  replanningEnabled?: boolean;
  statusMappings?: LinearStatusMapping[];
  /** Independent rollout control. Missing values inherit legacy syncEnabled. */
  writeEnabled?: boolean;
}

/** Canonical subset of a Linear Issue used for synchronization decisions. */
export interface LinearIssueSnapshot {
  archivedAt?: string | null;
  assigneeId?: string | null;
  createdAt?: string | null;
  /** Remote Linear cycle UUID when the issue sits in a cycle. */
  cycleId?: string | null;
  description?: string | null;
  id: string;
  identifier: string;
  /** Exact remote Linear label UUIDs; omitted when the provider did not return labels. */
  labelIds?: string[];
  parentId?: string | null;
  priority?: number | null;
  projectId?: string | null;
  stateId?: string | null;
  stateType?: string | null;
  teamId?: string | null;
  title: string;
  updatedAt?: string | null;
  url?: string | null;
}

/** Provider-neutral snapshot of one Linear comment. */
export interface LinearCommentSnapshot {
  authorId?: string | null;
  body: string;
  createdAt?: string | null;
  deletedAt?: string | null;
  id: string;
  issueId: string;
  updatedAt?: string | null;
}

/** Canonical relation direction: a blocker blocks a blocked issue. */
export interface LinearRelationSnapshot {
  createdAt?: string | null;
  id: string;
  kind: LinearRelationKind;
  sourceIssueId: string;
  targetIssueId: string;
  updatedAt?: string | null;
}

/** Durable explanation for why a remote issue is no longer active in scope. */
export interface LinearSyncTombstone {
  at: string;
  kind: LinearTombstoneKind;
  reason?: string;
  snapshot?: LinearIssueSnapshot;
  source: LinearExternalSyncSource;
}

export type LinearExternalCommentOutboxPayload =
  | {
      action: 'create' | 'update';
      body: string;
      commentId: string;
      editorData?: unknown;
      kind: 'comment';
      remoteCommentId?: string;
    }
  | {
      action: 'delete';
      commentId: string;
      kind: 'comment';
    };

export interface LinearExternalRelationOutboxPayload {
  action: 'remove' | 'upsert';
  kind: 'relation';
  relation: {
    kind: LinearRelationKind;
    localRelationKey: string;
    sourceTaskId: string;
    targetTaskId: string | null;
  };
  remoteRelationId?: string;
}

/** Three-way conflict payload kept on an issue link for user resolution. */
export interface LinearSyncConflict {
  base: Record<string, unknown>;
  detectedAt: string;
  fields: string[];
  local: Record<string, unknown>;
  localRevision?: number;
  remote: Record<string, unknown>;
  remoteUpdatedAt?: string | null;
}

/** Trigger metadata stored on a planning scope. */
export interface TaskPlanningTrigger {
  action?: string;
  eventId?: string;
  source: TaskDomainEventSource;
  type: TaskDomainEventType;
}

/** Safe, auditable actions a coordinator may propose for a planning scope. */
export type TaskPlanningAction =
  | {
      action: 'assign_task';
      assigneeAgentId?: string | null;
      assigneeUserId?: string | null;
      reason: string;
      taskId: string;
    }
  | {
      action: 'create_task';
      description: string;
      instruction: string;
      name: string;
      parentTaskId?: string | null;
      priority?: number;
      /**
       * Project the task belongs to — required inside a project scope, absent
       * for projectless team-scope tasks.
       */
      projectId?: string;
      reason: string;
      /** Owning team — set by team-scope planning (linear-workspace-v3). */
      teamId?: string;
    }
  | {
      action: 'escalate';
      reason: string;
    }
  | {
      action: 'noop';
      reason: string;
    }
  | {
      action: 'request_stop';
      reason: string;
      taskId: string;
    }
  | {
      action: 'request_resume';
      instruction: string;
      reason: string;
      taskId: string;
    }
  | {
      action: 'set_dependency';
      dependsOnTaskId: string;
      operation: 'add' | 'remove';
      reason: string;
      taskId: string;
    }
  | {
      action: 'update_task';
      patch: {
        instruction?: string;
        name?: string;
        priority?: number;
      };
      reason: string;
      taskId: string;
    };

/** Versioned planning output. The action list is validated before application. */
export interface TaskPlanningProposal {
  actions: TaskPlanningAction[];
  explanation: string;
  requiresApproval: boolean;
}

// ── Workspace-scope sync (linear-workspace-v3) ─────────────────────────────

/** Canonical organization snapshot returned by the provider catalog. */
export interface LinearOrganizationSnapshot {
  id: string;
  name: string;
  url?: string | null;
}

/** Canonical Linear project snapshot used for sync decisions. */
export interface LinearProjectSnapshot {
  id: string;
  name: string;
  organizationId: string | null;
  /** Linear-side lifecycle state (e.g. planned/started/completed/canceled). */
  state?: string | null;
  /** Every Linear team this project is attached to — M:N, never duplicated. */
  teamIds: string[];
}

/** Canonical Linear team snapshot including its workflow states. */
export interface LinearTeamSnapshot {
  cycles?: LinearCycleSnapshot[];
  id: string;
  key: string;
  name: string;
  organizationId: string | null;
  visibility: string | null;
  workflowStates?: LinearWorkflowStateSnapshot[];
}

/** Canonical Linear cycle snapshot (sprint iteration inside a team). */
export interface LinearCycleSnapshot {
  endsAt: string | null;
  id: string;
  name: string;
  number: number | null;
  startsAt: string | null;
  teamId: string;
}

/** Canonical Linear workflow-state snapshot (exact remote UUID + type). */
export interface LinearWorkflowStateSnapshot {
  id: string;
  name: string;
  position: number | null;
  teamId: string;
  type: string | null;
}

export interface LinearMemberSnapshot {
  id: string;
  name: string;
}

export interface LinearIssuePage {
  endCursor: string | null;
  hasNextPage: boolean;
  issues: LinearIssueSnapshot[];
}

/**
 * Lifecycle of the workspace-level sync scope: the single durable record of
 * which Linear teams/projects/issues this installation is allowed to mirror.
 */
export type LinearSyncScopeStatus =
  'active' | 'failed' | 'importing' | 'paused' | 'reconciling' | 'revoked';

/**
 * Ordered phases of one workspace import run. Issues are imported per team
 * including `project = null` issues; reconciliation closes the run.
 */
export type LinearSyncImportPhase =
  | 'completed'
  | 'issues'
  | 'projects'
  | 'reconciliation'
  | 'relations'
  | 'teams'
  | 'workflow_states';

/** Per-phase resumable cursors of an import run. */
export interface LinearSyncScopeCursors {
  /** Per Linear-team issue pagination cursor keyed by remote team id. */
  issuesByTeam?: Record<string, string | null>;
  projects?: string | null;
  reconciliation?: string | null;
  teams?: string | null;
}

/** What the installation is allowed to mirror and publish. */
export interface LinearSyncScopeSettings {
  /**
   * Remote Linear team ids approved for sync. `undefined` means every team
   * the app can see; an empty array means none.
   */
  approvedTeamIds?: string[];
  /** Whether issues without a Linear project are imported (default true). */
  includeProjectlessIssues?: boolean;
  /** Private-team handling: `skip` never imports them at all. */
  privateTeamPolicy?: 'import_restricted' | 'skip';
  /** Outbound policy — nothing is published unless explicitly approved. */
  publication?: {
    /** New local projects may be published without a per-project prompt. */
    autoPublishNewProjects?: boolean;
    /** Team creation on Linear always requires explicit approval. */
    teamPublishRequiresApproval?: boolean;
  };
}

/**
 * Sync state of the durable link between a local team and a remote Linear
 * team (analogous to {@link LinearIssueLinkSyncState}).
 */
export type LinearTeamLinkSyncState =
  'conflict' | 'outcome_unknown' | 'pending' | 'removed' | 'synced' | 'unlinked';

/** Sync state of the durable project link (evolved `linear_project_bindings`). */
export type LinearProjectLinkSyncState =
  'conflict' | 'outcome_unknown' | 'pending' | 'removed' | 'synced' | 'unlinked';

/** Progress summary a client may poll while an import runs. */
export interface LinearWorkspaceImportSummary {
  importRunId: string | null;
  issuesFailed: number;
  issuesImported: number;
  lastError: string | null;
  phase: LinearSyncImportPhase;
  projectsLinked: number;
  scopeRevision: number;
  startedAt: string | Date | null;
  status: LinearSyncScopeStatus;
  teamsLinked: number;
}

/** Identity of the durable team link exposed to clients. */
export interface LinearTeamLinkView {
  key: string;
  linearTeamId: string;
  name: string;
  syncState: LinearTeamLinkSyncState;
  teamId: string;
}
