/**
 * Navigation-attention v4 contracts.
 *
 * Frozen names for Inbox feed versions, WorkQuery AST, saved views, favorites,
 * and action-source receipts. These are types only — not live API responses.
 */

export const WORK_ATTENTION_CONTRACT_VERSION = 'nav-attention-v4.1';

export const EVENT_CONSUMERS = {
  COLLABORATION_REALTIME: 'collaboration-realtime',
  NOTIFICATION_PROJECTION: 'notification-projection',
} as const;

export type EventConsumerName = (typeof EVENT_CONSUMERS)[keyof typeof EVENT_CONSUMERS];

export type NotificationScopeKind = 'personal' | 'workspace';

export const notificationScopeKey = (workspaceId: string | null | undefined): string =>
  workspaceId ? `ws:${workspaceId}` : 'personal';

export type NotificationFeedKind = 'action' | 'update';

export const NOTIFICATION_BULK_ACTIONS = ['archive', 'mark_read'] as const;

export type NotificationBulkAction = (typeof NOTIFICATION_BULK_ACTIONS)[number];

export type NotificationFeedTab = 'action' | 'activity';

export type NotificationPresentationFilter = 'all' | 'archived' | 'mentions' | 'snoozed' | 'unread';

export type AttentionErrorCode =
  | 'ALREADY_DECIDED'
  | 'CURSOR_INVALID'
  | 'EXPIRED_ACTION'
  | 'FORBIDDEN'
  | 'INVALID_QUERY'
  | 'NOT_FOUND'
  | 'OUTCOME_UNKNOWN'
  | 'QUERY_TOO_COMPLEX'
  | 'SOURCE_UNAVAILABLE'
  | 'STALE_REVISION'
  | 'UNAUTHENTICATED';

export const ACTION_SOURCE_KINDS = [
  'acp_input',
  'acp_intervention',
  'acp_permission',
  'resource_transfer',
  'task_review',
  'workspace_ownership_transfer',
] as const;

export type ActionSourceKind = (typeof ACTION_SOURCE_KINDS)[number];

export interface ActionRef {
  executionGeneration?: number | null;
  kind: ActionSourceKind;
  requestId: string;
  sourceRevision?: number | string | null;
}

export type DecisionVerb = 'approve' | 'cancel' | 'decline' | 'reject' | 'submit_input';

export interface VersionedDecision {
  actionRef: ActionRef;
  decision: DecisionVerb;
  expectedExecutionGeneration?: number | null;
  expectedSourceRevision?: number | string | null;
  idempotencyKey: string;
  inputPayload?: Record<string, unknown>;
  paramsHash?: string | null;
}

export type DecisionReceiptStatus =
  | 'already_decided'
  | 'expired'
  | 'outcome_unknown'
  | 'source_accepted'
  | 'source_confirmed'
  | 'source_rejected'
  | 'stale';

export interface DecisionReceipt {
  executionStarted: boolean;
  sourceState?: string;
  status: DecisionReceiptStatus;
}

export interface TypedNavigationTarget {
  kind: 'approval' | 'inbox' | 'project' | 'savedView' | 'task' | 'team' | 'url';
  projectId?: string;
  savedViewId?: string;
  taskId?: string;
  teamId?: string;
  url?: string;
  workspaceId?: string | null;
}

export interface NotificationFeedCard {
  actionRef?: ActionRef | null;
  activityVersion: number;
  availableActions: Array<'archive' | 'decide' | 'open' | 'snooze'>;
  content: string;
  /** Verbs the current visitor may send through `workAttention.decide`. */
  decisionVerbs?: DecisionVerb[];
  kind: NotificationFeedKind;
  lastActivityAt: string;
  notificationId: string;
  /** True when this visitor initiated the request and can only withdraw. */
  outgoing?: boolean;
  read: boolean;
  readVersion: number;
  resourceId?: string | null;
  resourceType?: string | null;
  safeNavigation?: TypedNavigationTarget | null;
  snoozedUntil?: string | null;
  title: string;
  type: string;
}

export interface NotificationFeedSummary {
  pendingActionCount: number;
  snoozedPendingCount: number;
  /** Unique active, unsnoozed, currently-readable cards — not a sum of the others. */
  unreadBadgeCount: number;
  unreadUpdateCount: number;
}

export type WorkQueryEntityType = 'project' | 'task';

export type WorkQueryField =
  | 'assigneeUserId'
  | 'createdByUserId'
  | 'cycleId'
  | 'delegatedByUserId'
  | 'id'
  | 'priority'
  | 'projectId'
  | 'reviewerUserId'
  | 'status'
  | 'teamId'
  | 'triageStatus'
  | 'workflowCategory';

export type WorkQueryOp = 'eq' | 'in' | 'isNotNull' | 'isNull' | 'neq' | 'notIn';

export type WorkQueryValue = { ref: 'currentUser' } | boolean | null | number | string | string[];

export interface WorkQueryPredicate {
  field: WorkQueryField;
  op: WorkQueryOp;
  value?: WorkQueryValue;
}

export interface WorkQueryFilter {
  all?: Array<WorkQueryFilter | WorkQueryPredicate>;
  any?: Array<WorkQueryFilter | WorkQueryPredicate>;
}

export interface WorkQuerySort {
  direction: 'asc' | 'desc';
  field: WorkQueryField | 'id' | 'updatedAt';
}

export type WorkQueryLayout = 'board' | 'list';

export type WorkQueryGroupBy = 'none' | 'status' | 'workflowCategory';

/** Cross-team board columns. Exact Team workflow states stay on the Team surface. */
export const WORK_QUERY_WORKFLOW_COLUMNS = [
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const;

export const WORK_QUERY_STATUS_COLUMNS = [
  'backlog',
  'scheduled',
  'running',
  'paused',
  'failed',
  'completed',
  'canceled',
] as const;

export interface WorkQuery {
  entityType: WorkQueryEntityType;
  filter?: WorkQueryFilter;
  groupBy?: WorkQueryGroupBy;
  layout?: WorkQueryLayout;
  schemaVersion: 1;
  sort?: WorkQuerySort[];
}

/** Pending review that is not a Task — never materialized as a Task just to fill My Work. */
export interface WorkQueryExternalReview {
  actionType: string;
  id: string;
  targetId: string | null;
  targetType: string;
  title: string;
}

export const WORK_QUERY_MAX_DEPTH = 3;
export const WORK_QUERY_MAX_PREDICATES = 20;

export type MyWorkMode = 'assigned' | 'created' | 'delegated' | 'review' | 'subscribed';

export type SavedViewVisibility = 'private' | 'team' | 'workspace';

export type SavedViewNeedsRepairReason = 'expired_status' | 'unknown_field' | 'unknown_operator';

export interface SavedViewDefinition {
  definitionVersion: number;
  displayOptions?: Record<string, unknown>;
  entityType: WorkQueryEntityType;
  id: string;
  layout: WorkQueryLayout;
  name: string;
  needsRepair?: boolean;
  needsRepairReason?: SavedViewNeedsRepairReason;
  ownerUserId: string;
  query: WorkQuery;
  scopeKey: string;
  teamId?: string | null;
  visibility: SavedViewVisibility;
}

export type NavigationFavoriteTargetType = 'project' | 'savedView' | 'task' | 'team';

export interface NavigationFavorite {
  rank: number;
  targetId: string;
  targetType: NavigationFavoriteTargetType;
  /** Resolved only when the caller can still read the target. Never a leaked stale title. */
  title?: string | null;
  version: number;
}

export type TeamTriageAction = 'accept' | 'decline' | 'duplicate' | 'reassign';
