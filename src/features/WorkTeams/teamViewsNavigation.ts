import type { WorkQueryEntityType } from '@orvilo/types';

export interface TeamViewsLocation {
  creating: boolean;
  entityType: WorkQueryEntityType;
}

export const readTeamViewsSearch = (search: string): TeamViewsLocation => {
  const params = new URLSearchParams(search);
  return {
    creating: params.get('new') === '1',
    entityType: params.get('entity') === 'project' ? 'project' : 'task',
  };
};

export const nextTeamViewsSearch = (
  search: string,
  patch: Partial<TeamViewsLocation>,
): URLSearchParams => {
  const params = new URLSearchParams(search);
  params.set('tab', 'views');
  if (patch.entityType) {
    if (patch.entityType === 'project') params.set('entity', 'project');
    else params.delete('entity');
  }
  if (patch.creating !== undefined) {
    if (patch.creating) params.set('new', '1');
    else params.delete('new');
  }
  return params;
};
