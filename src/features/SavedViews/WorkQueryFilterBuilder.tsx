'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, Button, Select, Tag, Text } from '@lobehub/ui/base-ui';
import type { WorkQueryEntityType, WorkQueryValue } from '@orvilo/types';
import { workQueryFieldSpec, workQueryFieldSpecs } from '@orvilo/types';
import { PlusIcon, XIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useClientDataSWR } from '@/libs/swr';
import { taskLabelKeys, workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { taskLabelService } from '@/services/taskLabel';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

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

const PROJECT_PAGE_SIZE = 25;
const PROJECT_MAX_PAGES = 10;

const toProjectOption = (item: { id: string; name?: string | null }) => ({
  label: item.name ?? item.id,
  value: item.id,
});

/**
 * Project picker backed by the authorized `projectOptions` search: the first
 * page loads lazily when the popup opens, keystrokes re-search server-side,
 * and later pages stream in behind it while the popup stays open — a Select
 * option cannot itself act as a "load more" row because picking it closes the
 * popup. The selected value hydrates by id separately since it may sit beyond
 * the loaded pages. base-ui Select has no remote-search hook, so the wrapping
 * div captures `input` events from the popup's search box (React events bubble
 * through the portal).
 */
const ProjectValueSelect = memo<{
  onChange: (value: string | undefined) => void;
  value?: string;
  workspaceId: string | null;
}>(({ onChange, value, workspaceId }) => {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState('');
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      const fetchPage = async (afterId?: string) => {
        const result = await workAttentionService.projectOptions({
          afterId,
          limit: PROJECT_PAGE_SIZE,
          query: needle || undefined,
        });
        if (cancelled) return null;
        const items = result?.data?.items ?? [];
        setOptions((current) => {
          const seen = new Set(current.map((option) => option.value));
          return [...current, ...items.filter((item) => !seen.has(item.id)).map(toProjectOption)];
        });
        return result?.data?.nextCursor ?? null;
      };
      void (async () => {
        try {
          setOptions([]);
          let cursor = await fetchPage();
          for (let page = 1; cursor && page < PROJECT_MAX_PAGES; page += 1) {
            cursor = await fetchPage(cursor);
          }
        } catch {
          if (!cancelled) setOptions([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle, open]);

  const { data: selectedData } = useClientDataSWR(
    value ? `view-builder-project:${workspaceId ?? 'personal'}:${value}` : null,
    () => workAttentionService.projectOptions({ ids: [value!] }),
  );

  const mergedOptions = useMemo(() => {
    const selected = (selectedData?.data?.items ?? []).map(toProjectOption);
    const seen = new Set(options.map((option) => option.value));
    return [...selected.filter((option) => !seen.has(option.value)), ...options];
  }, [options, selectedData]);

  return (
    // The popup's search input lives in a portal; its `input` events still
    // bubble to React ancestors, which is the only way to observe the needle.
    <div
      onInput={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) setNeedle(target.value);
      }}
    >
      <Select
        showSearch
        loading={loading}
        options={mergedOptions}
        placeholder={t('savedViews.filters.projectPlaceholder')}
        size="small"
        style={{ minWidth: 160 }}
        value={value}
        onChange={(next) => onChange(typeof next === 'string' ? next : undefined)}
        onOpenChange={setOpen}
      />
    </div>
  );
});

ProjectValueSelect.displayName = 'ProjectValueSelect';

/**
 * Cycle options come from a single `cycleOptions` query scoped to the team
 * the filter already pins (a `teamId = …` row); without one it lists cycles
 * across the caller's readable teams in one call — never a per-team fan-out.
 */
const useCycleOptions = (
  teamId: string | undefined,
  needed: boolean,
  workspaceId: string | null,
  selectedId?: string,
) => {
  const { data } = useClientDataSWR(
    needed ? `view-builder-cycles:${workspaceId ?? 'personal'}:${teamId ?? 'all'}` : null,
    async () => {
      const result = await workAttentionService.cycleOptions({ limit: 100, teamId });
      return (result?.data ?? []).map((cycle) => ({
        label: teamId
          ? (cycle.name ?? cycle.id)
          : `${cycle.teamName ?? cycle.teamId} · ${cycle.name ?? cycle.id}`,
        value: cycle.id,
      }));
    },
  );
  const { data: selected } = useClientDataSWR(
    needed && selectedId ? `view-builder-cycle:${workspaceId ?? 'personal'}:${selectedId}` : null,
    async () => {
      const result = await workAttentionService.cycleOptions({ ids: [selectedId!] });
      return (result?.data ?? []).map((cycle) => ({
        label: `${cycle.teamName ?? cycle.teamId} · ${cycle.name ?? cycle.id}`,
        value: cycle.id,
      }));
    },
  );
  return useMemo(() => {
    const seen = new Set((data ?? []).map((option) => option.value));
    return [...(selected ?? []).filter((option) => !seen.has(option.value)), ...(data ?? [])];
  }, [data, selected]);
};

const FilterRowEditor = memo<{
  cycleTeamId?: string;
  entityType: WorkQueryEntityType;
  onChange: (row: FilterRow) => void;
  onRemove: () => void;
  row: FilterRow;
}>(({ cycleTeamId, entityType, onChange, onRemove, row }) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const isLogin = useUserStore(authSelectors.isLogin);
  const spec = workQueryFieldSpec(entityType, row.field);

  const memberOptions = useWorkspaceMembersQuery({
    enabled: spec?.valueKind === 'user',
  });
  const { data: teamsData } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const { data: labelsData } = useClientDataSWR(
    spec?.valueKind === 'label' && isLogin ? taskLabelKeys.list(isLogin, workspaceId) : null,
    () => taskLabelService.getLabels(),
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

  const labelOptions = useMemo(
    () => (labelsData ?? []).map((label) => ({ label: label.name, value: label.id })),
    [labelsData],
  );

  const cycleOptions = useCycleOptions(
    cycleTeamId,
    spec?.valueKind === 'cycle',
    workspaceId,
    spec?.valueKind === 'cycle' && typeof row.value === 'string' ? row.value : undefined,
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
      case 'label': {
        const multi = isMultiOp(row.op);
        return (
          <Select
            mode={multi ? 'multiple' : undefined}
            options={labelOptions}
            placeholder={t('savedViews.filters.labelPlaceholder')}
            size="small"
            style={{ minWidth: 160 }}
            value={row.value as never}
            onChange={(next) => onChange({ ...row, value: next as WorkQueryValue })}
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
                ? row.value.filter((v): v is string => typeof v === 'string')
                : typeof row.value === 'string'
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

    const removeSlot = useCallback(
      (index: number) => {
        onChange({ ...value, slots: value.slots.filter((_, i) => i !== index) });
      },
      [onChange, value],
    );

    // A pinned `teamId = <team>` row scopes the cycle picker to that team.
    const cycleTeamId = value.rows.find(
      (row) => row.field === 'teamId' && row.op === 'eq' && typeof row.value === 'string',
    )?.value as string | undefined;

    return (
      <Flexbox gap={8}>
        {value.rows.map((row) => (
          <FilterRowEditor
            cycleTeamId={cycleTeamId}
            entityType={entityType}
            key={row.id}
            row={row}
            onChange={(next) => updateRow(row.id, next)}
            onRemove={() => removeRow(row.id)}
          />
        ))}
        {value.slots.map((slot, index) =>
          slot.type === 'node' ? (
            <Flexbox horizontal align="center" gap={8} key={`slot-${index}`}>
              <Tag>
                {t('savedViews.filters.advancedNode', {
                  field: 'field' in slot.node ? slot.node.field : 'any',
                })}
              </Tag>
              <ActionIcon
                icon={XIcon}
                size="small"
                title={t('savedViews.filters.remove')}
                onClick={() => removeSlot(index)}
              />
            </Flexbox>
          ) : null,
        )}
        {value.any.length > 0 ? (
          <Flexbox horizontal align="center" gap={8}>
            <Tag>{t('savedViews.filters.advancedNode', { field: 'any' })}</Tag>
            <ActionIcon
              icon={XIcon}
              size="small"
              title={t('savedViews.filters.remove')}
              onClick={() => onChange({ ...value, any: [] })}
            />
          </Flexbox>
        ) : null}
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
        {value.rows.length === 0 &&
        !value.slots.some((slot) => slot.type === 'node') &&
        value.any.length === 0 ? (
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
