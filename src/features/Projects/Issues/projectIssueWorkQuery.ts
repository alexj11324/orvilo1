import type { WorkQuery, WorkQueryFilter, WorkQueryGroupBy } from '@orvilo/types';

import type { TaskGroupBy } from '@/features/AgentTasks/AgentTaskList/listViewOptions';

import { type ProjectIssueFilter, projectIssuesViewFilterSeed } from './issueFilters';

export const PROJECT_ISSUE_PAGE_SIZE = 50;

export const projectIssueMilestonePredicate = (milestoneId: string | undefined) =>
  milestoneId
    ? ({ field: 'projectMilestoneId' as const, op: 'eq' as const, value: milestoneId })
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
 * Board columns the project view can express. Milestone stays a filter —
 * there is no milestone axis, so those boards use status columns.
 */
export const projectIssueBoardGroupBy = (
  groupBy: TaskGroupBy,
): Extract<WorkQueryGroupBy, 'assignee' | 'priority' | 'status'> => {
  if (groupBy === 'priority') return 'priority';
  if (groupBy === 'assignee' || groupBy === 'member') return 'assignee';
  return 'status';
};

export const projectIssueWorkQuery = (input: {
  filters: readonly ProjectIssueFilter[];
  groupBy?: WorkQueryGroupBy;
  layout: 'board' | 'list';
  milestoneId?: string;
  projectId: string;
}): WorkQuery => ({
  entityType: 'task',
  filter: projectIssueQueryFilter(input.projectId, input.filters, input.milestoneId),
  groupBy: input.layout === 'board' ? (input.groupBy ?? 'status') : 'none',
  layout: input.layout,
  schemaVersion: 1,
});
