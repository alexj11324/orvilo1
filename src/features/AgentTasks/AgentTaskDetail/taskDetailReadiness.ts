/**
 * Whether the Issue detail page must still show its skeleton. Only the task
 * itself gates the page: the assignee Agent's config is not needed to render
 * any part of an Issue (the assignee row falls back to the sidebar's agent
 * meta, and acceptance-criteria generation is guarded on a resolved model), so
 * waiting on it only delayed the first paint.
 */
export const isTaskDetailResolving = ({
  hasTaskDetail,
  settledWithoutDetail,
}: {
  hasTaskDetail: boolean;
  settledWithoutDetail: boolean;
}): boolean => !hasTaskDetail && !settledWithoutDetail;
