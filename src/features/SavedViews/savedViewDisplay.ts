import type { WorkQuery, WorkQueryEntityType, WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';

/** Board columns the work query actually draws. Activity date, cycle, and project stay on lists. */
export const SAVED_VIEW_BOARD_GROUP_BY = [
  'none',
  'status',
  'workflowCategory',
  'priority',
  'assignee',
] as const satisfies readonly WorkQueryGroupBy[];

export const SAVED_VIEW_LIST_GROUP_BY = [
  ...SAVED_VIEW_BOARD_GROUP_BY,
  'project',
  'cycle',
  'activityDate',
] as const satisfies readonly WorkQueryGroupBy[];

export type SavedViewGroupByOption = (typeof SAVED_VIEW_LIST_GROUP_BY)[number];

export const savedViewGroupByOptions = (
  entityType: WorkQueryEntityType,
  layout: WorkQueryLayout,
): readonly SavedViewGroupByOption[] => {
  if (entityType === 'project') return layout === 'board' ? ['status'] : ['none', 'status'];
  return layout === 'board' ? SAVED_VIEW_BOARD_GROUP_BY : SAVED_VIEW_LIST_GROUP_BY;
};

/** Keep a stored axis when this layout can draw it. A list-only axis on a board becomes workflow. */
export const savedViewGroupByForLayout = (
  entityType: WorkQueryEntityType,
  layout: WorkQueryLayout,
  groupBy: WorkQueryGroupBy,
): WorkQueryGroupBy => {
  const options = savedViewGroupByOptions(entityType, layout);
  if ((options as readonly string[]).includes(groupBy)) return groupBy;
  if (entityType === 'project' || layout !== 'board') return 'status';
  return 'workflowCategory';
};

/**
 * A project board, and a project list grouped by status, pages each status.
 * A flat cursor on that query is rejected.
 */
export const savedViewProjectsPageByGroup = (
  layout: WorkQueryLayout | undefined,
  groupBy: WorkQueryGroupBy | undefined,
): boolean => layout === 'board' || groupBy === 'status';

/** Activity-date buckets follow the viewer. The saved query does not store the zone. */
export const workQueryWithViewerTimeZone = <T extends Pick<WorkQuery, 'groupBy' | 'timeZone'>>(
  query: T,
  timeZone: string | undefined,
): T & { timeZone?: string } =>
  query.groupBy === 'activityDate' && timeZone ? { ...query, timeZone } : query;
