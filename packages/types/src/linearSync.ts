import type { TaskStatus } from './task';

/** Lifecycle of a workspace's Linear installation. */
export type LinearInstallationStatus = 'active' | 'error' | 'paused' | 'revoked';

/** Authentication actor persisted for a Linear installation. */
export type LinearInstallationActor = 'app';

/** State of one Orvilo task ↔ Linear issue binding. */
export type LinearIssueLinkSyncState =
  'conflict' | 'outcome_unknown' | 'pending' | 'removed' | 'synced' | 'unlinked';

/** Durable state of a received Linear delivery. */
export type LinearSyncInboxStatus =
  | 'dead_letter'
  | 'failed'
  | 'ignored'
  | 'pending_binding'
  | 'processed'
  | 'processing'
  | 'received';

/** Durable state of a local change waiting to reach Linear. */
export type LinearSyncOutboxStatus =
  'dead_letter' | 'failed' | 'outcome_unknown' | 'pending' | 'sent' | 'sending';

/** Scope of a persisted planning cursor. */
export type TaskPlanningScopeType = 'goal' | 'project' | 'workspace';

export type TaskPlanningScopeStatus = 'failed' | 'idle' | 'queued' | 'running';

/** Durable lifecycle of one versioned incremental planning attempt. */
export type TaskPlanningRevisionStatus =
  'applied' | 'failed' | 'proposed' | 'running' | 'superseded';

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
  localStatus: TaskStatus;
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
  replanningEnabled?: boolean;
  statusMappings?: LinearStatusMapping[];
}

/** Canonical subset of a Linear Issue used for synchronization decisions. */
export interface LinearIssueSnapshot {
  archivedAt?: string | null;
  assigneeId?: string | null;
  createdAt?: string | null;
  description?: string | null;
  id: string;
  identifier: string;
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

/** Three-way conflict payload kept on an issue link for user resolution. */
export interface LinearSyncConflict {
  base: Record<string, unknown>;
  detectedAt: string;
  fields: string[];
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
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
