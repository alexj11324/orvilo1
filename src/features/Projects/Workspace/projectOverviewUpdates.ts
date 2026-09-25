import type { ProjectUpdate } from '@orvilo/types';

export const getProjectOverviewUpdateState = (updates: ProjectUpdate[] | undefined) => {
  const publishedUpdates = updates?.filter((update) => update.kind !== 'comment') ?? [];

  return {
    emptyState: updates === undefined ? undefined : publishedUpdates.length === 0,
    publishedUpdates,
  };
};
