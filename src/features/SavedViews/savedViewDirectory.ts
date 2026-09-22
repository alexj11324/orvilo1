import type { WorkQueryEntityType } from '@orvilo/types';

export const viewEntityFromSearch = (search: string): WorkQueryEntityType =>
  new URLSearchParams(search).get('entity') === 'project' ? 'project' : 'task';

export const filterSavedViewsByEntity = <T extends { entityType: WorkQueryEntityType }>(
  views: readonly T[],
  entityType: WorkQueryEntityType,
  keyword: string,
  title: (view: T) => string,
): T[] => {
  const needle = keyword.trim().toLocaleLowerCase();
  return views.filter(
    (view) =>
      view.entityType === entityType &&
      (!needle || title(view).toLocaleLowerCase().includes(needle)),
  );
};
