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
export type TaskPlanningScopeType = 'goal' | 'project' | 'workspace';

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
  | 'task.assigned'
  | 'task.comment.changed'
  | 'task.created'
  | 'task.deleted'
  | 'task.dependency.changed'
  | 'task.requirement.changed'
  | 'task.scope.changed'
  | 'task.status.changed';

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
      projectId: string;
      reason: string;
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
