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

const PRESENTATION_FILTERS: readonly NotificationPresentationFilter[] = [
  'all',
  'archived',
  'mentions',
  'snoozed',
  'unread',
];
const FEED_KINDS: readonly NotificationFeedKind[] = ['action', 'update'];

export const notificationBulkFingerprint = (
  action: NotificationBulkAction,
  chip: NotificationPresentationFilter,
  kind?: NotificationFeedKind,
): string => (kind ? `${action}:${chip}:${kind}` : `${action}:${chip}`);

/** Server-validated Inbox bulk query. `filter` omitted means the All chip. */
export const parseNotificationBulkFingerprint = (
  action: NotificationBulkAction,
  fingerprint: string,
):
  | { filter?: Exclude<NotificationPresentationFilter, 'all'>; kind?: NotificationFeedKind }
  | undefined => {
  const parts = fingerprint.split(':');
  if (parts[0] !== action) return undefined;
  const chip = parts[1];
  if (!PRESENTATION_FILTERS.includes(chip as NotificationPresentationFilter)) return undefined;
  const filter =
    chip === 'all' ? undefined : (chip as Exclude<NotificationPresentationFilter, 'all'>);
  if (parts.length === 2) return { filter };
  const kind = parts[2];
  if (parts.length === 3 && FEED_KINDS.includes(kind as NotificationFeedKind)) {
    return { filter, kind: kind as NotificationFeedKind };
  }
  return undefined;
};

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

/**
 * Inbox page payload. `partial` means at least one live source failed to
 * load — remaining cards are still authoritative, not an empty success.
 */
export interface NotificationFeedPage {
  cards: NotificationFeedCard[];
  lastReconciledAt: string;
  partial: boolean;
  sourceUnavailable: ActionSourceKind[];
}

/** CommandMenu / work search bound so 200 teams stay reachable. */
export const WORK_SEARCH_MAX_PER_TYPE = 200;

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

export const NO_PROJECT_PREDICATE = {
  field: 'projectId',
  op: 'isNull',
} as const satisfies WorkQueryPredicate;

const isNoProjectPredicate = (node: WorkQueryFilter | WorkQueryPredicate): boolean =>
  'field' in node && node.field === 'projectId' && node.op === 'isNull';

/** AND `projectId isNull` onto a query. Does not assign a default project. */
export const applyNoProjectFilter = (query: WorkQuery, enabled: boolean): WorkQuery => {
  const any = query.filter?.any;
  const all = (query.filter?.all ?? []).filter((node) => !isNoProjectPredicate(node));
  if (enabled) all.push(NO_PROJECT_PREDICATE);
  if (all.length === 0 && (!any || any.length === 0)) {
    if (!query.filter) return query;
    const { filter: _omit, ...rest } = query;
    return rest;
  }
  return {
    ...query,
    filter: {
      ...(any && any.length > 0 ? { any } : {}),
      ...(all.length > 0 ? { all } : {}),
    },
  };
};

export const WORK_QUERY_FACET_FIELDS = [
  'projectId',
  'status',
  'teamId',
  'workflowCategory',
] as const;

export type WorkQueryFacetField = (typeof WORK_QUERY_FACET_FIELDS)[number];

export interface WorkQueryFacetBucket {
  count: number;
  key: string | null;
  /** Set only when the visitor may read this team/project. */
  name?: string;
}

export interface WorkQueryFacetResult {
  buckets: WorkQueryFacetBucket[];
  field: WorkQueryFacetField;
  queryHash: string;
  /** Matching rows whose facet key the visitor must not learn. */
  restrictedCount: number;
  total: number;
}

export interface WorkQueryCountResult {
  queryHash: string;
  total: number;
}

export const WORK_ATTENTION_ALLOWED_HTTPS_HOSTS = ['github.com', 'linear.app'] as const;

export const isWorkAttentionAllowedHttpsHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return WORK_ATTENTION_ALLOWED_HTTPS_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
};

export type WorkAttentionActionUrlMode = 'external' | 'internal' | 'reject';

export type ClassifiedWorkAttentionActionUrl =
  { mode: Exclude<WorkAttentionActionUrlMode, 'reject'>; url: string } | { mode: 'reject' };

const WORK_ATTENTION_RELATIVE_ORIGIN = 'https://orvilo.invalid';

const hasUnsafeWorkAttentionUrlChar = (value: string): boolean => {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || char === '\\') return true;
  }
  return false;
};

/**
 * Inbox and My Work may only open same-app relative paths or an allowlisted
 * https host. javascript:/data:/credentials/protocol-relative URLs fail closed.
 */
export const classifyWorkAttentionActionUrl = (
  raw: string | null | undefined,
): ClassifiedWorkAttentionActionUrl => {
  if (!raw) return { mode: 'reject' };
  const trimmed = raw.trim();
  if (!trimmed || hasUnsafeWorkAttentionUrlChar(trimmed)) return { mode: 'reject' };

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.includes('://')) return { mode: 'reject' };
    try {
      const parsed = new URL(trimmed, WORK_ATTENTION_RELATIVE_ORIGIN);
      if (parsed.username || parsed.password || parsed.hostname !== 'orvilo.invalid') {
        return { mode: 'reject' };
      }
      if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) {
        return { mode: 'reject' };
      }
      return { mode: 'internal', url: `${parsed.pathname}${parsed.search}${parsed.hash}` };
    } catch {
      return { mode: 'reject' };
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      return { mode: 'reject' };
    if (!isWorkAttentionAllowedHttpsHost(parsed.hostname)) return { mode: 'reject' };
    return { mode: 'external', url: parsed.toString() };
  } catch {
    return { mode: 'reject' };
  }
};

export const safeWorkAttentionActionUrl = (raw: string | null | undefined): string | null => {
  const classified = classifyWorkAttentionActionUrl(raw);
  return classified.mode === 'reject' ? null : classified.url;
};

/** Pending review that is not a Task — never materialized as a Task just to fill My Work. */
export interface WorkQueryExternalReview {
  actionType: string;
  id: string;
  /** Allowlisted https GitHub/Linear URL when `targetId` is a safe jump target. */
  openUrl?: string | null;
  targetId: string | null;
  targetType: string;
  title: string;
}

export const WORK_QUERY_MAX_DEPTH = 3;
export const WORK_QUERY_MAX_PREDICATES = 20;
/** Bound `in` / `notIn` value arrays so callers cannot build unbounded SQL. */
export const WORK_QUERY_MAX_IN_VALUES = 100;

/** Consume-once bulk archive/read tokens per user/scope in a sliding window. */
export const NOTIFICATION_BULK_PREPARE_LIMIT = 20;
export const NOTIFICATION_BULK_PREPARE_WINDOW_MS = 60_000;

/**
 * Board category drop landed on a team column with more than one workflow
 * state. The client must pick `targetWorkflowStateRefId` and retry.
 */
export const WORKFLOW_STATE_REQUIRED = 'WORKFLOW_STATE_REQUIRED';

export type MyWorkMode = 'assigned' | 'created' | 'delegated' | 'review' | 'subscribed';

export type SavedViewVisibility = 'private' | 'team' | 'workspace';

/** Virtual views. They are not rows — update/delete must reject these ids. */
export const BUILTIN_SAVED_VIEW_KEYS = [
  'all',
  'blocked',
  'in-progress',
  'projects',
  'review',
] as const;

export type BuiltinSavedViewKey = (typeof BUILTIN_SAVED_VIEW_KEYS)[number];

export const builtinSavedViewId = (key: BuiltinSavedViewKey) => `builtin:${key}`;

export const builtinSavedViewKey = (id: string): BuiltinSavedViewKey | undefined => {
  if (!id.startsWith('builtin:')) return undefined;
  const key = id.slice('builtin:'.length);
  return (BUILTIN_SAVED_VIEW_KEYS as readonly string[]).includes(key)
    ? (key as BuiltinSavedViewKey)
    : undefined;
};

export const isBuiltinSavedViewId = (id: string): boolean => builtinSavedViewKey(id) !== undefined;

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
