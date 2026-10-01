import type { WorkQueryEntityType, WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';

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
  if (entityType === 'project') return ['none', 'status'];
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
  if (layout === 'board') return 'workflowCategory';
  return 'status';
};
