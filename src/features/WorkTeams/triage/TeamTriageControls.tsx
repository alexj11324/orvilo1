'use client';

import { Flexbox, Icon, Input } from '@lobehub/ui';
import { ActionIcon, Button, Popover, Select, Switch, Text, Tooltip } from '@lobehub/ui/base-ui';
import type { WorkQueryField } from '@orvilo/types';
import { workQueryFieldSpec } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import type { ParseKeys } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  FilterIcon,
  Settings2Icon,
  SignalIcon,
  SlidersHorizontalIcon,
  SquarePenIcon,
  TagIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { PriorityIcon } from '@/components/PriorityIcon';
import { resolveLabelColor } from '@/features/Labels/labelColor';
import {
  clearMyWorkDirectoryField,
  myWorkDirectoryFieldActive,
  myWorkDirectoryNullaryActive,
  myWorkDirectorySelectedValues,
  toggleMyWorkDirectoryEnum,
  toggleMyWorkDirectoryNullary,
  toggleMyWorkDirectoryValue,
} from '@/features/MyWork/myWorkFilters';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import WorkQueryFilterBuilder from '@/features/SavedViews/WorkQueryFilterBuilder';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useClientDataSWR } from '@/libs/swr';
import { taskLabelKeys } from '@/libs/swr/keys';
import { taskLabelService } from '@/services/taskLabel';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import type {
  TeamTriageDirection,
  TeamTriageDisplay,
  TeamTriageOrdering,
} from './teamTriageDisplay';
import { TEAM_TRIAGE_ORDERINGS } from './teamTriageDisplay';

/**
 * Fields the triage "Add filter" directory exposes, ordered after Linear's
 * menu (Assignee → Creator → Priority → Labels → Project). Only fields the
 * work-query spec supports AND whose values the picker can resolve appear —
 * the reference's Agent/Agent Session/Dates/… entries have no task predicate
 * to express them here, so they stay out instead of shipping dead rows.
 */
export const TEAM_TRIAGE_FILTER_DIRECTORY_FIELDS: readonly WorkQueryField[] = [
  'assigneeUserId',
  'createdByUserId',
  'priority',
  'labelId',
  'projectId',
];

const DIRECTORY_FIELD_ICONS: Partial<Record<WorkQueryField, LucideIcon>> = {
  assigneeUserId: CircleUserRoundIcon,
  createdByUserId: SquarePenIcon,
  labelId: TagIcon,
  priority: SignalIcon,
  projectId: PROJECT_ENTITY_ICON,
};

const styles = createStaticStyles(({ css }) => ({
  backButton: css`
    flex: none;
  `,
  checkIcon: css`
    flex: none;
    color: ${cssVar.colorPrimary};
  `,
  controlPopover: css`
    width: min(300px, calc(100vw - 32px));
    padding: 12px;
  `,
  directoryPane: css`
    width: min(280px, calc(100vw - 32px));
    padding: 8px;
  `,
  builderPane: css`
    width: min(460px, calc(100vw - 32px));
    padding: 12px;
  `,
  labelDot: css`
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  `,
  menuRow: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    min-height: 28px;
    padding-block: 4px;
    padding-inline: 8px;
    border: none;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  menuRowIcon: css`
    flex: none;
    color: ${cssVar.colorTextSecondary};
  `,
  menuRowLabel: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  optionLabel: css`
    flex: none;
    width: 96px;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  paneHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;

    min-height: 28px;
    padding-inline: 4px;
  `,
  searchInput: css`
    margin-block-end: 4px;
  `,
  sectionDivider: css`
    margin-block: 4px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sectionLabel: css`
    padding-block-start: 4px;
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
}));

type FilterPane = { field: WorkQueryField; kind: 'field' } | { kind: 'builder' } | { kind: 'menu' };

const MenuRow = memo<{
  checked?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  trailing?: ReactNode;
}>(({ checked, icon, label, onClick, trailing }) => (
  <button className={styles.menuRow} type="button" onClick={onClick}>
    {icon ? <span className={styles.menuRowIcon}>{icon}</span> : null}
    <span className={styles.menuRowLabel}>{label}</span>
    {checked ? <CheckIcon className={styles.checkIcon} size={14} /> : null}
    {trailing}
  </button>
));

MenuRow.displayName = 'MenuRow';

const PaneHeader = memo<{ onBack: () => void; title: string }>(({ onBack, title }) => {
  const { t } = useTranslation('common');
  return (
    <Flexbox horizontal align="center" className={styles.paneHeader} gap={8}>
      <ActionIcon
        aria-label={t('back')}
        className={styles.backButton}
        icon={ChevronLeftIcon}
        size="small"
        title={t('back')}
        onClick={onBack}
      />
      <Text ellipsis fontSize={13} weight={500}>
        {title}
      </Text>
    </Flexbox>
  );
});

PaneHeader.displayName = 'PaneHeader';

const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return 'ref' in a && 'ref' in b && (a as { ref: string }).ref === (b as { ref: string }).ref;
  }
  return false;
};

interface DirectoryValueRow {
  checked: boolean;
  icon?: ReactNode;
  key: string;
  label: string;
  onClick: () => void;
}

/**
 * The field pane of the triage Add-filter directory: value rows resolved per
 * field kind (members for user fields, the enum's own values, the workspace
 * label registry, authorized project options) plus the spec's nullary rows.
 * Every pick writes through the shared directory helpers, so the predicates
 * it authors are exactly what the work-query builder can express.
 */
const TriageFieldPane = memo<{
  builder: BuilderState;
  field: WorkQueryField;
  onBuilderChange: (builder: BuilderState) => void;
}>(({ builder, field, onBuilderChange }) => {
  const { t } = useTranslation(['common', 'chat']);
  const spec = workQueryFieldSpec('task', field);
  const memberQuery = useWorkspaceMembersQuery({ enabled: spec?.valueKind === 'user' });
  const workspaceId = useActiveWorkspaceId();
  const isLogin = useUserStore(authSelectors.isLogin);
  const { data: labelsData } = useClientDataSWR(
    spec?.valueKind === 'label' && isLogin ? taskLabelKeys.list(isLogin, workspaceId) : null,
    () => taskLabelService.getLabels(),
  );
  const { data: projectsData } = useClientDataSWR(
    spec?.valueKind === 'project' && workspaceId ? ['team-triage-projects', workspaceId] : null,
    () => workAttentionService.projectOptions({ limit: 50 }),
  );

  const selected = myWorkDirectorySelectedValues(builder, field);
  const isSelected = (value: unknown) => selected.some((item) => valuesEqual(item, value));

  const valueRows: DirectoryValueRow[] = [];
  const nullaryRows: DirectoryValueRow[] = [];

  if (spec) {
    switch (spec.valueKind) {
      case 'enum': {
        for (const value of spec.enumValues ?? []) {
          valueRows.push({
            checked: isSelected(value),
            icon:
              field === 'priority' ? (
                <PriorityIcon priority={Number(value)} size={14} />
              ) : undefined,
            key: String(value),
            label: t(`savedViews.values.${field}.${value}` as never, {
              defaultValue: String(value),
            }),
            onClick: () => onBuilderChange(toggleMyWorkDirectoryValue(builder, field, value)),
          });
        }
        break;
      }
      case 'user': {
        const me = { ref: 'currentUser' } as const;
        const options = [
          { label: t('savedViews.filters.me'), value: me },
          ...(memberQuery.members ?? [])
            .filter((member) => member.userId)
            .map((member) => ({
              label:
                member.user?.fullName ||
                member.user?.username ||
                member.user?.email ||
                member.userId,
              value: member.userId as string,
            })),
        ];
        for (const option of options) {
          valueRows.push({
            checked: isSelected(option.value),
            key: typeof option.value === 'string' ? option.value : 'me',
            label: option.label,
            onClick: () =>
              onBuilderChange(toggleMyWorkDirectoryValue(builder, field, option.value)),
          });
        }
        break;
      }
      case 'label': {
        for (const label of labelsData ?? []) {
          valueRows.push({
            checked: isSelected(label.id),
            icon: (
              <span
                aria-hidden
                className={styles.labelDot}
                style={{ background: resolveLabelColor(label.name, label.color) }}
              />
            ),
            key: label.id,
            label: label.name,
            onClick: () => onBuilderChange(toggleMyWorkDirectoryEnum(builder, field, label.id)),
          });
        }
        break;
      }
      case 'project': {
        for (const project of projectsData?.data?.items ?? []) {
          valueRows.push({
            checked: isSelected(project.id),
            icon: <Icon icon={PROJECT_ENTITY_ICON} size={14} />,
            key: project.id,
            label: project.name || project.id,
            onClick: () => onBuilderChange(toggleMyWorkDirectoryValue(builder, field, project.id)),
          });
        }
        break;
      }
      default: {
        break;
      }
    }
    if (spec.ops.includes('isNull')) {
      nullaryRows.push({
        checked: myWorkDirectoryNullaryActive(builder, field, 'isNull'),
        key: 'isNull',
        label:
          field === 'assigneeUserId' ? t('chat:taskList.unassigned') : t('savedViews.ops.isNull'),
        onClick: () => onBuilderChange(toggleMyWorkDirectoryNullary(builder, field, 'isNull')),
      });
    }
    if (spec.ops.includes('isNotNull')) {
      nullaryRows.push({
        checked: myWorkDirectoryNullaryActive(builder, field, 'isNotNull'),
        key: 'isNotNull',
        label:
          field === 'assigneeUserId' ? t('myWork.filterAssigned') : t('savedViews.ops.isNotNull'),
        onClick: () => onBuilderChange(toggleMyWorkDirectoryNullary(builder, field, 'isNotNull')),
      });
    }
  }

  if (!spec) return null;

  return (
    <Flexbox>
      {valueRows.map((row) => (
        <MenuRow
          checked={row.checked}
          icon={row.icon}
          key={row.key}
          label={row.label}
          onClick={row.onClick}
        />
      ))}
      {nullaryRows.length > 0 ? (
        <>
          <div className={styles.sectionDivider} />
          {nullaryRows.map((row) => (
            <MenuRow checked={row.checked} key={row.key} label={row.label} onClick={row.onClick} />
          ))}
        </>
      ) : null}
      {myWorkDirectoryFieldActive(builder, field) ? (
        <>
          <div className={styles.sectionDivider} />
          <MenuRow
            label={t('myWork.filterClearField')}
            onClick={() => onBuilderChange(clearMyWorkDirectoryField(builder, field))}
          />
        </>
      ) : null}
    </Flexbox>
  );
});

TriageFieldPane.displayName = 'TriageFieldPane';

const OptionRow = memo<{ children: ReactNode; label: string }>(({ children, label }) => (
  <Flexbox horizontal align="center" gap={8}>
    <span className={styles.optionLabel}>{label}</span>
    <Flexbox flex={1} style={{ minWidth: 0 }}>
      {children}
    </Flexbox>
  </Flexbox>
));

OptionRow.displayName = 'OptionRow';

export interface TeamTriageControlsProps {
  /** Applied builder predicates — paints the Filter icon's active state. */
  activeFilterCount: number;
  builder: BuilderState;
  display: TeamTriageDisplay;
  onBuilderChange: (builder: BuilderState) => void;
  onDisplayChange: (patch: Partial<TeamTriageDisplay>) => void;
  onResetDisplay: () => void;
  onResetFilters: () => void;
}

/**
 * Linear's triage header chrome: Add filter + Display options.
 *
 * Add filter is the searchable field directory (Assignee / Creator /
 * Priority / Labels / Project) with the shared work-query builder behind
 * "Advanced filter" — every row authors real `workQuery` predicates, nothing
 * inert. Display options carries the observed Ordering + Direction pair, the
 * ID display property, and the reference's "Show snoozed"/"Due date" rows
 * rendered disabled: the task model has no snooze or due-date field, so an
 * enabled control would promise persistence the backend cannot honor.
 */
const TeamTriageControls = memo<TeamTriageControlsProps>(
  ({
    activeFilterCount,
    builder,
    display,
    onBuilderChange,
    onDisplayChange,
    onResetDisplay,
    onResetFilters,
  }) => {
    const { t } = useTranslation('common');
    const [filterOpen, setFilterOpen] = useState(false);
    const [pane, setPane] = useState<FilterPane>({ kind: 'menu' });
    const [keyword, setKeyword] = useState('');

    // Closing the popover returns it to the directory root for the next open.
    useEffect(() => {
      if (!filterOpen) {
        setPane({ kind: 'menu' });
        setKeyword('');
      }
    }, [filterOpen]);

    const directoryFields = useMemo(() => {
      const needle = keyword.trim().toLowerCase();
      return TEAM_TRIAGE_FILTER_DIRECTORY_FIELDS.map((field) => ({
        active: myWorkDirectoryFieldActive(builder, field),
        field,
        icon: DIRECTORY_FIELD_ICONS[field],
        label: t(`savedViews.fields.${field}` as ParseKeys<'common'>, { defaultValue: field }),
      })).filter((entry) => !needle || entry.label.toLowerCase().includes(needle));
    }, [builder, keyword, t]);

    const orderingLabels: Record<TeamTriageOrdering, string> = {
      addedToTriage: t('teams.triageOrderingAdded'),
      priority: t('myWork.properties.priority'),
      updated: t('myWork.properties.updated'),
    };
    const directionLabels: Record<TeamTriageDirection, string> = {
      asc: t('savedViews.direction.asc'),
      desc: t('savedViews.direction.desc'),
    };

    const filterContent =
      pane.kind === 'builder' ? (
        <Flexbox className={styles.builderPane} gap={8}>
          <PaneHeader title={t('myWork.filterAdvanced')} onBack={() => setPane({ kind: 'menu' })} />
          <WorkQueryFilterBuilder entityType={'task'} value={builder} onChange={onBuilderChange} />
        </Flexbox>
      ) : pane.kind === 'field' ? (
        <Flexbox className={styles.directoryPane} gap={2}>
          <PaneHeader
            title={t(`savedViews.fields.${pane.field}` as never, { defaultValue: pane.field })}
            onBack={() => setPane({ kind: 'menu' })}
          />
          <TriageFieldPane builder={builder} field={pane.field} onBuilderChange={onBuilderChange} />
        </Flexbox>
      ) : (
        <Flexbox className={styles.directoryPane} gap={2}>
          <Input
            autoFocus
            className={styles.searchInput}
            placeholder={t('myWork.filterSearchPlaceholder')}
            size="small"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <MenuRow
            icon={<Icon icon={SlidersHorizontalIcon} size={14} />}
            label={t('myWork.filterAdvanced')}
            trailing={<ChevronRightIcon className={styles.menuRowIcon} size={14} />}
            onClick={() => setPane({ kind: 'builder' })}
          />
          {directoryFields.map((entry) => (
            <MenuRow
              checked={entry.active}
              icon={entry.icon ? <Icon icon={entry.icon} size={14} /> : undefined}
              key={entry.field}
              label={entry.label}
              trailing={<ChevronRightIcon className={styles.menuRowIcon} size={14} />}
              onClick={() => setPane({ field: entry.field, kind: 'field' })}
            />
          ))}
          {activeFilterCount > 0 ? (
            <>
              <div className={styles.sectionDivider} />
              <Flexbox horizontal justify="flex-end" style={{ paddingInlineEnd: 4 }}>
                <Button size="small" type="text" onClick={onResetFilters}>
                  {t('myWork.filtersReset')}
                </Button>
              </Flexbox>
            </>
          ) : null}
        </Flexbox>
      );

    return (
      <Flexbox horizontal align="center" gap={6} style={{ flex: 'none' }}>
        <Popover
          content={filterContent}
          open={filterOpen}
          placement="bottomRight"
          trigger="click"
          onOpenChange={setFilterOpen}
        >
          <ActionIcon
            active={activeFilterCount > 0}
            aria-label={t('myWork.addFilter')}
            icon={FilterIcon}
            size="small"
            title={t('myWork.addFilter')}
          />
        </Popover>
        <Popover
          placement="bottomRight"
          trigger="click"
          content={
            <Flexbox className={styles.controlPopover} gap={12}>
              <span className={styles.sectionLabel}>{t('savedViews.ordering')}</span>
              <Flexbox horizontal align="center" gap={6}>
                <Tooltip title={directionLabels[display.direction]}>
                  <ActionIcon
                    aria-label={t('teams.triageDirection')}
                    size="small"
                    icon={
                      display.direction === 'desc' ? ArrowDownWideNarrowIcon : ArrowUpNarrowWideIcon
                    }
                    onClick={() =>
                      onDisplayChange({
                        direction: display.direction === 'desc' ? 'asc' : 'desc',
                      })
                    }
                  />
                </Tooltip>
                <Select
                  aria-label={t('savedViews.ordering')}
                  size="small"
                  style={{ flex: 1 }}
                  value={display.ordering}
                  options={TEAM_TRIAGE_ORDERINGS.map((value) => ({
                    label: orderingLabels[value],
                    value,
                  }))}
                  onChange={(next) => {
                    if ((TEAM_TRIAGE_ORDERINGS as readonly string[]).includes(next as string)) {
                      onDisplayChange({ ordering: next as TeamTriageOrdering });
                    }
                  }}
                />
              </Flexbox>
              {/* Linear's "Show snoozed" toggle — the task model has no
                  snooze state, so the row stays disabled and honest instead
                  of promising a queue the backend cannot persist. */}
              <OptionRow label={t('teams.triageShowSnoozed')}>
                <Tooltip title={t('teams.snoozeUnavailable')}>
                  <Switch disabled checked={false} size="small" />
                </Tooltip>
              </OptionRow>
              <span className={styles.sectionLabel}>{t('savedViews.displayProperties')}</span>
              <OptionRow label={t('teams.triageId')}>
                <Switch
                  checked={display.showId}
                  size="small"
                  onChange={(checked) => onDisplayChange({ showId: checked })}
                />
              </OptionRow>
              {/* The reference lists "Due date" as a display property; the
                  task schema has no due-date field to render. */}
              <OptionRow label={t('teams.triageDueDate')}>
                <Tooltip title={t('teams.triageUnsupported')}>
                  <Switch disabled checked={false} size="small" />
                </Tooltip>
              </OptionRow>
              <Flexbox horizontal justify="flex-end">
                <Button size="small" type="text" onClick={onResetDisplay}>
                  {t('myWork.filtersReset')}
                </Button>
              </Flexbox>
            </Flexbox>
          }
        >
          <ActionIcon
            aria-label={t('savedViews.displayOptions')}
            icon={Settings2Icon}
            size="small"
            title={t('savedViews.displayOptions')}
          />
        </Popover>
      </Flexbox>
    );
  },
);

TeamTriageControls.displayName = 'TeamTriageControls';

export default TeamTriageControls;
