import type { WorkQuery, WorkQueryEntityType } from '@orvilo/types';

import type { ViewEditorState } from '@/features/SavedViews/ViewDefinitionEditor';
import { builderToFilter } from '@/features/SavedViews/workQueryBuilder';

export const newTeamViewDraft = (
  entityType: WorkQueryEntityType,
  teamId: string,
): ViewEditorState => ({
  builder: { any: [], rows: [], slots: [] },
  entityType,
  groupBy: entityType === 'task' ? 'status' : 'none',
  layout: 'list',
  name: '',
  teamId,
  visibility: 'team',
});

export const teamViewDraftQuery = (draft: ViewEditorState, teamId: string): WorkQuery => {
  const userFilter = builderToFilter(draft.entityType, draft.builder);
  return {
    entityType: draft.entityType,
    filter: {
      all: [{ field: 'teamId', op: 'eq', value: teamId }, ...(userFilter ? [userFilter] : [])],
    },
    groupBy: draft.groupBy === 'none' ? undefined : draft.groupBy,
    layout: draft.layout,
    schemaVersion: 1,
    sort: draft.sort,
    sortMode: draft.layout === 'board' ? draft.sortMode : undefined,
  };
};
