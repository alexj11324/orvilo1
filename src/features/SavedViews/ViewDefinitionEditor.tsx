'use client';

import type {
  SavedViewVisibility,
  WorkQueryEntityType,
  WorkQueryGroupBy,
  WorkQueryLayout,
  WorkQuerySort,
  WorkQuerySortMode,
  WorkQuerySubGroupBy,
} from '@orvilo/types';
import { normalizeWorkQuerySubGroupBy } from '@orvilo/types';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Select from '@/components/Select';
import { Input } from '@/components/ui/input';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';

import type { BuilderState } from './workQueryBuilder';
import WorkQueryFilterBuilder from './WorkQueryFilterBuilder';

/**
 * Editable definition of a saved view — everything except results. Shared by
 * the detail-page edit panel and the New-view dialog so both surfaces enforce
 * the same field registry, layout and share rules.
 */
export interface ViewEditorState {
  builder: BuilderState;
  entityType: WorkQueryEntityType;
  groupBy: WorkQueryGroupBy;
  layout: WorkQueryLayout;
  name: string;
  sort?: WorkQuerySort[];
  /** Board ordering: `manual` = drag position, `field` = `sort`. Board-only. */
  sortMode?: WorkQuerySortMode;
  /** Board swimlane. Absent means a single row of columns. */
  subGroupBy?: WorkQuerySubGroupBy;
  teamId: string | null;
  visibility: SavedViewVisibility;
}

const SORT_PRESETS: Record<string, WorkQuerySort[] | undefined> = {
  createdAsc: [{ direction: 'asc', field: 'createdAt' }],
  createdDesc: [{ direction: 'desc', field: 'createdAt' }],
  nameAsc: [{ direction: 'asc', field: 'name' }],
  nameDesc: [{ direction: 'desc', field: 'name' }],
  updatedAsc: [{ direction: 'asc', field: 'updatedAt' }],
  updatedDesc: [{ direction: 'desc', field: 'updatedAt' }],
};

const sortKey = (sort: WorkQuerySort[] | undefined): string => {
  const first = sort?.find((item) => item.field !== 'id');
  if (!first) return 'default';
  return `${first.field === 'updatedAt' ? 'updated' : first.field === 'createdAt' ? 'created' : first.field}${first.direction === 'desc' ? 'Desc' : 'Asc'}`;
};

// 'attention' is the My-issues default grouping, not a view-editor choice.
type EditableGroupBy = Exclude<WorkQueryGroupBy, 'attention'>;

const GROUP_BY_OPTIONS: Record<WorkQueryEntityType, EditableGroupBy[]> = {
  project: ['none', 'status'],
  task: ['none', 'status', 'workflowCategory', 'priority', 'assignee'],
};

const TASK_LANES: WorkQuerySubGroupBy[] = ['none', 'status', 'priority', 'assignee', 'project'];

interface ViewDefinitionEditorProps {
  onChange: (next: ViewEditorState) => void;
  showDisplay?: boolean;
  /** Entity picker renders only in the create dialog. */
  showEntityPicker?: boolean;
  showFilters?: boolean;
  showName?: boolean;
  showShare?: boolean;
  value: ViewEditorState;
}

const ViewDefinitionEditor = memo<ViewDefinitionEditorProps>(
  ({
    onChange,
    showDisplay = true,
    showEntityPicker,
    showFilters = true,
    showName,
    showShare,
    value,
  }) => {
    const { t } = useTranslation('common');
    const workspaceId = useActiveWorkspaceId();
    const { data: teamsData } = useClientDataSWR(
      workspaceId && showShare ? workAttentionKeys.teams(workspaceId) : null,
      () => lambdaClient.team.teams.query(),
    );

    const teamOptions = useMemo(
      () => (teamsData?.data ?? []).map((team) => ({ label: team.name, value: team.id })),
      [teamsData?.data],
    );

    const set = (patch: Partial<ViewEditorState>) => onChange({ ...value, ...patch });

    return (
      <div className="flex flex-col gap-3">
        {showEntityPicker ? (
          <div className="flex items-center gap-2">
            <div className="text-[13px] text-muted-foreground" style={{ width: 72 }}>
              {t('savedViews.entityType')}
            </div>
            <Select
              size="small"
              style={{ minWidth: 160 }}
              value={value.entityType}
              options={[
                { label: t('savedViews.entityTask'), value: 'task' },
                { label: t('savedViews.entityProject'), value: 'project' },
              ]}
              onChange={(next) => {
                if (next !== 'task' && next !== 'project') return;
                set({
                  builder: { any: [], rows: [], slots: [] },
                  entityType: next,
                  groupBy: 'none',
                  subGroupBy: undefined,
                });
              }}
            />
          </div>
        ) : null}
        {showName ? (
          <div className="flex items-center gap-2">
            <div className="text-[13px] text-muted-foreground" style={{ width: 72 }}>
              {t('savedViews.name')}
            </div>
            <Input
              className="h-7 text-[13px]"
              placeholder={t('savedViews.name')}
              style={{ flex: 1 }}
              value={value.name}
              onChange={(event) => set({ name: event.target.value })}
            />
          </div>
        ) : null}
        {showFilters ? (
          <div className="flex items-start gap-2">
            <div
              className="text-[13px] text-muted-foreground"
              style={{ paddingBlock: 4, width: 72 }}
            >
              {t('savedViews.filters.label')}
            </div>
            <div className="flex flex-1 flex-col">
              <WorkQueryFilterBuilder
                entityType={value.entityType}
                value={value.builder}
                onChange={(builder) => set({ builder })}
              />
            </div>
          </div>
        ) : null}
        {showDisplay ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[13px] text-muted-foreground" style={{ width: 72 }}>
              {t('savedViews.display')}
            </div>
            <Select
              size="small"
              style={{ minWidth: 140 }}
              value={value.layout}
              options={[
                { label: t('savedViews.layoutList'), value: 'list' },
                { label: t('savedViews.layoutBoard'), value: 'board' },
              ]}
              onChange={(next) => {
                if (next === 'board' || next === 'list') {
                  set({
                    groupBy:
                      next === 'board' && value.groupBy === 'none' ? 'status' : value.groupBy,
                    layout: next,
                  });
                }
              }}
            />
            <Select
              size="small"
              style={{ minWidth: 150 }}
              value={value.groupBy}
              options={GROUP_BY_OPTIONS[value.entityType].map((groupBy) => ({
                label: t(`savedViews.groupBy.${groupBy}`),
                value: groupBy,
              }))}
              onChange={(next) => {
                if (
                  (GROUP_BY_OPTIONS[value.entityType] as readonly string[]).includes(next as string)
                ) {
                  const groupBy = next as EditableGroupBy;
                  set({
                    groupBy,
                    subGroupBy: normalizeWorkQuerySubGroupBy(groupBy, value.subGroupBy),
                  });
                }
              }}
            />
            {value.entityType === 'task' && value.layout === 'board' ? (
              <Select
                size="small"
                style={{ minWidth: 150 }}
                value={value.subGroupBy ?? 'none'}
                options={TASK_LANES.filter(
                  (lane) => lane === 'none' || normalizeWorkQuerySubGroupBy(value.groupBy, lane),
                ).map((lane) => ({
                  label:
                    lane === 'none'
                      ? t('savedViews.groupBy.none')
                      : t(`savedViews.groupBy.${lane}` as never, {
                          defaultValue: t(`myWork.grouping.${lane}` as never),
                        }),
                  value: lane,
                }))}
                onChange={(next) => {
                  if ((TASK_LANES as readonly string[]).includes(next as string)) {
                    set({
                      subGroupBy: next === 'none' ? undefined : (next as WorkQuerySubGroupBy),
                    });
                  }
                }}
              />
            ) : null}
            <Select
              size="small"
              style={{ minWidth: 170 }}
              options={[
                ...(value.layout === 'board'
                  ? [{ label: t('savedViews.sort.manual'), value: 'manual' }]
                  : []),
                { label: t('savedViews.sortDefault'), value: 'default' },
                ...Object.keys(SORT_PRESETS).map((key) => ({
                  label: t(`savedViews.sort.${key}` as never),
                  value: key,
                })),
              ]}
              value={
                value.layout === 'board' && (value.sortMode ?? 'manual') === 'manual'
                  ? 'manual'
                  : sortKey(value.sort)
              }
              onChange={(next) => {
                if (next === 'manual') {
                  set({ sortMode: 'manual' });
                  return;
                }
                if (typeof next === 'string' && next in SORT_PRESETS) {
                  set({ sort: SORT_PRESETS[next], sortMode: 'field' });
                  return;
                }
                set({ sort: undefined, sortMode: undefined });
              }}
            />
          </div>
        ) : null}
        {showShare ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[13px] text-muted-foreground" style={{ width: 72 }}>
              {t('savedViews.share')}
            </div>
            <Select
              size="small"
              style={{ minWidth: 150 }}
              value={value.visibility}
              options={[
                { label: t('savedViews.visibilityPrivate'), value: 'private' },
                ...(workspaceId
                  ? [
                      { label: t('savedViews.visibilityWorkspace'), value: 'workspace' },
                      { label: t('savedViews.visibilityTeam'), value: 'team' },
                    ]
                  : []),
              ]}
              onChange={(next) => {
                if (next === 'private' || next === 'team' || next === 'workspace') {
                  set({ teamId: next === 'team' ? value.teamId : null, visibility: next });
                }
              }}
            />
            {value.visibility === 'team' ? (
              <Select
                options={teamOptions}
                placeholder={t('savedViews.teamRequired')}
                size="small"
                style={{ minWidth: 150 }}
                value={value.teamId ?? undefined}
                onChange={(next) => {
                  if (typeof next === 'string') set({ teamId: next });
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);

ViewDefinitionEditor.displayName = 'ViewDefinitionEditor';

export default ViewDefinitionEditor;
