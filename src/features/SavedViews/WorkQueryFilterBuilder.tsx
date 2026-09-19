'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, Button, Select, Tag, Text } from '@lobehub/ui/base-ui';
import type { WorkQueryEntityType, WorkQueryValue } from '@orvilo/types';
import { workQueryFieldSpec, workQueryFieldSpecs } from '@orvilo/types';
import { PlusIcon, XIcon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';

import type { BuilderState, FilterRow } from './workQueryBuilder';
import { defaultRowValue, newFilterRow } from './workQueryBuilder';

const SELF_VALUE = '$currentUser';

const isNullaryOp = (op: FilterRow['op']) => op === 'isNull' || op === 'isNotNull';
const isMultiOp = (op: FilterRow['op']) => op === 'in' || op === 'notIn';

/** Display value ↔ AST value for user-kind fields. */
const userValueToOption = (value: WorkQueryValue | undefined): string | undefined => {
  if (value && typeof value === 'object' && 'ref' in value) return SELF_VALUE;
  return typeof value === 'string' ? value : undefined;
};

const optionToUserValue = (option: string): WorkQueryValue =>
  option === SELF_VALUE ? { ref: 'currentUser' } : option;

/**
 * Project picker backed by the permission-filtered project query — the Select's
 * built-in search filters the loaded labels client-side (base-ui Select has no
 * server search hook), so values always resolve to real readable projects.
 */
const ProjectValueSelect = memo<{
  onChange: (value: string | undefined) => void;
  value?: string;
  workspaceId: string | null;
}>(({ onChange, value, workspaceId }) => {
  const { t } = useTranslation('common');
  const { data } = useClientDataSWR(`view-builder-projects:${workspaceId ?? 'personal'}`, () =>
    workAttentionService.query({
      limit: 100,
      query: { entityType: 'project', schemaVersion: 1 },
    }),
  );

  const options = (data?.data?.projects ?? []).map((project) => ({
    label: project.name ?? project.id,
    value: project.id,
  }));

  return (
    <Select
      showSearch
      options={options}
      placeholder={t('savedViews.filters.projectPlaceholder')}
      size="small"
      style={{ minWidth: 160 }}
      value={value}
      onChange={(next) => onChange(typeof next === 'string' ? next : undefined)}
    />
  );
});

ProjectValueSelect.displayName = 'ProjectValueSelect';

/** Cycle options resolve per team — loaded once, only when a cycle row exists. */
const useCycleOptions = (teamIds: string[], needed: boolean, workspaceId: string | null) => {
  const { data } = useClientDataSWR(
    needed && teamIds.length > 0
      ? `view-builder-cycles:${workspaceId ?? 'personal'}:${[...teamIds].sort().join(',')}`
      : null,
    async () => {
      const details = await Promise.all(
        teamIds.map((teamId) => lambdaClient.team.team.query({ teamId })),
      );
      return details.flatMap((detail) =>
        (detail.data?.cycles ?? []).map((cycle) => ({
          label: `${detail.data?.team.name ?? teamId} · ${cycle.name}`,
          value: cycle.id,
        })),
      );
    },
  );
  return data ?? [];
};

const FilterRowEditor = memo<{
  entityType: WorkQueryEntityType;
  onChange: (row: FilterRow) => void;
  onRemove: () => void;
  row: FilterRow;
}>(({ entityType, onChange, onRemove, row }) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const spec = workQueryFieldSpec(entityType, row.field);

  const memberOptions = useWorkspaceMembersQuery({
    enabled: spec?.valueKind === 'user',
  });
  const { data: teamsData } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );

  const userOptions = useMemo(() => {
    const members = memberOptions.members ?? [];
    return [
      { label: t('savedViews.filters.me'), value: SELF_VALUE },
      ...members
        .filter((member) => member.userId)
        .map((member) => ({
          label:
            member.user?.fullName || member.user?.username || member.user?.email || member.userId,
          value: member.userId,
        })),
    ];
  }, [memberOptions.members, t]);

  const teamOptions = useMemo(
    () => (teamsData?.data ?? []).map((team) => ({ label: team.name, value: team.id })),
    [teamsData?.data],
  );

  const cycleOptions = useCycleOptions(
    teamOptions.map((option) => option.value),
    spec?.valueKind === 'cycle',
    workspaceId,
  );

  const fieldOptions = workQueryFieldSpecs(entityType).map((item) => ({
    label: t(`savedViews.fields.${item.field}`, { defaultValue: item.field }),
    value: item.field,
  }));

  const changeField = (field: string) => {
    const nextSpec = workQueryFieldSpec(entityType, field);
    if (!nextSpec) return;
    onChange({
      field,
      id: row.id,
      op: nextSpec.ops[0] ?? 'eq',
      value: defaultRowValue(nextSpec),
    });
  };

  const valueEditor = (() => {
    if (!spec || isNullaryOp(row.op)) return null;
    switch (spec.valueKind) {
      case 'enum': {
        const options = (spec.enumValues ?? []).map((item) => ({
          label: t(`savedViews.values.${row.field}.${item}`, { defaultValue: String(item) }),
          value: item,
        }));
        const multi = isMultiOp(row.op);
        return (
          <Select
            mode={multi ? 'multiple' : undefined}
            options={options}
            placeholder={t('savedViews.filters.valuePlaceholder')}
            size="small"
            style={{ minWidth: 140 }}
            value={row.value as never}
            onChange={(next) => onChange({ ...row, value: next as WorkQueryValue })}
          />
        );
      }
      case 'user': {
        if (spec.currentUserOnly) {
          return <Tag>{t('savedViews.filters.me')}</Tag>;
        }
        return (
          <Select
            showSearch
            options={userOptions}
            placeholder={t('savedViews.filters.valuePlaceholder')}
            size="small"
            style={{ minWidth: 160 }}
            value={userValueToOption(row.value)}
            onChange={(next) =>
              onChange({
                ...row,
                value: typeof next === 'string' ? optionToUserValue(next) : undefined,
              })
            }
          />
        );
      }
      case 'team': {
        return (
          <Select
            options={teamOptions}
            placeholder={t('savedViews.filters.valuePlaceholder')}
            size="small"
            style={{ minWidth: 160 }}
            value={typeof row.value === 'string' ? row.value : undefined}
            onChange={(next) =>
              onChange({ ...row, value: typeof next === 'string' ? next : undefined })
            }
          />
        );
      }
      case 'project': {
        return (
          <ProjectValueSelect
            value={typeof row.value === 'string' ? row.value : undefined}
            workspaceId={workspaceId}
            onChange={(next) => onChange({ ...row, value: next })}
          />
        );
      }
      case 'cycle': {
        return (
          <Select
            options={cycleOptions}
            placeholder={t('savedViews.filters.cyclePlaceholder')}
            size="small"
            style={{ minWidth: 160 }}
            value={typeof row.value === 'string' ? row.value : undefined}
            onChange={(next) =>
              onChange({ ...row, value: typeof next === 'string' ? next : undefined })
            }
          />
        );
      }
      default: {
        return null;
      }
    }
  })();

  return (
    <Flexbox horizontal align="center" gap={8}>
      <Select
        options={fieldOptions}
        size="small"
        style={{ minWidth: 140 }}
        value={row.field}
        onChange={changeField}
      />
      <Select
        size="small"
        style={{ minWidth: 120 }}
        value={row.op}
        options={(spec?.ops ?? []).map((op) => ({
          label: t(`savedViews.ops.${op}`),
          value: op,
        }))}
        onChange={(next) => {
          const nextValue =
            next === 'in' || next === 'notIn'
              ? Array.isArray(row.value)
                ? row.value
                : row.value !== undefined
                  ? [row.value]
                  : []
              : row.value;
          onChange({ ...row, op: next, value: nextValue });
        }}
      />
      {valueEditor}
      <ActionIcon
        icon={XIcon}
        size="small"
        title={t('savedViews.filters.remove')}
        onClick={onRemove}
      />
    </Flexbox>
  );
});

FilterRowEditor.displayName = 'FilterRowEditor';

interface WorkQueryFilterBuilderProps {
  entityType: WorkQueryEntityType;
  onChange: (state: BuilderState) => void;
  value: BuilderState;
}

/**
 * Visual builder over the flat `filter.all` predicate set. Nested `any` nodes
 * and predicates outside the field registry render as locked chips and are
 * preserved on save (F24 — unknown nodes must round-trip, never drop).
 */
const WorkQueryFilterBuilder = memo<WorkQueryFilterBuilderProps>(
  ({ entityType, onChange, value }) => {
    const { t } = useTranslation('common');

    const updateRow = useCallback(
      (id: string, row: FilterRow) => {
        onChange({
          ...value,
          rows: value.rows.map((item) => (item.id === id ? row : item)),
        });
      },
      [onChange, value],
    );

    const removeRow = useCallback(
      (id: string) => {
        onChange({ ...value, rows: value.rows.filter((item) => item.id !== id) });
      },
      [onChange, value],
    );

    const removeRetained = useCallback(
      (index: number) => {
        onChange({ ...value, retained: value.retained.filter((_, i) => i !== index) });
      },
      [onChange, value],
    );

    return (
      <Flexbox gap={8}>
        {value.rows.map((row) => (
          <FilterRowEditor
            entityType={entityType}
            key={row.id}
            row={row}
            onChange={(next) => updateRow(row.id, next)}
            onRemove={() => removeRow(row.id)}
          />
        ))}
        {value.retained.map((node, index) => (
          <Flexbox horizontal align="center" gap={8} key={`retained-${index}`}>
            <Tag>
              {t('savedViews.filters.advancedNode', {
                field: 'field' in node ? node.field : 'any',
              })}
            </Tag>
            <ActionIcon
              icon={XIcon}
              size="small"
              title={t('savedViews.filters.remove')}
              onClick={() => removeRetained(index)}
            />
          </Flexbox>
        ))}
        <Flexbox horizontal>
          <Button
            icon={PlusIcon}
            size="small"
            type="text"
            onClick={() => onChange({ ...value, rows: [...value.rows, newFilterRow(entityType)] })}
          >
            {t('savedViews.filters.add')}
          </Button>
        </Flexbox>
        {value.rows.length === 0 && value.retained.length === 0 ? (
          <Text fontSize={12} type="secondary">
            {t('savedViews.filters.empty')}
          </Text>
        ) : null}
      </Flexbox>
    );
  },
);

WorkQueryFilterBuilder.displayName = 'WorkQueryFilterBuilder';

export default WorkQueryFilterBuilder;
