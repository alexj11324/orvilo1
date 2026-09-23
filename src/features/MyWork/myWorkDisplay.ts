import type { MyWorkMode, WorkQuerySort } from '@orvilo/types';

import { isMyWorkSaveableMode } from './myWorkSaveAs';
import type { WorkQueryResultTask } from './workQueryPaging';

/**
 * Display-options model for My issues (audit D2/D8–D13). Kept pure so the
 * grouping/ordering/filter decisions are testable without rendering.
 *
 * `activityDate` is a client-side presentation grouping: the work-query API
 * has no activity-date dimension (`groupBy` covers attention/status/
 * workflowCategory/none only), so the page fetches the flat activity-ordered
 * list and buckets rows by their day locally.
 */

export type MyWorkListGrouping =
  'activityDate' | 'attention' | 'none' | 'status' | 'workflowCategory';
export type MyWorkBoardGrouping = 'status' | 'workflowCategory';
export type MyWorkOrdering =
  'createdAsc' | 'createdDesc' | 'default' | 'updatedAsc' | 'updatedDesc';
export type MyWorkCompletedWindow = 'all' | 'none' | 'pastDay';

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
  showSubIssues: boolean;
  showTriage: boolean;
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
  showSubIssues: true,
  showTriage: true,
});

/** Grouping choices offered per tab — the tab's Linear default comes first. */
export const myWorkListGroupingOptions = (mode: MyWorkMode): MyWorkListGrouping[] => {
  if (mode === 'assigned') return ['attention', 'status', 'workflowCategory', 'none'];
  if (mode === 'activity') {
    return ['activityDate', 'none', 'status', 'workflowCategory', 'attention'];
  }
  return ['none', 'status', 'workflowCategory', 'attention'];
};

export const MY_WORK_BOARD_GROUPING_OPTIONS: MyWorkBoardGrouping[] = ['workflowCategory', 'status'];

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

/** The `groupBy` actually sent to `myWork` — `activityDate` fetches the flat list. */
export const myWorkServerGroupBy = (
  display: Pick<MyWorkDisplay, 'boardGrouping' | 'grouping'>,
  layout: 'board' | 'list',
): 'attention' | 'none' | 'status' | 'workflowCategory' => {
  if (layout === 'board') return display.boardGrouping;
  return display.grouping === 'activityDate' ? 'none' : display.grouping;
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
      (display.showTriage || task.workflowCategory !== 'triage'),
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
