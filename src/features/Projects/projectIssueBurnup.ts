import { type TaskWorkflowCategory, type WorkflowBucket, workflowBucket } from '@orvilo/types';

export type { WorkflowBucket };
export { workflowBucket };

/**
 * Pure data behind the rail Progress card's burnup chart and its
 * Assignees/Labels breakdown — the two readouts Linear's Progress card adds
 * under the Scope/Started/Completed legend.
 *
 * Scope semantics deliberately match `projectIssueProgress`: `canceled`
 * leaves scope entirely and an unrecognised `workflowCategory` makes the
 * whole readout unavailable rather than a number (the classifier is shared —
 * the exported {@link workflowBucket} — so a new category is triaged in one
 * place).
 */

export interface BurnupIssue {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  id: string;
  startedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  workflowCategory: TaskWorkflowCategory;
}

/* --------------------------------- Burnup ---------------------------------- */

export interface BurnupPoint {
  completed: number;
  /** Start of the calendar day this point reads. */
  date: Date;
  scope: number;
  started: number;
}

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const timeOf = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : Number.NaN;

/**
 * The timestamp a task "started" for burnup purposes. `startedAt` is the
 * recorded truth; a task already in a started-or-later bucket without the
 * timestamp falls back to `createdAt` — creation is the earliest moment the
 * state is known to have held, which is the most honest point a chart can
 * place it.
 */
const startedTimeOf = (issue: BurnupIssue): number => {
  const recorded = timeOf(issue.startedAt);
  if (!Number.isNaN(recorded)) return recorded;
  const bucket = workflowBucket(issue.workflowCategory);
  return bucket === 'started' || bucket === 'completed' ? timeOf(issue.createdAt) : Number.NaN;
};

const completedTimeOf = (issue: BurnupIssue): number => {
  const recorded = timeOf(issue.completedAt);
  if (!Number.isNaN(recorded)) return recorded;
  // The completion write always bumps updatedAt, so it is the best surviving
  // estimate when completedAt was never persisted.
  return workflowBucket(issue.workflowCategory) === 'completed'
    ? timeOf(issue.updatedAt) || timeOf(issue.createdAt)
    : Number.NaN;
};

/**
 * Cumulative per-day counts from the earliest created issue through today,
 * inclusive. `started`/`completed` only ever count inside `scope` (an issue
 * cannot leave scope then stay in the cumulative curves), and each series
 * joins a day only once its issue's effective timestamp lands inside it.
 * Unclassifiable states make the series unavailable, mirroring the legend.
 */
export const projectIssueBurnupSeries = (
  issues: readonly BurnupIssue[],
  now: Date = new Date(),
): BurnupPoint[] | null => {
  const createdTimes = issues
    .map((issue) => timeOf(issue.createdAt))
    .filter((t) => !Number.isNaN(t));
  if (createdTimes.length === 0) return [];

  const issueCreatedTimes = issues.map((issue) => timeOf(issue.createdAt));
  const startedTimes = issues.map(startedTimeOf);
  const completedTimes = issues.map(completedTimeOf);
  const buckets = issues.map((issue) => workflowBucket(issue.workflowCategory));
  if (buckets.includes(null)) return null;

  const first = dayStart(new Date(Math.min(...createdTimes)));
  const today = dayStart(now);
  const points: BurnupPoint[] = [];

  for (let day = first; day.getTime() <= today.getTime(); day = addDays(day, 1)) {
    const dayEnd = addDays(day, 1).getTime();
    let scope = 0;
    let started = 0;
    let completed = 0;
    for (const [i, createdAt] of issueCreatedTimes.entries()) {
      if (buckets[i] === 'excluded' || Number.isNaN(createdAt) || createdAt >= dayEnd) continue;
      scope++;
      if (startedTimes[i] < dayEnd) started++;
      if (completedTimes[i] < dayEnd) completed++;
    }
    points.push({ completed, date: day, scope, started });
  }
  return points;
};

/**
 * Indices the axis labels sit on: both ends plus at most one interior
 * midpoint, deduped so a short series never prints the same day twice.
 */
export const burnupTickIndices = (length: number): number[] =>
  length <= 0 ? [] : [...new Set([0, Math.floor((length - 1) / 2), length - 1])];

/* -------------------------------- Breakdown --------------------------------- */

export interface IssueBreakdownGroup {
  completed: number;
  /** Serializes into the issues page's `?filter=<type>:<value>` deep link. */
  filterType: 'agent' | 'assignee' | 'labels';
  /** The filter value; `null` marks the "no assignee / no label" bucket. */
  filterValue: string | null;
  /** Group key — `user:<id>` / `agent:<id>` / `label:<id>` / `none`. */
  key: string;
  percent: number;
  scope: number;
}

const tallyGroup = (
  groups: Map<string, IssueBreakdownGroup>,
  key: string,
  filterType: IssueBreakdownGroup['filterType'],
  filterValue: string | null,
  bucket: WorkflowBucket | null,
) => {
  const group = groups.get(key) ?? {
    completed: 0,
    filterType,
    filterValue,
    key,
    percent: 0,
    scope: 0,
  };
  group.scope++;
  if (bucket === 'completed') group.completed++;
  groups.set(key, group);
};

const sortBreakdown = (groups: IssueBreakdownGroup[]): IssueBreakdownGroup[] =>
  groups
    .map((group) => ({
      ...group,
      percent: group.scope === 0 ? 0 : Math.round((group.completed / group.scope) * 100),
    }))
    .sort((a, b) => {
      // The "none" bucket pins to the top (Linear's "No assignee" row), then
      // descending group size — the order the reference's rows follow.
      if (a.filterValue === null) return -1;
      if (b.filterValue === null) return 1;
      return b.scope - a.scope || a.key.localeCompare(b.key);
    });

const inScopeIssues = (issues: readonly BurnupIssue[]) =>
  issues.filter((issue) => {
    const bucket = workflowBucket(issue.workflowCategory);
    return bucket !== null && bucket !== 'excluded';
  });

const hasUnclassifiable = (issues: readonly BurnupIssue[]) =>
  issues.some((issue) => workflowBucket(issue.workflowCategory) === null);

/**
 * Group in-scope issues by their human or agent assignee. A task whose
 * assignee id resolves to neither yields the `none` bucket; unassignable
 * states (unclassifiable) return null, matching the card's unavailable rule.
 */
export const projectIssueAssigneeBreakdown = (
  issues: readonly BurnupIssue[],
): IssueBreakdownGroup[] | null => {
  if (hasUnclassifiable(issues)) return null;
  const groups = new Map<string, IssueBreakdownGroup>();
  for (const issue of inScopeIssues(issues)) {
    const bucket = workflowBucket(issue.workflowCategory);
    if (issue.assigneeUserId) {
      tallyGroup(groups, `user:${issue.assigneeUserId}`, 'assignee', issue.assigneeUserId, bucket);
    } else if (issue.assigneeAgentId) {
      tallyGroup(groups, `agent:${issue.assigneeAgentId}`, 'agent', issue.assigneeAgentId, bucket);
    } else {
      tallyGroup(groups, 'none', 'assignee', null, bucket);
    }
  }
  return sortBreakdown([...groups.values()]);
};

/**
 * Group in-scope issues by label — an issue with several labels counts into
 * each labelled group (matching Linear's per-label readout), while one with
 * none feeds the `none` bucket. `taskLabels` maps task id → bound labels.
 */
export const projectIssueLabelBreakdown = (
  issues: readonly BurnupIssue[],
  taskLabels: Record<string, readonly { id: string }[]> | undefined,
): IssueBreakdownGroup[] | null => {
  if (hasUnclassifiable(issues)) return null;
  const groups = new Map<string, IssueBreakdownGroup>();
  for (const issue of inScopeIssues(issues)) {
    const bucket = workflowBucket(issue.workflowCategory);
    const labels = taskLabels?.[issue.id] ?? [];
    if (labels.length === 0) {
      tallyGroup(groups, 'none', 'labels', null, bucket);
    }
    for (const label of labels) {
      tallyGroup(groups, `label:${label.id}`, 'labels', label.id, bucket);
    }
  }
  return sortBreakdown([...groups.values()]);
};
