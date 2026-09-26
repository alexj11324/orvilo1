import type { ProjectHealth } from '@orvilo/types';
import { PROJECT_STATUSES } from '@orvilo/types';

/**
 * Display options for the `/projects` list — the Linear "Display options"
 * panel measured on the reference (ref-projects-display-options.png,
 * NEW-FINDINGS §3): Layout List/Board/Timeline, Grouping, Ordering,
 * Show closed projects, and the 17 Display-property toggles.
 *
 * Persistence lives in `SystemStatus.projectListViewOptions` (localStorage via
 * `updateSystemStatus`) — the minimal chain for a built-in page: there is no
 * `saved_views` row for `/projects`, so `display_options` does not apply. This
 * mirrors Linear's personal display-option persistence; the workspace-wide
 * "Set default for everyone" has no settings write path yet and stays
 * disabled in the panel.
 */

export const PROJECT_LIST_LAYOUTS = ['list', 'board', 'timeline'] as const;
export type ProjectListLayout = (typeof PROJECT_LIST_LAYOUTS)[number];

/** Reference grouping enum for the projects list (NEW-FINDINGS §3). */
export const PROJECT_LIST_GROUPINGS = ['none', 'status', 'lead'] as const;
export type ProjectListGrouping = (typeof PROJECT_LIST_GROUPINGS)[number];

/**
 * Every value `orderBy` can hold. `manual` keeps the server's natural order
 * (the list arrives `updatedAt desc`) — real drag ordering needs a persisted
 * order field the schema does not have.
 *
 * The Display options dropdown itself lists only the reference's documented
 * set (linear.app/docs/display-options: Manual/Status/Priority/Updated
 * time/Created time) — see `PROJECT_LIST_MENU_ORDERINGS`. `name`, `health`
 * and `targetDate` are *not* in that dropdown on the reference: they are
 * reachable through the sortable column headers instead (Name/Health/Target
 * date). They stay valid `orderBy` values so a header sort persists and the
 * select can still label the active ordering.
 */
export const PROJECT_LIST_ORDERINGS = [
  'manual',
  'name',
  'status',
  'priority',
  'health',
  'targetDate',
  'createdAt',
  'updatedAt',
] as const;
export type ProjectListOrdering = (typeof PROJECT_LIST_ORDERINGS)[number];

/** Orderings the Display options dropdown lists — the reference's documented five. */
export const PROJECT_LIST_MENU_ORDERINGS = [
  'manual',
  'status',
  'priority',
  'updatedAt',
  'createdAt',
] as const satisfies readonly ProjectListOrdering[];

/**
 * Orderings reachable only through a sortable column header — the reference
 * sorts by them without listing them in the Ordering dropdown.
 */
export const PROJECT_LIST_HEADER_ONLY_ORDERINGS = [
  'name',
  'health',
  'targetDate',
] as const satisfies readonly ProjectListOrdering[];

/** Orderings a column-header button can activate (reference: Name/Health/Priority/Target date/Status). */
export type ProjectListSortableOrdering = Exclude<ProjectListOrdering, 'manual'>;

export const PROJECT_LIST_CLOSED_WINDOWS = [
  'all',
  'pastWeek',
  'pastMonth',
  'pastYear',
  'none',
] as const;
export type ProjectListClosedWindow = (typeof PROJECT_LIST_CLOSED_WINDOWS)[number];

/** The reference's 17 display-property toggles, in panel order. */
export const PROJECT_LIST_PROPERTIES = [
  'id',
  'milestones',
  'summary',
  'priority',
  'status',
  'health',
  'teams',
  'lead',
  'members',
  'dependencies',
  'startDate',
  'targetDate',
  'issues',
  'created',
  'updated',
  'completed',
  'labels',
] as const;
export type ProjectListProperty = (typeof PROJECT_LIST_PROPERTIES)[number];

/**
 * Properties the `project.list` row payload actually carries
 * (projects columns + taskCount + progressPercent). `milestones` renders
 * from the cached project detail — it only paints once a project's detail
 * has loaded this session. The rest (teams/members/dependencies/labels)
 * have no list-payload data and render as honest-disabled chips.
 */
export const DATA_BACKED_PROJECT_LIST_PROPERTIES = [
  'id',
  'milestones',
  'summary',
  'priority',
  'status',
  'health',
  'lead',
  'startDate',
  'targetDate',
  'issues',
  'created',
  'updated',
  'completed',
] as const satisfies readonly ProjectListProperty[];

const DATA_BACKED_SET: ReadonlySet<string> = new Set(DATA_BACKED_PROJECT_LIST_PROPERTIES);
export const isDataBackedProjectListProperty = (property: ProjectListProperty) =>
  DATA_BACKED_SET.has(property);

/**
 * The reference's Timeline-state property subset (NEW-FINDINGS §3): ID,
 * Milestones, Priority, Status, Health, Lead, Members, Dependencies,
 * Predictions. `predictions` has no backend data at all (no forecast fields
 * on the project model), so it is omitted rather than faked — noted in the
 * task report. The rest keep the same data-backed/disabled split as list mode.
 */
export const TIMELINE_PROJECT_LIST_PROPERTIES = [
  'id',
  'milestones',
  'priority',
  'status',
  'health',
  'lead',
  'members',
  'dependencies',
] as const satisfies readonly ProjectListProperty[];

export interface ProjectListDisplayOptions {
  grouping: ProjectListGrouping;
  layout: ProjectListLayout;
  orderBy: ProjectListOrdering;
  orderDirection: 'asc' | 'desc';
  /** Per-property visibility; unsupported properties normalize to false. */
  properties: Record<ProjectListProperty, boolean>;
  showClosed: ProjectListClosedWindow;
  /** Timeline-layout toggles (reference: Show project list on / Show week numbers off). */
  timeline: { showProjectList: boolean; showWeekNumbers: boolean };
}

/**
 * Defaults reproduce the pre-panel column set (Health/Priority/Lead/Target
 * date/Issues/Status) plus `milestones`, which the reference shows on.
 */
export const DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS: ProjectListDisplayOptions = {
  grouping: 'none',
  layout: 'list',
  orderBy: 'name',
  orderDirection: 'asc',
  properties: {
    completed: false,
    created: false,
    dependencies: false,
    health: true,
    id: false,
    issues: true,
    labels: false,
    lead: true,
    members: false,
    milestones: true,
    priority: true,
    startDate: false,
    status: true,
    summary: false,
    targetDate: true,
    teams: false,
    updated: false,
  },
  showClosed: 'all',
  timeline: { showProjectList: true, showWeekNumbers: false },
};

const toSet = (values: readonly string[]) => new Set<string>(values);
const GROUPING_SET = toSet(PROJECT_LIST_GROUPINGS);
const LAYOUT_SET = toSet(PROJECT_LIST_LAYOUTS);
const ORDERING_SET = toSet(PROJECT_LIST_ORDERINGS);
const CLOSED_WINDOW_SET = toSet(PROJECT_LIST_CLOSED_WINDOWS);

/**
 * Persisted status is untrusted (localStorage is hand-editable and older
 * builds wrote a different shape). Coerce every field; unknown or absent
 * values fall back to the defaults — including the timeline toggles, which
 * older persisted snapshots predate.
 */
export const normalizeProjectListDisplayOptions = (
  raw?: {
    grouping?: string;
    layout?: string;
    orderBy?: string;
    orderDirection?: string;
    properties?: Record<string, boolean>;
    showClosed?: string;
    timeline?: { showProjectList?: boolean; showWeekNumbers?: boolean };
  } | null,
): ProjectListDisplayOptions => {
  const defaults = DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS;
  if (!raw) return defaults;
  const properties = { ...defaults.properties };
  for (const key of PROJECT_LIST_PROPERTIES) {
    const value = raw.properties?.[key];
    properties[key] = DATA_BACKED_SET.has(key)
      ? typeof value === 'boolean'
        ? value
        : defaults.properties[key]
      : false;
  }
  return {
    grouping:
      raw.grouping && GROUPING_SET.has(raw.grouping)
        ? (raw.grouping as ProjectListGrouping)
        : defaults.grouping,
    layout:
      raw.layout && LAYOUT_SET.has(raw.layout)
        ? (raw.layout as ProjectListLayout)
        : defaults.layout,
    orderBy:
      raw.orderBy && ORDERING_SET.has(raw.orderBy)
        ? (raw.orderBy as ProjectListOrdering)
        : defaults.orderBy,
    orderDirection: raw.orderDirection === 'desc' ? 'desc' : defaults.orderDirection,
    properties,
    showClosed:
      raw.showClosed && CLOSED_WINDOW_SET.has(raw.showClosed)
        ? (raw.showClosed as ProjectListClosedWindow)
        : defaults.showClosed,
    timeline: {
      showProjectList:
        typeof raw.timeline?.showProjectList === 'boolean'
          ? raw.timeline.showProjectList
          : defaults.timeline.showProjectList,
      showWeekNumbers:
        typeof raw.timeline?.showWeekNumbers === 'boolean'
          ? raw.timeline.showWeekNumbers
          : defaults.timeline.showWeekNumbers,
    },
  };
};

/* ------------------------------ Closed window ----------------------------- */

/** Terminal states the "Show closed projects" control folds away. */
export const CLOSED_PROJECT_STATUSES = ['archived', 'canceled', 'completed'] as const;

const CLOSED_STATUS_SET = toSet(CLOSED_PROJECT_STATUSES);

const CLOSED_WINDOW_DAYS: Partial<Record<ProjectListClosedWindow, number>> = {
  pastMonth: 30,
  pastWeek: 7,
  pastYear: 365,
};

interface ClosedWindowRow {
  archivedAt?: Date | null | string;
  completedAt?: Date | null | string;
  status?: null | string;
  updatedAt?: Date | null | string;
}

const timeOf = (value: Date | null | string | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

/**
 * Linear shows completed projects "in the last week, month, or year" beside
 * the All/None choices. `archived` counts as closed here: the reference
 * hides archived projects from this list entirely, and folding them under
 * the closed window is the closest honest mapping.
 */
export const filterClosedProjects = <T extends ClosedWindowRow>(
  projects: T[],
  showClosed: ProjectListClosedWindow,
  now: Date = new Date(),
): T[] => {
  if (showClosed === 'all') return projects;
  const windowDays = CLOSED_WINDOW_DAYS[showClosed];
  return projects.filter((project) => {
    if (!project.status || !CLOSED_STATUS_SET.has(project.status)) return true;
    if (windowDays === undefined) return false;
    const closedAt = timeOf(project.completedAt ?? project.archivedAt ?? project.updatedAt);
    if (closedAt === null) return false;
    return now.getTime() - closedAt <= windowDays * 86_400_000;
  });
};

/* -------------------------------- Ordering -------------------------------- */

const STATUS_RANK = new Map<string, number>(
  PROJECT_STATUSES.map((status, index) => [status, index]),
);

const statusRank = (status: null | string | undefined): number =>
  (status ? STATUS_RANK.get(status) : undefined) ?? STATUS_RANK.size;

/** Linear sorts priority urgent-first; `0`/unset ("no priority") lands last. */
const priorityRank = (priority: null | number | undefined): number =>
  priority == null || priority <= 0 || priority > 4 ? 5 : priority;

const HEALTH_RANK: Record<ProjectHealth | 'none', number> = {
  atRisk: 1,
  none: 3,
  offTrack: 0,
  onTrack: 2,
};

const healthRank = (health: null | string | undefined): number =>
  health && health in HEALTH_RANK
    ? HEALTH_RANK[health as ProjectHealth | 'none']
    : HEALTH_RANK.none;

export interface ProjectListSortableRow {
  createdAt?: Date | null | string;
  health?: null | string;
  name: string;
  priority?: null | number;
  status?: null | string;
  targetDate?: null | string;
  updatedAt?: Date | null | string;
}

const compareRows = (
  a: ProjectListSortableRow,
  b: ProjectListSortableRow,
  ordering: ProjectListSortableOrdering,
): number => {
  switch (ordering) {
    case 'name': {
      return a.name.localeCompare(b.name);
    }
    case 'status': {
      return statusRank(a.status) - statusRank(b.status);
    }
    case 'priority': {
      return priorityRank(a.priority) - priorityRank(b.priority);
    }
    case 'health': {
      return healthRank(a.health) - healthRank(b.health);
    }
    case 'createdAt':
    case 'targetDate':
    case 'updatedAt': {
      const aTime = timeOf(a[ordering]);
      const bTime = timeOf(b[ordering]);
      // Absent dates sink to the end instead of clumping at the top.
      if (aTime === null) return bTime === null ? 0 : 1;
      if (bTime === null) return -1;
      return aTime - bTime;
    }
    default: {
      return 0;
    }
  }
};

/** Natural direction when a header first activates a field: names A→Z, dates newest-first. */
export const defaultDirectionForOrdering = (ordering: ProjectListOrdering): 'asc' | 'desc' =>
  ordering === 'createdAt' || ordering === 'updatedAt' ? 'desc' : 'asc';

/**
 * Sort the already-filtered rows. `manual` keeps the incoming order (the
 * server returns `updatedAt desc`), so the comparator never runs. Ties fall
 * back to the project name so equal fields still render a stable order.
 */
export const sortProjectList = <T extends ProjectListSortableRow>(
  projects: T[],
  orderBy: ProjectListOrdering,
  orderDirection: 'asc' | 'desc',
): T[] => {
  if (orderBy === 'manual' || projects.length < 2) return [...projects];
  const direction = orderDirection === 'desc' ? -1 : 1;
  return [...projects].sort((a, b) => {
    const diff = compareRows(a, b, orderBy);
    if (diff !== 0) return diff * direction;
    return a.name.localeCompare(b.name);
  });
};

/**
 * Column-header sort: first click activates the field at its natural
 * direction, a second click on the active header flips it. Mirrors the
 * reference's sortable Name/Health/Priority/Target date/Status headers.
 */
export const nextSortFromHeader = (
  current: Pick<ProjectListDisplayOptions, 'orderBy' | 'orderDirection'>,
  field: ProjectListSortableOrdering,
): Pick<ProjectListDisplayOptions, 'orderBy' | 'orderDirection'> => {
  if (current.orderBy === field) {
    return { orderBy: field, orderDirection: current.orderDirection === 'asc' ? 'desc' : 'asc' };
  }
  return { orderBy: field, orderDirection: defaultDirectionForOrdering(field) };
};

/* -------------------------------- Grouping -------------------------------- */

export interface ProjectListGroup<T> {
  items: T[];
  /** `status:<status>` or `lead:<userId>`/`lead:none`. */
  key: string;
}

interface GroupableRow {
  leadUserId?: null | string;
  status?: null | string;
}

/**
 * Group an already-sorted list; ordering applies inside each group (Linear
 * keeps the sort within groups). Status groups follow workflow order; lead
 * groups sort by the resolved display name with "No lead" last.
 */
export const groupProjectList = <T extends GroupableRow>(
  projects: T[],
  grouping: ProjectListGrouping,
  leadName?: (userId: string) => string | undefined,
): ProjectListGroup<T>[] => {
  if (grouping === 'none') return [{ items: projects, key: 'all' }];

  if (grouping === 'status') {
    const buckets = new Map<string, T[]>();
    for (const project of projects) {
      const key = project.status ?? 'backlog';
      const bucket = buckets.get(key);
      if (bucket) bucket.push(project);
      else buckets.set(key, [project]);
    }
    const ordered = [...buckets.keys()].sort((a, b) => statusRank(a) - statusRank(b));
    return ordered.map((status) => ({ items: buckets.get(status)!, key: `status:${status}` }));
  }

  // grouping === 'lead'
  const buckets = new Map<string, T[]>();
  for (const project of projects) {
    const key = project.leadUserId ?? '';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(project);
    else buckets.set(key, [project]);
  }
  const ordered = [...buckets.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    const nameA = leadName?.(a) ?? a;
    const nameB = leadName?.(b) ?? b;
    return nameA.localeCompare(nameB);
  });
  return ordered.map((userId) => ({
    items: buckets.get(userId)!,
    key: `lead:${userId || 'none'}`,
  }));
};

/* ------------------------------ Milestone chip ---------------------------- */

export interface ProjectMilestoneLike {
  date?: null | string;
  name: string;
  sortOrder?: number;
}

/**
 * The Name-column chip shows the next upcoming dated milestone — earliest
 * date on/after today. With no upcoming date it falls back to the most
 * recent dated milestone, then to the first by sort order, so a project
 * whose milestones are all undated still surfaces one.
 */
export const pickNextMilestone = <T extends ProjectMilestoneLike>(
  milestones: readonly T[] | null | undefined,
  now: Date = new Date(),
): T | undefined => {
  if (!milestones?.length) return undefined;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dated = milestones
    .filter((milestone) => timeOf(milestone.date) !== null)
    .sort((a, b) => timeOf(a.date)! - timeOf(b.date)!);
  const upcoming = dated.find((milestone) => timeOf(milestone.date)! >= todayStart);
  if (upcoming) return upcoming;
  if (dated.length > 0) return dated.at(-1);
  return [...milestones].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
};

/* --------------------------------- Columns -------------------------------- */

/**
 * Columns that a display property can add/remove. `id` and `milestones` are
 * not columns — they render inline inside the Name cell (identifier chip,
 * milestone chip) as on the reference.
 *
 * `sortBy` marks the sortable headers the reference exposes
 * (Name/Health/Priority/Target date/Status — Lead is deliberately not
 * sortable there, so it has none here either).
 */
export interface ProjectListColumn {
  key:
    | 'completed'
    | 'created'
    | 'health'
    | 'issues'
    | 'lead'
    | 'priority'
    | 'startDate'
    | 'status'
    | 'summary'
    | 'targetDate'
    | 'updated';
  minWidth: number;
  property: ProjectListProperty;
  /** Set when the column header acts as a sort button (reference: Name/Health/Priority/Target date/Status). */
  sortBy?: ProjectListSortableOrdering;
  width: string;
}

export const PROJECT_LIST_COLUMNS: readonly ProjectListColumn[] = [
  { key: 'health', minWidth: 96, property: 'health', sortBy: 'health', width: '96px' },
  { key: 'priority', minWidth: 64, property: 'priority', sortBy: 'priority', width: '64px' },
  { key: 'lead', minWidth: 84, property: 'lead', width: '84px' },
  { key: 'summary', minWidth: 140, property: 'summary', width: 'minmax(140px, 1fr)' },
  { key: 'startDate', minWidth: 96, property: 'startDate', width: '96px' },
  { key: 'targetDate', minWidth: 96, property: 'targetDate', sortBy: 'targetDate', width: '96px' },
  { key: 'issues', minWidth: 56, property: 'issues', width: '56px' },
  { key: 'created', minWidth: 84, property: 'created', width: '84px' },
  { key: 'updated', minWidth: 84, property: 'updated', width: '84px' },
  { key: 'completed', minWidth: 84, property: 'completed', width: '84px' },
  { key: 'status', minWidth: 96, property: 'status', sortBy: 'status', width: '96px' },
];

export type ProjectListColumnKey = ProjectListColumn['key'];

export const visibleProjectListColumns = (
  properties: Record<ProjectListProperty, boolean>,
): ProjectListColumn[] => PROJECT_LIST_COLUMNS.filter((column) => properties[column.property]);

/** Shared grid geometry for header + rows so every row lines up on the same tracks. */
export const projectListGridTemplate = (columns: readonly ProjectListColumn[]) => {
  const fixed = columns.reduce((sum, column) => sum + column.minWidth, 0);
  const gaps = (columns.length + 1) * 12;
  return {
    gridTemplateColumns: `minmax(180px, 1.4fr) ${columns.map((column) => column.width).join(' ')} 24px`,
    minWidth: 180 + fixed + 24 + gaps,
  };
};
