/**
 * Navigation-attention v4 contracts.
 *
 * Frozen names for Inbox feed versions, WorkQuery AST, saved views, favorites,
 * and action-source receipts. These are types only — not live API responses.
 */

import type {
  NativeInterventionReference,
  NotificationActor,
  NotificationAgent,
} from './notification';
import { TASK_EXECUTION_STATES } from './task/stateModel';

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

/**
 * Presentation buckets the Inbox tabs query by. `action`/`update` mirror the
 * stored row kind; `priority`/`other` are the Linear-style tabs — priority is
 * anything still needing you (undecided action or unread mention) and other
 * carries the rest (updates, decided actions, read mentions).
 */
export type NotificationFeedPriority = 'other' | 'priority';

export type NotificationFeedBucket = NotificationFeedKind | NotificationFeedPriority;

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
const FEED_BUCKETS: readonly NotificationFeedBucket[] = [...FEED_KINDS, 'other', 'priority'];

export const notificationBulkFingerprint = (
  action: NotificationBulkAction,
  chip: NotificationPresentationFilter,
  kind?: NotificationFeedBucket,
): string => (kind ? `${action}:${chip}:${kind}` : `${action}:${chip}`);

/** Server-validated Inbox bulk query. `filter` omitted means the All chip. */
export const parseNotificationBulkFingerprint = (
  action: NotificationBulkAction,
  fingerprint: string,
):
  | { filter?: Exclude<NotificationPresentationFilter, 'all'>; kind?: NotificationFeedBucket }
  | undefined => {
  const parts = fingerprint.split(':');
  if (parts[0] !== action) return undefined;
  const chip = parts[1];
  if (!PRESENTATION_FILTERS.includes(chip as NotificationPresentationFilter)) return undefined;
  const filter =
    chip === 'all' ? undefined : (chip as Exclude<NotificationPresentationFilter, 'all'>);
  if (parts.length === 2) return { filter };
  const kind = parts[2];
  if (parts.length === 3 && FEED_BUCKETS.includes(kind as NotificationFeedBucket)) {
    return { filter, kind: kind as NotificationFeedBucket };
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

/**
 * Plane-style inbox type filters ("Assigned to me" / "Created by me" /
 * "Subscribed by me"). Each narrows the feed to task-resource rows matching
 * that relationship; multiple values are OR'd. `subscribed` additionally
 * excludes rows matching the other two relationships.
 */
export const NOTIFICATION_FEED_TYPE_FILTERS = ['assigned', 'created', 'subscribed'] as const;

export type NotificationFeedTypeFilter = (typeof NOTIFICATION_FEED_TYPE_FILTERS)[number];

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
  /**
   * Who triggered the event — snapshotted at send time. `actor` is a human
   * member, `agent` an agent run; neither present means a system event. Never
   * guessed — unknown sources render as the neutral type glyph.
   */
  actor?: NotificationActor;
  agent?: NotificationAgent;
  availableActions: Array<'archive' | 'decide' | 'dismiss' | 'open' | 'snooze'>;
  content: string;
  /** Verbs the current visitor may send through `workAttention.decide`. */
  decisionVerbs?: DecisionVerb[];
  kind: NotificationFeedKind;
  lastActivityAt: string;
  nativeIntervention?: NativeInterventionReference;
  notificationId: string;
  /** True when this visitor initiated the request and can only withdraw. */
  outgoing?: boolean;
  read: boolean;
  readVersion: number;
  resourceId?: string | null;
  /** Display identifier of the task resource (e.g. `T-501`), resolved live
   *  for the second row line. Absent for non-task resources and unresolved ids. */
  resourceIdentifier?: string | null;
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
  /** Unread mention rows — powers the Mentions tab count chip. */
  unreadMentionCount: number;
  /** Unread rows in the Other tab: updates plus decided actions — everything
   *  badge-worthy that Priority does not already claim. */
  unreadOtherCount: number;
  unreadUpdateCount: number;
}

/**
 * Inbox page payload. `partial` means at least one live source failed to
 * load — remaining cards are still authoritative, not an empty success.
 */
export interface NotificationFeedPage {
  cards: NotificationFeedCard[];
  /** True when another page exists behind `nextCursor`. */
  hasMore: boolean;
  lastReconciledAt: string;
  /** Notification id the next page continues after — null when exhausted. */
  nextCursor: string | null;
  partial: boolean;
  sourceUnavailable: ActionSourceKind[];
}

/** CommandMenu / work search bound so 200 teams stay reachable. */
export const WORK_SEARCH_MAX_PER_TYPE = 200;

export type WorkQueryEntityType = 'project' | 'task';

export type WorkQueryField =
  | 'assigneeAgentId'
  | 'assigneeUserId'
  | 'closedAt'
  | 'completedAt'
  | 'createdAt'
  | 'createdByUserId'
  | 'cycleId'
  | 'delegatedByUserId'
  | 'executionState'
  | 'hasActivity'
  | 'id'
  | 'labelId'
  | 'ownerUserId'
  | 'parentTaskId'
  | 'priority'
  | 'projectId'
  | 'projectMilestoneId'
  | 'reviewerUserId'
  | 'status'
  | 'subscribed'
  | 'teamId'
  | 'text'
  | 'triageStatus'
  | 'updatedAt'
  | 'visibility'
  | 'workflowCategory';

export type WorkQueryOp =
  'between' | 'contains' | 'eq' | 'gte' | 'in' | 'isNotNull' | 'isNull' | 'lt' | 'neq' | 'notIn';

/** Inclusive date window. `between` compiles to `gte from AND lte to`. */
export interface WorkQueryDateRange {
  from: string;
  to: string;
}

export type WorkQueryScalar = { ref: 'currentUser' } | boolean | null | number | string;

export type WorkQueryValue =
  WorkQueryDateRange | WorkQueryScalar | Array<number | string | { ref: 'currentUser' }>;

export interface WorkQueryPredicate {
  field: WorkQueryField;
  op: WorkQueryOp;
  value?: WorkQueryValue;
}

export interface WorkQueryFilter {
  all?: Array<WorkQueryFilter | WorkQueryPredicate>;
  any?: Array<WorkQueryFilter | WorkQueryPredicate>;
}

export type WorkQuerySortField = WorkQueryField | 'createdAt' | 'id' | 'name' | 'updatedAt';

export interface WorkQuerySort {
  direction: 'asc' | 'desc';
  field: WorkQuerySortField;
}

export type WorkQueryLayout = 'board' | 'list';

export type WorkQueryGroupBy =
  | 'activityDate'
  | 'agent'
  | 'assignee'
  | 'attention'
  | 'cycle'
  | 'milestone'
  | 'none'
  | 'priority'
  | 'project'
  | 'status'
  | 'workflowCategory';

/**
 * Second axis (board swimlane or list sub-group). `project` is lane-only — a
 * project column would invent an empty column per readable project. `milestone`
 * is list-only. `agent` is the agent assignee (`assigneeAgentId`); `assignee`
 * is the member. `none` is the same as omitting the field.
 */
export type WorkQuerySubGroupBy =
  | 'agent'
  | 'assignee'
  | 'milestone'
  | 'none'
  | 'priority'
  | 'project'
  | 'status'
  | 'workflowCategory';

/** Unit separator between a board column key and its swimlane key. */
export const WORK_QUERY_BOARD_KEY_SEP = '\u001F';

export type WorkQueryBoardAxis =
  'agent' | 'assignee' | 'priority' | 'project' | 'status' | 'workflowCategory';

export const WORK_QUERY_BOARD_AXIS_PREFIX: Record<WorkQueryBoardAxis, string> = {
  agent: 'ag',
  assignee: 'as',
  priority: 'pr',
  project: 'pj',
  status: 'st',
  workflowCategory: 'wf',
};

/** Sentinel for an empty assignee or project bucket. Not a real id. */
export const WORK_QUERY_BOARD_NONE_KEY = 'none';

export const WORK_QUERY_PRIORITY_KEYS = ['0', '1', '2', '3', '4'] as const;

export const prefixWorkQueryBoardKey = (axis: WorkQueryBoardAxis, raw: string): string =>
  `${WORK_QUERY_BOARD_AXIS_PREFIX[axis]}:${raw}`;

export const workQueryBoardAxisOfKey = (key: string): WorkQueryBoardAxis | undefined => {
  const prefix = key.slice(0, key.indexOf(':'));
  const match = (
    Object.entries(WORK_QUERY_BOARD_AXIS_PREFIX) as [WorkQueryBoardAxis, string][]
  ).find(([, value]) => value === prefix);
  return match?.[0];
};

/** Strip `wf:` / `st:` / `pr:` / `as:` / `pj:`. Unknown keys pass through. */
export const rawWorkQueryBoardKey = (key: string): string => {
  const separator = key.indexOf(':');
  if (separator <= 0) return key;
  return workQueryBoardAxisOfKey(key) ? key.slice(separator + 1) : key;
};

/**
 * `status` and `workflowCategory` are different layers of the task state
 * model, not one state machine: workflow category is the canonical Issue
 * Status, while `status` is the legacy projection of the execution/attention
 * layers. Pairing them as the board's column + lane axes still writes
 * ambiguous moves (each axis drags a different field), so the combination is
 * rejected — that is a query-shape conflict, not a claim that the layers are
 * the same thing.
 */
export const workQueryAxesConflict = (
  column: string | undefined,
  lane: string | undefined,
): boolean => {
  if (!column || !lane || lane === 'none') return false;
  return (
    (column === 'status' && lane === 'workflowCategory') ||
    (column === 'workflowCategory' && lane === 'status')
  );
};

/** Drop a lane that repeats the column or pairs the two status axes. */
export const normalizeWorkQuerySubGroupBy = (
  column: WorkQueryGroupBy | undefined,
  lane: WorkQuerySubGroupBy | undefined,
): Exclude<WorkQuerySubGroupBy, 'none'> | undefined => {
  if (!lane || lane === 'none' || lane === column) return undefined;
  if (workQueryAxesConflict(column, lane)) return undefined;
  return lane;
};

/**
 * Board ordering mode. `manual` orders a board column by the persisted
 * position (same-column drags stick); `field` orders by `query.sort`. Layout,
 * grouping and sort are independent dimensions — board must never silently
 * override the saved sort. Unset means `manual`, the pre-sortMode behavior.
 */
export type WorkQuerySortMode = 'field' | 'manual';

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

/**
 * Legacy `tasks.status` values accepted as board columns — the execution
 * projection axis, used by execution-state "Runs view" boards only.
 * @deprecated `tasks.status` is the legacy compatibility projection — not the
 * Issue Status. Issue boards group by `workflowCategory`
 * ({@link WORK_QUERY_WORKFLOW_COLUMNS}).
 */
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
  /**
   * Query schema epoch. `1` reads `status` predicates as the legacy
   * compatibility projection; {@link normalizeWorkQuery} migrates them onto
   * `workflowCategory` / `executionState`. `2` is the current write epoch —
   * newly saved views never write a `status` predicate.
   */
  schemaVersion: 1 | 2;
  sort?: WorkQuerySort[];
  sortMode?: WorkQuerySortMode;
  /**
   * Board swimlane and list sub-group. Composite keys are the column key,
   * the unit separator, then the lane key.
   */
  subGroupBy?: WorkQuerySubGroupBy;
  /**
   * IANA time zone for `activityDate` buckets. Omitted queries bucket in UTC.
   */
  timeZone?: string;
}

/**
 * Field capability table — the single source for what the visual filter
 * builder may offer per entity. Server compile keeps its own allow-list; a
 * field absent here must still round-trip untouched (preserved, not dropped).
 */
export type WorkQueryValueKind =
  'agent' | 'cycle' | 'date' | 'enum' | 'label' | 'project' | 'team' | 'text' | 'user';

export interface WorkQueryFieldSpec {
  /**
   * `true` when the only legal `eq` operand is `{ref:'currentUser'}` — the UI
   * hides the member picker and the row means "involving me".
   */
  currentUserOnly?: boolean;
  /**
   * Deprecated field — kept in the table so stored predicates still resolve
   * their spec (read-only compatibility for old saved views), but authoring
   * surfaces must not offer it and the builder must not render editable rows
   * for it.
   */
  deprecated?: boolean;
  /** Allowed values for `valueKind === 'enum'`. Numbers for `priority`. */
  enumValues?: readonly (number | string)[];
  field: WorkQueryField;
  ops: readonly WorkQueryOp[];
  valueKind: WorkQueryValueKind;
}

export const TASK_WORKFLOW_CATEGORY_VALUES = [
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const;

/**
 * @deprecated Legacy `tasks.status` values — the compatibility projection,
 * not the Issue Status ({@link TASK_WORKFLOW_CATEGORY_VALUES}).
 */
export const TASK_STATUS_VALUES = [
  'backlog',
  'scheduled',
  'running',
  'paused',
  'failed',
  'completed',
  'canceled',
] as const;

export const TASK_TRIAGE_STATUS_VALUES = [
  'accepted',
  'declined',
  'duplicate',
  'untriaged',
] as const;

export const TASK_PRIORITY_VALUES = [0, 1, 2, 3, 4] as const;

export const PROJECT_STATUS_VALUES = [
  'backlog',
  'active',
  'paused',
  'reviewing',
  'completed',
  'canceled',
  'archived',
] as const;

export const PROJECT_VISIBILITY_VALUES = ['private', 'public'] as const;

export const WORK_QUERY_TASK_FIELD_SPECS: readonly WorkQueryFieldSpec[] = [
  {
    enumValues: TASK_WORKFLOW_CATEGORY_VALUES,
    field: 'workflowCategory',
    ops: ['eq', 'neq', 'in', 'notIn'],
    valueKind: 'enum',
  },
  {
    enumValues: TASK_EXECUTION_STATES,
    field: 'executionState',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'enum',
  },
  {
    deprecated: true,
    enumValues: TASK_STATUS_VALUES,
    field: 'status',
    ops: ['eq', 'neq', 'in', 'notIn'],
    valueKind: 'enum',
  },
  {
    enumValues: TASK_PRIORITY_VALUES,
    field: 'priority',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'enum',
  },
  {
    field: 'assigneeUserId',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'user',
  },
  {
    field: 'assigneeAgentId',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'agent',
  },
  {
    field: 'createdByUserId',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'user',
  },
  {
    currentUserOnly: true,
    field: 'reviewerUserId',
    ops: ['eq', 'isNotNull'],
    valueKind: 'user',
  },
  {
    field: 'projectId',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'project',
  },
  {
    field: 'teamId',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'team',
  },
  {
    field: 'cycleId',
    ops: ['eq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'cycle',
  },
  {
    enumValues: TASK_TRIAGE_STATUS_VALUES,
    field: 'triageStatus',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'enum',
  },
  {
    field: 'labelId',
    ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'],
    valueKind: 'label',
  },
  {
    field: 'createdAt',
    ops: ['isNull', 'isNotNull', 'lt', 'gte', 'between'],
    valueKind: 'date',
  },
  {
    field: 'updatedAt',
    ops: ['isNull', 'isNotNull', 'lt', 'gte', 'between'],
    valueKind: 'date',
  },
  {
    field: 'completedAt',
    ops: ['isNull', 'isNotNull', 'lt', 'gte', 'between'],
    valueKind: 'date',
  },
  {
    field: 'text',
    ops: ['contains'],
    valueKind: 'text',
  },
  {
    currentUserOnly: true,
    field: 'subscribed',
    ops: ['eq'],
    valueKind: 'user',
  },
  {
    currentUserOnly: true,
    field: 'hasActivity',
    ops: ['eq'],
    valueKind: 'user',
  },
];

export const WORK_QUERY_PROJECT_FIELD_SPECS: readonly WorkQueryFieldSpec[] = [
  {
    enumValues: PROJECT_STATUS_VALUES,
    field: 'status',
    ops: ['eq', 'neq', 'in', 'notIn'],
    valueKind: 'enum',
  },
  {
    field: 'teamId',
    ops: ['eq', 'isNull', 'isNotNull'],
    valueKind: 'team',
  },
  {
    field: 'ownerUserId',
    ops: ['eq', 'neq', 'isNull', 'isNotNull'],
    valueKind: 'user',
  },
  {
    enumValues: PROJECT_VISIBILITY_VALUES,
    field: 'visibility',
    ops: ['eq', 'neq'],
    valueKind: 'enum',
  },
];

export const workQueryFieldSpecs = (
  entityType: WorkQueryEntityType,
): readonly WorkQueryFieldSpec[] =>
  entityType === 'project' ? WORK_QUERY_PROJECT_FIELD_SPECS : WORK_QUERY_TASK_FIELD_SPECS;

export const workQueryFieldSpec = (
  entityType: WorkQueryEntityType,
  field: string,
): WorkQueryFieldSpec | undefined =>
  workQueryFieldSpecs(entityType).find((spec) => spec.field === field);

/* --------------- schema v1 → v2 migration --------------- */

/**
 * v1 `status` values that only ever meant the Issue Workflow axis — the
 * mapping onto `workflowCategory` is unambiguous.
 */
const LEGACY_STATUS_TO_WORKFLOW: Readonly<Record<string, string>> = {
  backlog: 'backlog',
  canceled: 'canceled',
  completed: 'done',
};

/**
 * v1 `status` values that only ever described an execution — they migrate
 * onto `executionState` (the PR-A projection of `task_dispatches.phase` /
 * `task_topics.run_state`, which the legacy column itself projected).
 */
const LEGACY_STATUS_TO_EXECUTION: Readonly<Record<string, string>> = {
  failed: 'failed',
  paused: 'outcome_unknown',
  running: 'running',
  scheduled: 'queued',
};

const isWorkQueryPredicate = (
  node: WorkQueryFilter | WorkQueryPredicate,
): node is WorkQueryPredicate => 'field' in node && 'op' in node;

/**
 * One v1 `status` predicate rewritten onto the two-layer model, or `null`
 * when a member is not migratable (unknown value — the caller keeps the
 * legacy predicate, which still compiles against `tasks.status`).
 */
const migrateStatusPredicate = (
  predicate: WorkQueryPredicate,
): WorkQueryFilter | WorkQueryPredicate | null => {
  const toParts = (values: readonly string[]) => {
    const workflow: string[] = [];
    const execution: string[] = [];
    for (const value of values) {
      const wf = LEGACY_STATUS_TO_WORKFLOW[value];
      const ex = LEGACY_STATUS_TO_EXECUTION[value];
      if (wf) workflow.push(wf);
      else if (ex) execution.push(ex);
      else return null;
    }
    return { execution, workflow };
  };

  if (predicate.op === 'eq' || predicate.op === 'neq') {
    if (typeof predicate.value !== 'string') return predicate;
    const parts = toParts([predicate.value]);
    if (!parts) return null;
    if (parts.workflow.length) {
      return { field: 'workflowCategory', op: predicate.op, value: parts.workflow[0] };
    }
    return { field: 'executionState', op: predicate.op, value: parts.execution[0] };
  }

  if (predicate.op === 'in' || predicate.op === 'notIn') {
    const values = Array.isArray(predicate.value)
      ? predicate.value.filter((item): item is string => typeof item === 'string')
      : [];
    if (
      values.length === 0 ||
      values.length !== (Array.isArray(predicate.value) ? predicate.value.length : 0)
    ) {
      return null;
    }
    const parts = toParts(values);
    if (!parts) return null;
    const workflowPredicate: WorkQueryPredicate | undefined = parts.workflow.length
      ? { field: 'workflowCategory', op: predicate.op, value: parts.workflow }
      : undefined;
    const executionPredicate: WorkQueryPredicate | undefined = parts.execution.length
      ? { field: 'executionState', op: predicate.op, value: parts.execution }
      : undefined;
    if (workflowPredicate && executionPredicate) {
      // `in` splits into an OR (either layer may match); `notIn` stays an AND
      // (the task must match neither layer's list).
      return predicate.op === 'in'
        ? { any: [workflowPredicate, executionPredicate] }
        : { all: [workflowPredicate, executionPredicate] };
    }
    return workflowPredicate ?? executionPredicate ?? null;
  }

  return predicate;
};

const migrateWorkQueryFilter = (node: WorkQueryFilter | undefined): WorkQueryFilter | undefined => {
  if (!node) return node;
  const migrateNodes = (
    nodes: Array<WorkQueryFilter | WorkQueryPredicate> | undefined,
  ): Array<WorkQueryFilter | WorkQueryPredicate> | undefined => {
    if (!nodes) return nodes;
    return nodes.map((child) => {
      if (!isWorkQueryPredicate(child)) return migrateWorkQueryFilter(child)!;
      if (child.field !== 'status') return child;
      const migrated = migrateStatusPredicate(child);
      return migrated ?? child;
    });
  };
  return { all: migrateNodes(node.all), any: migrateNodes(node.any) };
};

/**
 * Normalize a stored or incoming query to schema v2 semantics: on task
 * queries, `status` predicates migrate to `workflowCategory` where the mapping
 * is unambiguous, otherwise to `executionState`; unmigratable members keep the
 * legacy predicate (read-only compatibility — `tasks.status` still compiles).
 * Project queries are untouched — `projects.status` is a real field, not the
 * legacy projection. The stored row is never rewritten by this — callers
 * decide what to persist.
 */
export const normalizeWorkQuery = (query: WorkQuery): WorkQuery => ({
  ...query,
  filter: query.entityType === 'task' ? migrateWorkQueryFilter(query.filter) : query.filter,
  schemaVersion: 2,
});

export const NO_PROJECT_PREDICATE = {
  field: 'projectId',
  op: 'isNull',
} as const satisfies WorkQueryPredicate;

const isNoProjectPredicate = (node: WorkQueryFilter | WorkQueryPredicate): boolean =>
  'field' in node && node.field === 'projectId' && node.op === 'isNull';

export const DELEGATED_PREDICATE = {
  field: 'delegatedByUserId',
  op: 'eq',
  value: { ref: 'currentUser' },
} as const satisfies WorkQueryPredicate;

const isDelegatedPredicate = (node: WorkQueryFilter | WorkQueryPredicate): boolean =>
  'field' in node && node.field === 'delegatedByUserId';

/** AND `delegatedByUserId = currentUser` onto a query — delegation is a filter, not a tab. */
export const applyDelegatedFilter = (query: WorkQuery, enabled: boolean): WorkQuery => {
  const any = query.filter?.any;
  const all = (query.filter?.all ?? []).filter((node) => !isDelegatedPredicate(node));
  if (enabled) all.push(DELEGATED_PREDICATE);
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

/**
 * `assigned` / `created` / `subscribed` / `activity` are the My issues tabs.
 * `delegated` is a filter flag on those tabs, and `review` moved to Reviews —
 * both stay accepted server-side so older clients and deep links keep working.
 */
export type MyWorkMode =
  'activity' | 'assigned' | 'created' | 'delegated' | 'review' | 'subscribed';

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
