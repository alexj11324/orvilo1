import {
  normalizeWorkQuerySubGroupBy,
  type WorkQuery,
  type WorkQueryFilter,
  type WorkQueryGroupBy,
  type WorkQuerySort,
  type WorkQuerySubGroupBy,
} from '@orvilo/types';

import type {
  TaskGroupBy,
  TaskOrderBy,
  TaskOrderDirection,
} from '@/features/AgentTasks/AgentTaskList/listViewOptions';

import { type ProjectIssueFilter, projectIssuesViewFilterSeed } from './issueFilters';

export const PROJECT_ISSUE_PAGE_SIZE = 50;

export const projectIssueMilestonePredicate = (milestoneId: string | undefined) =>
  milestoneId
    ? { field: 'projectMilestoneId' as const, op: 'eq' as const, value: milestoneId }
    : undefined;

export const projectIssueQueryFilter = (
  projectId: string,
  filters: readonly ProjectIssueFilter[],
  milestoneId?: string,
): WorkQueryFilter => {
  const seed = projectIssuesViewFilterSeed(projectId, filters);
  const milestone = projectIssueMilestonePredicate(milestoneId);
  if (!milestone) return seed;
  return { all: [...(seed.all ?? []), milestone] };
};

/**
 * Board columns the project view can express. Milestone has no board column,
 * so those boards use status. Agent grouping is the agent assignee, not the
 * member.
 */
export const projectIssueBoardGroupBy = (
  groupBy: TaskGroupBy,
): Extract<WorkQueryGroupBy, 'agent' | 'assignee' | 'priority' | 'status'> => {
  if (groupBy === 'priority') return 'priority';
  if (groupBy === 'member') return 'assignee';
  if (groupBy === 'assignee') return 'agent';
  return 'status';
};

/**
 * List axes the work query can page. Status, priority, member, the agent
 * assignee, and milestone each have a server axis, so a filtered list pages
 * the whole set instead of the loaded page.
 */
export const projectIssueListAxes = (
  groupBy: TaskGroupBy,
  subGroupBy: TaskGroupBy,
): { groupBy: WorkQueryGroupBy; subGroupBy?: WorkQuerySubGroupBy } | undefined => {
  const primary = projectIssueServerListAxis(groupBy);
  if (!primary) return undefined;
  if (primary === 'none' || subGroupBy === 'none') return { groupBy: primary };
  const lane = projectIssueServerListLane(subGroupBy);
  if (!lane) return undefined;
  const normalized = normalizeWorkQuerySubGroupBy(primary, lane);
  return normalized ? { groupBy: primary, subGroupBy: normalized } : { groupBy: primary };
};

const projectIssueServerListAxis = (groupBy: TaskGroupBy): WorkQueryGroupBy | undefined => {
  if (groupBy === 'none') return 'none';
  if (groupBy === 'status') return 'status';
  if (groupBy === 'priority') return 'priority';
  if (groupBy === 'member') return 'assignee';
  if (groupBy === 'assignee') return 'agent';
  if (groupBy === 'milestone') return 'milestone';
  return undefined;
};

const projectIssueServerListLane = (groupBy: TaskGroupBy): WorkQuerySubGroupBy | undefined => {
  if (groupBy === 'status' || groupBy === 'priority') return groupBy;
  if (groupBy === 'member') return 'assignee';
  if (groupBy === 'assignee') return 'agent';
  if (groupBy === 'milestone') return 'milestone';
  return undefined;
};

/**
 * The list's date order token is inverted: `asc` renders newest first. Other
 * mapped fields follow the stored direction. Manual order and the agent
 * assignee have no work-query sort.
 */
export const projectIssueListSort = (
  orderBy: TaskOrderBy,
  orderDirection: TaskOrderDirection,
): WorkQuerySort[] | undefined => {
  const field =
    orderBy === 'title'
      ? 'name'
      : orderBy === 'createdAt' ||
          orderBy === 'updatedAt' ||
          orderBy === 'priority' ||
          orderBy === 'status'
        ? orderBy
        : undefined;
  if (!field) return undefined;
  const direction =
    field === 'createdAt' || field === 'updatedAt'
      ? orderDirection === 'asc'
        ? 'desc'
        : 'asc'
      : orderDirection;
  return [
    { direction, field },
    { direction: 'asc', field: 'id' },
  ];
};

export const projectIssueWorkQuery = (input: {
  filters: readonly ProjectIssueFilter[];
  groupBy?: WorkQueryGroupBy;
  hideCompleted?: boolean;
  layout: 'board' | 'list';
  milestoneId?: string;
  projectId: string;
  showSubTasks?: boolean;
  sort?: WorkQuerySort[];
  subGroupBy?: WorkQuerySubGroupBy;
}): WorkQuery => {
  const filter = projectIssueQueryFilter(input.projectId, input.filters, input.milestoneId);
  const hidden = input.hideCompleted
    ? {
        field: 'workflowCategory' as const,
        op: 'notIn' as const,
        value: ['done', 'canceled'],
      }
    : undefined;
  const roots =
    input.showSubTasks === false
      ? { field: 'parentTaskId' as const, op: 'isNull' as const }
      : undefined;
  const visibility = [hidden, roots].filter((predicate) => predicate !== undefined);
  return {
    entityType: 'task',
    filter: visibility.length > 0 ? { all: [...(filter.all ?? []), ...visibility] } : filter,
    groupBy: input.layout === 'board' ? (input.groupBy ?? 'status') : (input.groupBy ?? 'none'),
    layout: input.layout,
    schemaVersion: 2,
    ...(input.sort ? { sort: input.sort } : {}),
    ...(input.subGroupBy ? { subGroupBy: input.subGroupBy } : {}),
  };
};
