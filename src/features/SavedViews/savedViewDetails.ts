import type {
  SavedViewVisibility,
  WorkQueryEntityType,
  WorkQueryGroupBy,
  WorkQueryLayout,
} from '@orvilo/types';

export interface SavedViewDetailGroup {
  key: string;
  total: number;
}

export interface SavedViewDetailSummary {
  entityType: WorkQueryEntityType;
  groupBy: WorkQueryGroupBy;
  groups: SavedViewDetailGroup[];
  layout: WorkQueryLayout;
  total: number;
  visibility: SavedViewVisibility;
}

export const buildSavedViewDetailSummary = ({
  entityType,
  groupBy,
  groups,
  layout,
  total,
  visibility,
}: {
  entityType: WorkQueryEntityType;
  groupBy?: WorkQueryGroupBy;
  groups?: readonly SavedViewDetailGroup[];
  layout?: WorkQueryLayout;
  total?: number;
  visibility: SavedViewVisibility;
}): SavedViewDetailSummary => ({
  entityType,
  groupBy: groupBy ?? 'none',
  groups: (groups ?? []).map(({ key, total: groupTotal }) => ({ key, total: groupTotal })),
  layout: layout ?? 'list',
  total: total ?? 0,
  visibility,
});
