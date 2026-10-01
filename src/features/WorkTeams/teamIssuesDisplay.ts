import type {
  WorkQueryFilter,
  WorkQueryGroupBy,
  WorkQueryLayout,
  WorkQuerySort,
} from '@orvilo/types';

import { isCompletedWindowHidden } from '@/features/MyWork/myWorkDisplay';
import type { WorkQueryResultTask } from '@/features/MyWork/workQueryPaging';

import { ALL_TEAM_CYCLES } from './teamWorkQuery';

/**
 * Team issues display + URL state (audit I5–I7, I14, §C chrome residuals).
 *
 * Linear's `/team/:key/{active,backlog,all}` keeps its layout/scope/display
 * state addressable — reload and Back/forward restore the same surface — so
 * every control writes a query param instead of a `useState`. Params are
 * omitted at their defaults so a clean URL stays `?tab=issues`.
 *
 * `grouping` is shared across layouts: a value valid only for the other
 * layout falls back to that layout's default without being rewritten, so a
 * list↔board round trip restores the user's pick.
 */

export type TeamIssuesListGrouping =
  'assignee' | 'cycle' | 'none' | 'priority' | 'project' | 'status' | 'workflowCategory';
export type TeamIssuesBoardGrouping = 'assignee' | 'priority' | 'status' | 'workflowCategory';
export type TeamIssuesBoardLane = 'assignee' | 'none' | 'priority' | 'project' | 'status';
export type TeamIssuesOrdering =
  'createdAsc' | 'createdDesc' | 'default' | 'updatedAsc' | 'updatedDesc';
export type TeamIssuesCompletedWindow = 'all' | 'none' | 'pastDay';

export interface TeamIssuesDisplay {
  /** Column dimension when the board layout is active. */
  boardGrouping: TeamIssuesBoardGrouping;
  /** Swimlane under the board columns. `none` is a single row of columns. */
  boardLane: TeamIssuesBoardLane;
  /** Columns the user collapsed, persisted in the URL. */
  collapsedColumns: string[];
  /** List groups the user collapsed, persisted in the URL. */
  collapsedGroups: string[];
  /** Completed-issues window — compiled into the work query (Linear's "Completed issues"). */
  completed: TeamIssuesCompletedWindow;
  /** List grouping. Priority, project, assignee and cycle are server axes. */
  grouping: TeamIssuesListGrouping;
  /** Indent children under parents already in the list (Linear's nested sub-issues). */
  nestedSubIssues: boolean;
  /** `default` keeps the server's team ordering — board drags stay manual. */
  ordering: TeamIssuesOrdering;
  /** Row property: the project chip on each row (Linear's "Project" display property). */
  projectChip: boolean;
  /** Board only — keep empty columns mounted (Linear hides them by default). */
  showEmptyColumns: boolean;
  showSubIssues: boolean;
}

export const DEFAULT_TEAM_ISSUES_DISPLAY: TeamIssuesDisplay = {
  boardGrouping: 'workflowCategory',
  boardLane: 'none',
  collapsedColumns: [],
  collapsedGroups: [],
  completed: 'all',
  // Same workflow states as the board, so every group header draws the glyph
  // of the row status marks under it (Linear groups its list by Status).
  grouping: 'workflowCategory',
  nestedSubIssues: true,
  ordering: 'default',
  projectChip: true,
  showEmptyColumns: false,
  showSubIssues: true,
};

export const TEAM_ISSUES_LIST_GROUPINGS: readonly TeamIssuesListGrouping[] = [
  'workflowCategory',
  'status',
  'priority',
  'project',
  'assignee',
  'cycle',
  'none',
];

export const TEAM_ISSUES_BOARD_GROUPINGS: readonly TeamIssuesBoardGrouping[] = [
  'workflowCategory',
  'status',
  'priority',
  'assignee',
];

export const TEAM_ISSUES_BOARD_LANES: readonly TeamIssuesBoardLane[] = [
  'none',
  'status',
  'priority',
  'assignee',
  'project',
];

export const teamIssuesBoardLane = (
  grouping: TeamIssuesBoardGrouping,
  lane: TeamIssuesBoardLane,
): TeamIssuesBoardLane => {
  if (lane === 'none' || lane === grouping) return 'none';
  if (grouping === 'workflowCategory' && lane === 'status') return 'none';
  if (grouping === 'status' && lane === 'status') return 'none';
  return lane;
};

export const TEAM_ISSUES_ORDERINGS: readonly TeamIssuesOrdering[] = [
  'default',
  'updatedDesc',
  'updatedAsc',
  'createdDesc',
  'createdAsc',
];

export const TEAM_ISSUES_COMPLETED_WINDOWS: readonly TeamIssuesCompletedWindow[] = [
  'all',
  'pastDay',
  'none',
];

/** The `groupBy` sent on the wire. Board columns stay on `boardGrouping`. */
export const teamIssuesServerGroupBy = (
  display: Pick<TeamIssuesDisplay, 'boardGrouping' | 'grouping'>,
  layout: WorkQueryLayout,
): WorkQueryGroupBy => {
  if (layout === 'board') return display.boardGrouping;
  return display.grouping;
};

/** Hide sub-issues in the query so the server total matches the list. */
export const teamIssuesVisibilityQueryFilter = (
  display: Pick<TeamIssuesDisplay, 'showSubIssues'>,
): WorkQueryFilter | undefined =>
  display.showSubIssues
    ? undefined
    : { all: [{ field: 'parentTaskId', op: 'isNull' }] };

/** Ordering → work-query sort; `default` leaves the server ordering untouched. */
export const TEAM_ISSUES_ORDERING_SORTS: Record<
  Exclude<TeamIssuesOrdering, 'default'>,
  WorkQuerySort[]
> = {
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

/** Whether display filters drop any rendered rows (drives honest group counts). */
export const teamIssuesDisplayFiltersRows = (
  display: Pick<TeamIssuesDisplay, 'completed' | 'showSubIssues'>,
): boolean => display.completed !== 'all' || !display.showSubIssues;

/**
 * Display-only pass over the loaded page: the completed window hides closed
 * rows past the window, and the sub-issues toggle drops child rows (Linear's
 * "Sub-issues: Hide"). Ordering is server-side, never re-sorted here.
 */
export const filterTeamIssueRows = <T extends WorkQueryResultTask>(
  tasks: readonly T[],
  display: Pick<TeamIssuesDisplay, 'completed' | 'showSubIssues'>,
  now: number = Date.now(),
): T[] => {
  if (!teamIssuesDisplayFiltersRows(display)) return [...tasks];
  return tasks.filter(
    (task) =>
      !isCompletedWindowHidden(task, display.completed, now) &&
      (display.showSubIssues || !task.parentTaskId),
  );
};

/* ------------------------------- URL state ------------------------------- */

export interface TeamIssuesUrlState {
  cycleId: string;
  display: TeamIssuesDisplay;
  /** Serialized work-query filter (`?filter=`). Null when the param is absent. */
  filter: string | null;
  layout: WorkQueryLayout;
  noProject: boolean;
}

const parseListGrouping = (value: string | null): TeamIssuesListGrouping =>
  (TEAM_ISSUES_LIST_GROUPINGS as readonly string[]).includes(value ?? '')
    ? (value as TeamIssuesListGrouping)
    : DEFAULT_TEAM_ISSUES_DISPLAY.grouping;

const parseBoardGrouping = (value: string | null): TeamIssuesBoardGrouping =>
  (TEAM_ISSUES_BOARD_GROUPINGS as readonly string[]).includes(value ?? '')
    ? (value as TeamIssuesBoardGrouping)
    : DEFAULT_TEAM_ISSUES_DISPLAY.boardGrouping;

const parseBoardLane = (value: string | null): TeamIssuesBoardLane =>
  (TEAM_ISSUES_BOARD_LANES as readonly string[]).includes(value ?? '')
    ? (value as TeamIssuesBoardLane)
    : DEFAULT_TEAM_ISSUES_DISPLAY.boardLane;

const parseCollapsedColumns = (value: string | null): string[] =>
  value
    ? value
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
    : [];

const parseOrdering = (value: string | null): TeamIssuesOrdering =>
  (TEAM_ISSUES_ORDERINGS as readonly string[]).includes(value ?? '')
    ? (value as TeamIssuesOrdering)
    : DEFAULT_TEAM_ISSUES_DISPLAY.ordering;

const parseCompleted = (value: string | null): TeamIssuesCompletedWindow =>
  (TEAM_ISSUES_COMPLETED_WINDOWS as readonly string[]).includes(value ?? '')
    ? (value as TeamIssuesCompletedWindow)
    : DEFAULT_TEAM_ISSUES_DISPLAY.completed;

/**
 * Read the issues-surface state off the current params. The board layout is
 * the reference default (`?layout=` only appears for the list), and every
 * toggle parses to its default when the param is absent or malformed.
 */
export const readTeamIssuesUrlState = (params: URLSearchParams): TeamIssuesUrlState => {
  const grouping = params.get('grouping');
  return {
    cycleId: params.get('cycle') ?? ALL_TEAM_CYCLES,
    filter: params.get('filter'),
    display: {
      boardGrouping: parseBoardGrouping(grouping),
      boardLane: parseBoardLane(params.get('lane')),
      collapsedColumns: parseCollapsedColumns(params.get('cols')),
      collapsedGroups: parseCollapsedColumns(params.get('groups')),
      completed: parseCompleted(params.get('completed')),
      grouping: parseListGrouping(grouping),
      nestedSubIssues: params.get('nestedSub') !== '0',
      ordering: parseOrdering(params.get('ordering')),
      projectChip: params.get('projectChip') !== '0',
      showEmptyColumns: params.get('emptyColumns') === '1',
      showSubIssues: params.get('subIssues') !== '0',
    },
    // Linear's team issues surface opens on the status-grouped board.
    layout: params.get('layout') === 'list' ? 'list' : 'board',
    noProject: params.get('noProject') === '1',
  };
};

export interface TeamIssuesUrlPatch {
  boardGrouping?: TeamIssuesBoardGrouping;
  boardLane?: TeamIssuesBoardLane;
  collapsedColumns?: string[];
  collapsedGroups?: string[];
  completed?: TeamIssuesCompletedWindow;
  cycleId?: string;
  filter?: string | null;
  grouping?: TeamIssuesListGrouping;
  layout?: WorkQueryLayout;
  nestedSubIssues?: boolean;
  noProject?: boolean;
  ordering?: TeamIssuesOrdering;
  projectChip?: boolean;
  showEmptyColumns?: boolean;
  showSubIssues?: boolean;
}

const DISPLAY_PARAM_KEYS = [
  'cols',
  'groups',
  'completed',
  'emptyColumns',
  'grouping',
  'lane',
  'layout',
  'nestedSub',
  'ordering',
  'projectChip',
  'subIssues',
] as const;

/**
 * Write the touched display/filter params, leaving every other param (tab,
 * scope, views-editor state) untouched. Non-default values land in the URL;
 * defaults delete the param so the address stays canonical.
 */
export const patchTeamIssuesParams = (
  current: URLSearchParams,
  patch: TeamIssuesUrlPatch,
): URLSearchParams => {
  const next = new URLSearchParams(current);
  if (patch.layout !== undefined) {
    if (patch.layout === 'list') next.set('layout', 'list');
    else next.delete('layout');
  }
  if (patch.cycleId !== undefined) {
    if (patch.cycleId === ALL_TEAM_CYCLES) next.delete('cycle');
    else next.set('cycle', patch.cycleId);
  }
  if (patch.noProject !== undefined) {
    if (patch.noProject) next.set('noProject', '1');
    else next.delete('noProject');
  }
  // One `grouping` param serves both layouts — the read side resolves it
  // against the active layout's option set.
  const grouping = patch.grouping ?? patch.boardGrouping;
  if (grouping !== undefined) {
    if (grouping === DEFAULT_TEAM_ISSUES_DISPLAY.grouping) next.delete('grouping');
    else next.set('grouping', grouping);
  }
  if (patch.ordering !== undefined) {
    if (patch.ordering === DEFAULT_TEAM_ISSUES_DISPLAY.ordering) next.delete('ordering');
    else next.set('ordering', patch.ordering);
  }
  if (patch.completed !== undefined) {
    if (patch.completed === DEFAULT_TEAM_ISSUES_DISPLAY.completed) next.delete('completed');
    else next.set('completed', patch.completed);
  }
  if (patch.showSubIssues !== undefined) {
    if (patch.showSubIssues) next.delete('subIssues');
    else next.set('subIssues', '0');
  }
  if (patch.nestedSubIssues !== undefined) {
    if (patch.nestedSubIssues) next.delete('nestedSub');
    else next.set('nestedSub', '0');
  }
  if (patch.showEmptyColumns !== undefined) {
    if (patch.showEmptyColumns) next.set('emptyColumns', '1');
    else next.delete('emptyColumns');
  }
  if (patch.boardLane !== undefined) {
    if (patch.boardLane === 'none') next.delete('lane');
    else next.set('lane', patch.boardLane);
  }
  if (patch.collapsedColumns !== undefined) {
    if (patch.collapsedColumns.length === 0) next.delete('cols');
    else next.set('cols', patch.collapsedColumns.join(','));
  }
  if (patch.collapsedGroups !== undefined) {
    if (patch.collapsedGroups.length === 0) next.delete('groups');
    else next.set('groups', patch.collapsedGroups.join(','));
  }
  if (patch.filter !== undefined) {
    if (!patch.filter) next.delete('filter');
    else next.set('filter', patch.filter);
  }
  if (patch.projectChip !== undefined) {
    if (patch.projectChip) next.delete('projectChip');
    else next.set('projectChip', '0');
  }
  return next;
};

/** Linear's display-options Reset — clears only the display params, never the filters. */
export const resetTeamIssuesDisplayParams = (current: URLSearchParams): URLSearchParams => {
  const next = new URLSearchParams(current);
  for (const key of DISPLAY_PARAM_KEYS) next.delete(key);
  return next;
};
