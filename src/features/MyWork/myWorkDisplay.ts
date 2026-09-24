import type { MyWorkMode, WorkQuerySort } from '@orvilo/types';
import { WORK_QUERY_STATUS_COLUMNS } from '@orvilo/types';

import { isMyWorkSaveableMode } from './myWorkSaveAs';
import type { WorkQueryResultTask } from './workQueryPaging';

/**
 * Display-options model for My issues (audit D2/D8–D13). Kept pure so the
 * grouping/ordering/filter decisions are testable without rendering.
 *
 * `activityDate` is a client-side presentation grouping: the work-query API
 * has no activity-date dimension (`groupBy` covers attention/status/
 * workflowCategory/none only), so the page fetches the flat activity-ordered
 * list and buckets rows by their day locally. `priority`/`project`/`assignee`
 * group the same way — real row fields the wire enum cannot express, bucketed
 * over the loaded flat page (`workQueryFieldSections`).
 */

export type MyWorkListGrouping =
  | 'activityDate'
  | 'assignee'
  | 'attention'
  | 'none'
  | 'priority'
  | 'project'
  | 'status'
  | 'workflowCategory';
export type MyWorkBoardGrouping = 'status' | 'workflowCategory';
/**
 * Second-level list grouping — the row fields Linear's "Sub-grouping" menu
 * offers on My issues. Always bucketed client-side over the loaded rows, so
 * it composes with any primary grouping (`none` disables it).
 */
export type MyWorkSubGrouping = 'assignee' | 'none' | 'priority' | 'project' | 'status';
export type MyWorkOrdering =
  'createdAsc' | 'createdDesc' | 'default' | 'updatedAsc' | 'updatedDesc';
export type MyWorkCompletedWindow = 'all' | 'none' | 'pastDay';

/**
 * Per-row property visibility — Linear's display-options panel lists ID,
 * status, assignee, priority, project, due date, milestone, labels, links,
 * time in status, created, updated and pull requests. The task row model
 * only backs the entries below (`updated` covers the trailing date chip;
 * `workflowBadge` is the Orvilo-native state badge); the rest stay omitted
 * rather than rendered as dead toggles.
 */
export type MyWorkRowProperty =
  | 'assignee'
  | 'labels'
  | 'milestone'
  | 'priority'
  | 'project'
  | 'status'
  | 'updated'
  | 'workflowBadge';

/** Panel order follows Linear's display-properties list. */
export const MY_WORK_ROW_PROPERTIES: readonly MyWorkRowProperty[] = [
  'status',
  'assignee',
  'priority',
  'project',
  'milestone',
  'labels',
  'updated',
  'workflowBadge',
];

export type MyWorkRowProperties = Record<MyWorkRowProperty, boolean>;

export const MY_WORK_DEFAULT_ROW_PROPERTIES: MyWorkRowProperties = {
  assignee: true,
  labels: true,
  milestone: true,
  priority: true,
  project: true,
  status: true,
  updated: true,
  workflowBadge: true,
};

export interface MyWorkDisplay {
  /** Column dimension when the board layout is active. */
  boardGrouping: MyWorkBoardGrouping;
  /** Completed-issues window — client-side display filter (audit D12). */
  completed: MyWorkCompletedWindow;
  /** List grouping; `activityDate` buckets client-side by activity day. */
  grouping: MyWorkListGrouping;
  /**
   * Indent children under parents already in the list — Linear's "nested
   * sub-issues: Show matching". Created defaults to flat ("Hide").
   */
  nestedSubIssues: boolean;
  /**
   * `default` keeps the mode's native ordering — importance for Assigned
   * (client-side within groups), the server sort elsewhere.
   */
  ordering: MyWorkOrdering;
  /** Row-chip visibility toggles (Linear's "Display properties" list). */
  properties: MyWorkRowProperties;
  showSubIssues: boolean;
  showTriage: boolean;
  /**
   * Optional second-level grouping inside each primary group — Linear's
   * "Sub-grouping". `none` renders the flat group body as before.
   */
  subGrouping: MyWorkSubGrouping;
}

/** Linear's per-tab list grouping (BEHAVIORS.md): Assigned=focus, Activity=my activity, rest flat. */
export const defaultMyWorkGrouping = (mode: MyWorkMode): MyWorkListGrouping => {
  if (mode === 'assigned') return 'attention';
  if (mode === 'activity') return 'activityDate';
  return 'none';
};

export const defaultMyWorkDisplay = (mode: MyWorkMode): MyWorkDisplay => ({
  boardGrouping: 'workflowCategory',
  // Assigned defaults to "Completed issues: Past day"; the other tabs show all.
  completed: mode === 'assigned' ? 'pastDay' : 'all',
  grouping: defaultMyWorkGrouping(mode),
  // Audit D13: Assigned/Subscribed/Activity nest matching children; Created
  // lists them flat.
  nestedSubIssues: mode !== 'created',
  ordering: 'default',
  properties: { ...MY_WORK_DEFAULT_ROW_PROPERTIES },
  showSubIssues: true,
  // Linear's My Issues Assigned tab surfaces triage issues assigned to you in
  // their own focus-order section, so the default stays visible; the display
  // option is the opt-out. (Team view defaults differ — those hide them.)
  showTriage: true,
  subGrouping: 'none',
});

const MY_WORK_BOARD_GROUPINGS: readonly MyWorkBoardGrouping[] = ['status', 'workflowCategory'];
const MY_WORK_COMPLETED_WINDOWS: readonly MyWorkCompletedWindow[] = ['all', 'none', 'pastDay'];
const MY_WORK_ORDERINGS: readonly MyWorkOrdering[] = [
  'createdAsc',
  'createdDesc',
  'default',
  'updatedAsc',
  'updatedDesc',
];
export const MY_WORK_SUB_GROUPING_OPTIONS: readonly MyWorkSubGrouping[] = [
  'none',
  'status',
  'priority',
  'assignee',
  'project',
];

/**
 * What a persisted payload may carry — `properties` rests as a loose
 * `Record<string, boolean>` in `SystemStatus` (the store cannot import this
 * file's key union), so the accepted shape is wider than `MyWorkDisplay` and
 * the normalizer picks only the known keys.
 */
export type MyWorkDisplayPersisted = Omit<Partial<MyWorkDisplay>, 'properties'> & {
  properties?: Record<string, boolean> | null;
};

/**
 * Merge a persisted display payload over the tab's defaults. Unknown enum
 * values fall back to the Linear default for the tab; property keys outside
 * `MY_WORK_ROW_PROPERTIES` are dropped so stale toggles never leak into the
 * UI. Groupings the tab does not offer normalize away rather than render a
 * section the menu cannot express.
 */
export const normalizeMyWorkDisplay = (
  mode: MyWorkMode,
  raw?: MyWorkDisplayPersisted | null,
): MyWorkDisplay => {
  const defaults = defaultMyWorkDisplay(mode);
  const source = raw ?? {};
  const offered = myWorkListGroupingOptions(mode);
  const grouping =
    source.grouping && (offered as readonly string[]).includes(source.grouping)
      ? source.grouping
      : defaults.grouping;
  const boardGrouping = MY_WORK_BOARD_GROUPINGS.includes(
    source.boardGrouping as MyWorkBoardGrouping,
  )
    ? (source.boardGrouping as MyWorkBoardGrouping)
    : defaults.boardGrouping;
  const completed = MY_WORK_COMPLETED_WINDOWS.includes(source.completed as MyWorkCompletedWindow)
    ? (source.completed as MyWorkCompletedWindow)
    : defaults.completed;
  const ordering = MY_WORK_ORDERINGS.includes(source.ordering as MyWorkOrdering)
    ? (source.ordering as MyWorkOrdering)
    : defaults.ordering;
  const subGrouping = MY_WORK_SUB_GROUPING_OPTIONS.includes(source.subGrouping as MyWorkSubGrouping)
    ? (source.subGrouping as MyWorkSubGrouping)
    : defaults.subGrouping;
  const properties = { ...defaults.properties };
  if (source.properties && typeof source.properties === 'object') {
    for (const key of MY_WORK_ROW_PROPERTIES) {
      const value = source.properties[key];
      if (typeof value === 'boolean') properties[key] = value;
    }
  }
  return {
    boardGrouping,
    completed,
    grouping,
    nestedSubIssues:
      typeof source.nestedSubIssues === 'boolean'
        ? source.nestedSubIssues
        : defaults.nestedSubIssues,
    ordering,
    properties,
    showSubIssues:
      typeof source.showSubIssues === 'boolean' ? source.showSubIssues : defaults.showSubIssues,
    showTriage: typeof source.showTriage === 'boolean' ? source.showTriage : defaults.showTriage,
    subGrouping,
  };
};

/**
 * Grouping choices offered per tab — the tab's Linear default comes first,
 * then the status dimensions, then the row-field groupings Linear's menu
 * lists (Priority / Project / Assignee) which bucket client-side.
 */
export const myWorkListGroupingOptions = (mode: MyWorkMode): MyWorkListGrouping[] => {
  if (mode === 'assigned') {
    return ['attention', 'status', 'workflowCategory', 'priority', 'project', 'assignee', 'none'];
  }
  if (mode === 'activity') {
    return [
      'activityDate',
      'status',
      'workflowCategory',
      'priority',
      'project',
      'assignee',
      'attention',
      'none',
    ];
  }
  return ['none', 'status', 'workflowCategory', 'priority', 'project', 'assignee', 'attention'];
};

export const MY_WORK_BOARD_GROUPING_OPTIONS: MyWorkBoardGrouping[] = ['workflowCategory', 'status'];

/**
 * Sub-grouping choices for the display-options menu. The option matching the
 * active primary grouping is dropped — a second level on the same dimension
 * would produce single-row groups.
 */
export const myWorkSubGroupingOptions = (grouping: MyWorkListGrouping): MyWorkSubGrouping[] =>
  MY_WORK_SUB_GROUPING_OPTIONS.filter((option) => option === 'none' || option !== grouping);

/**
 * Non-default orderings need the generic work-query endpoint (the `myWork`
 * endpoint keeps the mode's server sort). `subscribed`/`activity` semantics
 * live in mode-injected SQL the generic query cannot express, so those tabs
 * only expose `default`.
 */
export const myWorkOrderingOptions = (mode: MyWorkMode): MyWorkOrdering[] =>
  isMyWorkSaveableMode(mode)
    ? ['default', 'updatedDesc', 'updatedAsc', 'createdDesc', 'createdAsc']
    : ['default'];

/** Groupings bucketed client-side over the flat feed — they never reach the wire. */
export const isMyWorkClientGrouping = (
  grouping: MyWorkListGrouping,
): grouping is 'activityDate' | 'assignee' | 'priority' | 'project' =>
  grouping === 'activityDate' ||
  grouping === 'assignee' ||
  grouping === 'priority' ||
  grouping === 'project';

/** The `groupBy` actually sent to `myWork` — client-side groupings fetch the flat list. */
export const myWorkServerGroupBy = (
  display: Pick<MyWorkDisplay, 'boardGrouping' | 'grouping'>,
  layout: 'board' | 'list',
): 'attention' | 'none' | 'status' | 'workflowCategory' => {
  if (layout === 'board') return display.boardGrouping;
  return isMyWorkClientGrouping(display.grouping) ? 'none' : display.grouping;
};

export const MY_WORK_ORDERING_SORTS: Record<Exclude<MyWorkOrdering, 'default'>, WorkQuerySort[]> = {
  createdAsc: [
    { direction: 'asc', field: 'createdAt' },
    { direction: 'asc', field: 'id' },
  ],
  createdDesc: [
    { direction: 'desc', field: 'createdAt' },
    { direction: 'asc', field: 'id' },
  ],
  updatedAsc: [
    { direction: 'asc', field: 'updatedAt' },
    { direction: 'asc', field: 'id' },
  ],
  updatedDesc: [
    { direction: 'desc', field: 'updatedAt' },
    { direction: 'asc', field: 'id' },
  ],
};

const timestampOf = (value: Date | number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

/**
 * Linear's "importance" rank: urgent → high → normal → low → none. Orvilo
 * priorities are `1` urgent, `2` high, `3` normal, `4` low, `0`/null none —
 * matching the server's attention CASE (`priority = 1` ⇒ urgent).
 */
export const taskImportanceRank = (priority: number | null | undefined): number => {
  if (priority === 1) return 0;
  if (priority === 2) return 1;
  if (priority === 3) return 2;
  if (priority === 4) return 3;
  return 4;
};

export const compareTasksByImportance = (
  left: Pick<WorkQueryResultTask, 'priority' | 'updatedAt'>,
  right: Pick<WorkQueryResultTask, 'priority' | 'updatedAt'>,
): number => {
  const rank = taskImportanceRank(left.priority) - taskImportanceRank(right.priority);
  if (rank !== 0) return rank;
  return timestampOf(right.updatedAt) - timestampOf(left.updatedAt);
};

/** Stable importance ordering — the page only sorts the loaded page, not the full set. */
export const sortTasksByImportance = <
  T extends Pick<WorkQueryResultTask, 'priority' | 'updatedAt'>,
>(
  tasks: readonly T[],
): T[] => [...tasks].sort(compareTasksByImportance);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Completed-issues window: 'all' keeps everything, 'pastDay' keeps the last
 * 24h. "Completed" matches the server's closed set — `completed`/`canceled`
 * statuses both count (Linear's window covers canceled work too).
 */
export const isCompletedWindowHidden = (
  task: Pick<WorkQueryResultTask, 'completedAt' | 'status' | 'updatedAt'>,
  completed: MyWorkCompletedWindow,
  now: number,
): boolean => {
  if (completed === 'all' || (task.status !== 'completed' && task.status !== 'canceled')) {
    return false;
  }
  if (completed === 'none') return true;
  return timestampOf(task.completedAt ?? task.updatedAt) < now - DAY_MS;
};

/** Whether display filters drop any rendered rows (drives honest group counts). */
export const myWorkDisplayFiltersRows = (display: MyWorkDisplay): boolean =>
  display.completed !== 'all' || !display.showSubIssues || !display.showTriage;

export const filterMyWorkTaskRows = <T extends WorkQueryResultTask>(
  tasks: readonly T[],
  display: MyWorkDisplay,
  now: number = Date.now(),
): T[] => {
  if (!myWorkDisplayFiltersRows(display)) return [...tasks];
  return tasks.filter(
    (task) =>
      !isCompletedWindowHidden(task, display.completed, now) &&
      (display.showSubIssues || !task.parentTaskId) &&
      // "Show triage issues" covers both triage axes: queue membership
      // (`triageStatus === 'untriaged'`, already excluded server-side) and
      // cards sitting in a triage-category workflow lane.
      (display.showTriage ||
        (task.triageStatus !== 'untriaged' && task.workflowCategory !== 'triage')),
  );
};

/* ------------------------- activity-date grouping ------------------------- */

export interface MyWorkDaySection<T> {
  /** `YYYY-MM-DD` local day — stable React key and label source. */
  key: string;
  tasks: T[];
  total: number;
}

const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toDate = (value: Date | number | string | null | undefined): Date | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** Local-day bucket key (`YYYY-MM-DD`) — `null` input lands in `unknown`. */
export const activityDayKey = (value: Date | number | string | null | undefined): string => {
  const date = toDate(value);
  if (!date) return 'unknown';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Human label for a day bucket: Today / Yesterday / a localized short date.
 * `labels` carries the translated words so the helper stays i18n-free.
 */
export const activityDayTitle = (
  key: string,
  options: {
    labels: { today: string; unknown: string; yesterday: string };
    locale?: string;
    now?: Date;
  },
): string => {
  if (key === 'unknown') return options.labels.unknown;
  const now = options.now ?? new Date();
  if (key === activityDayKey(now)) return options.labels.today;
  if (key === activityDayKey(new Date(startOfLocalDay(now).getTime() - DAY_MS))) {
    return options.labels.yesterday;
  }
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(options.locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
};

/**
 * Bucket a flat activity-ordered list into day sections. Rows arrive ordered
 * by real activity (the server's `taskActivityAt`); bucketing preserves that
 * arrival order — the first row of a day opens its section.
 */
export const workQueryActivitySections = <T extends WorkQueryResultTask>(
  tasks: readonly T[],
  activityAtOf: (task: T) => Date | number | string | null | undefined = (task) => task.updatedAt,
): MyWorkDaySection<T>[] => {
  const buckets = new Map<string, T[]>();
  for (const task of tasks) {
    const key = activityDayKey(activityAtOf(task));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }
  return [...buckets.entries()].map(([key, bucketTasks]) => ({
    key,
    tasks: bucketTasks,
    total: bucketTasks.length,
  }));
};

/* ------------------- field groupings (priority/project/assignee) ------------------- */

export interface MyWorkFieldSection<T> {
  key: string;
  tasks: T[];
  title: string;
}

/**
 * Bucket a flat (`groupBy: 'none'`) feed by a row field the work-query enum
 * cannot express — the same client-side contract as the activity-date
 * sections. Arrival order is preserved inside each section; sections sort by
 * `rankOf` then title, and the null bucket ("No project" / "Unassigned")
 * trails the named groups like Linear's menus. Counts reflect the loaded
 * page, so Load-more keeps appending under the bottom of the list.
 */
export const workQueryFieldSections = <T>(
  tasks: readonly T[],
  options: {
    /** Bucket key — `null`/`undefined` lands in the trailing "no field" group. */
    keyOf: (task: T) => number | string | null | undefined;
    /** Lower rank sorts first; ties fall back to the title. Null always trails. */
    rankOf?: (key: string | null) => number;
    titleOf: (key: string | null) => string;
  },
): MyWorkFieldSection<T>[] => {
  const buckets = new Map<string | null, T[]>();
  for (const task of tasks) {
    const raw = options.keyOf(task);
    const key = raw === null || raw === undefined ? null : String(raw);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }
  const rankOf = options.rankOf ?? (() => 0);
  return [...buckets.entries()]
    .sort(([left], [right]) => {
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      const byRank = rankOf(left) - rankOf(right);
      if (byRank !== 0) return byRank;
      return options.titleOf(left).localeCompare(options.titleOf(right));
    })
    .map(([key, bucketTasks]) => ({
      key: key ?? 'none',
      tasks: bucketTasks,
      title: options.titleOf(key),
    }));
};

/**
 * Priority group order — Linear's Urgent → High → Normal → Low → No priority.
 * Keys are the bucket keys `workQueryFieldSections` produces for
 * `keyOf: task.priority` (i.e. the raw priority value as a string).
 */
export const myWorkPriorityGroupRank = (key: string | null): number =>
  key === null ? Number.MAX_SAFE_INTEGER : taskImportanceRank(Number(key));

/**
 * Status sub-group order — the shared kanban column order (`backlog` first,
 * `canceled` last); unknown statuses sort just before the null bucket.
 */
export const myWorkStatusGroupRank = (key: string | null): number => {
  if (key === null) return Number.MAX_SAFE_INTEGER;
  const index = (WORK_QUERY_STATUS_COLUMNS as readonly string[]).indexOf(key);
  return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index;
};

/** `taskDetail.priority.*` (chat ns) label key per Orvilo priority value. */
export const MY_WORK_PRIORITY_LABEL_KEYS: Record<number, string> = {
  0: 'taskDetail.priority.none',
  1: 'taskDetail.priority.urgent',
  2: 'taskDetail.priority.high',
  3: 'taskDetail.priority.normal',
  4: 'taskDetail.priority.low',
};

/* ------------------------------- row clicks ------------------------------- */

/**
 * Descendants that own their click (status/priority menus, assignee popovers,
 * action icons, links). Peek mode intercepts row clicks in the capture phase,
 * so it must let these through — base-ui Menu/Popover triggers expose
 * `aria-haspopup`, and `data-popup-open` marks the open ones.
 */
export const ROW_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="tab"]',
  '[aria-haspopup]',
  '[data-popup-open]',
  '[data-row-interactive]',
].join(', ');

export const isInteractiveRowClick = (target: unknown): boolean =>
  typeof Element !== 'undefined' &&
  target instanceof Element &&
  Boolean(target.closest(ROW_INTERACTIVE_SELECTOR));

/** Labels for the ordering dropdown — `default` varies by tab in Linear. */
export const myWorkOrderingDefaultKey = (mode: MyWorkMode): string => {
  if (mode === 'assigned') return 'myWork.ordering.importance';
  if (mode === 'activity') return 'myWork.ordering.activity';
  return 'myWork.ordering.created';
};
