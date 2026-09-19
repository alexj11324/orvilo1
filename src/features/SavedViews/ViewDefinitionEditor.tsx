'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Select, Text } from '@lobehub/ui/base-ui';
import type {
  SavedViewVisibility,
  WorkQueryEntityType,
  WorkQueryGroupBy,
  WorkQueryLayout,
  WorkQuerySort,
} from '@orvilo/types';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
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

const GROUP_BY_OPTIONS: Record<WorkQueryEntityType, WorkQueryGroupBy[]> = {
  project: ['none', 'status'],
  task: ['none', 'status', 'workflowCategory'],
};

interface ViewDefinitionEditorProps {
  onChange: (next: ViewEditorState) => void;
  /** Entity picker renders only in the create dialog. */
  showEntityPicker?: boolean;
  showName?: boolean;
  showShare?: boolean;
  value: ViewEditorState;
}

const ViewDefinitionEditor = memo<ViewDefinitionEditorProps>(
  ({ onChange, showEntityPicker, showName, showShare, value }) => {
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
      <Flexbox gap={12}>
        {showEntityPicker ? (
          <Flexbox horizontal align="center" gap={8}>
            <Text fontSize={13} style={{ width: 72 }} type="secondary">
              {t('savedViews.entityType')}
            </Text>
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
                  builder: { retained: [], rows: [] },
                  entityType: next,
                  groupBy: 'none',
                });
              }}
            />
          </Flexbox>
        ) : null}
        {showName ? (
          <Flexbox horizontal align="center" gap={8}>
            <Text fontSize={13} style={{ width: 72 }} type="secondary">
              {t('savedViews.name')}
            </Text>
            <Input
              placeholder={t('savedViews.name')}
              size="small"
              style={{ flex: 1 }}
              value={value.name}
              onChange={(event) => set({ name: event.target.value })}
            />
          </Flexbox>
        ) : null}
        <Flexbox horizontal align="flex-start" gap={8}>
          <Text fontSize={13} style={{ paddingBlock: 4, width: 72 }} type="secondary">
            {t('savedViews.filters.label')}
          </Text>
          <Flexbox flex={1}>
            <WorkQueryFilterBuilder
              entityType={value.entityType}
              value={value.builder}
              onChange={(builder) => set({ builder })}
            />
          </Flexbox>
        </Flexbox>
        <Flexbox horizontal align="center" gap={8} wrap="wrap">
          <Text fontSize={13} style={{ width: 72 }} type="secondary">
            {t('savedViews.display')}
          </Text>
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
                  groupBy: next === 'board' && value.groupBy === 'none' ? 'status' : value.groupBy,
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
              if (next === 'none' || next === 'status' || next === 'workflowCategory') {
                set({ groupBy: next });
              }
            }}
          />
          <Select
            size="small"
            style={{ minWidth: 170 }}
            value={sortKey(value.sort)}
            options={[
              { label: t('savedViews.sortDefault'), value: 'default' },
              ...Object.keys(SORT_PRESETS).map((key) => ({
                label: t(`savedViews.sort.${key}`),
                value: key,
              })),
            ]}
            onChange={(next) => {
              set({ sort: typeof next === 'string' ? SORT_PRESETS[next] : undefined });
            }}
          />
        </Flexbox>
        {showShare ? (
          <Flexbox horizontal align="center" gap={8} wrap="wrap">
            <Text fontSize={13} style={{ width: 72 }} type="secondary">
              {t('savedViews.share')}
            </Text>
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
          </Flexbox>
        ) : null}
      </Flexbox>
    );
  },
);

ViewDefinitionEditor.displayName = 'ViewDefinitionEditor';

export default ViewDefinitionEditor;
