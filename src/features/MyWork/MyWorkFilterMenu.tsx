'use client';

import { Flexbox, Icon, Input } from '@lobehub/ui';
import { ActionIcon, Button, Checkbox, Popover, Text } from '@lobehub/ui/base-ui';
import type { WorkQueryField } from '@orvilo/types';
import { workQueryFieldSpec } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import type { ParseKeys } from 'i18next';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  FilterIcon,
  InboxIcon,
  RepeatIcon,
  SignalIcon,
  SlidersHorizontalIcon,
  SquarePenIcon,
  TagIcon,
  UserRoundCheckIcon,
  UsersIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import {
  STATUS_PROPERTY_ICON,
  type StatusVisual,
  TASK_STATUS_VISUALS,
  WORKFLOW_CATEGORY_VISUALS,
} from '@/components/ExecutionStatus';
import { PriorityIcon } from '@/components/PriorityIcon';
import { resolveLabelColor } from '@/features/Labels/labelColor';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import WorkQueryFilterBuilder from '@/features/SavedViews/WorkQueryFilterBuilder';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useClientDataSWR } from '@/libs/swr';
import { taskLabelKeys } from '@/libs/swr/keys';
import { taskLabelService } from '@/services/taskLabel';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import {
  clearMyWorkDirectoryField,
  MY_WORK_FILTER_DIRECTORY_FIELDS,
  myWorkDirectoryFieldActive,
  myWorkDirectoryNullaryActive,
  myWorkDirectorySelectedValues,
  toggleMyWorkDirectoryEnum,
  toggleMyWorkDirectoryNullary,
  toggleMyWorkDirectoryValue,
} from './myWorkFilters';

const styles = createStaticStyles(({ css }) => ({
  backButton: css`
    flex: none;
  `,
  directoryPane: css`
    width: min(280px, calc(100vw - 32px));
    padding: 8px;
  `,
  builderPane: css`
    width: min(460px, calc(100vw - 32px));
    padding: 12px;
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
  menuRowLabel: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  menuRowIcon: css`
    flex: none;
    color: ${cssVar.colorTextSecondary};
  `,
  checkIcon: css`
    flex: none;
    color: ${cssVar.colorPrimary};
  `,
  paneHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;

    min-height: 28px;
    padding-inline: 4px;
  `,
  labelDot: css`
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  `,
  searchInput: css`
    margin-block-end: 4px;
  `,
  sectionDivider: css`
    margin-block: 4px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

/** Field glyphs for the directory rows — mirrors Linear's per-field icons. */
const DIRECTORY_FIELD_ICONS: Partial<Record<WorkQueryField, StatusVisual['icon']>> = {
  assigneeUserId: CircleUserRoundIcon,
  createdByUserId: SquarePenIcon,
  cycleId: RepeatIcon,
  labelId: TagIcon,
  priority: SignalIcon,
  projectId: PROJECT_ENTITY_ICON,
  reviewerUserId: UserRoundCheckIcon,
  status: STATUS_PROPERTY_ICON,
  teamId: UsersIcon,
  triageStatus: InboxIcon,
  workflowCategory: WorkflowIcon,
};

type FilterPane = { kind: 'builder' } | { field: WorkQueryField; kind: 'field' } | { kind: 'menu' };

const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return 'ref' in a && 'ref' in b && (a as { ref: string }).ref === (b as { ref: string }).ref;
  }
  return false;
};

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

interface DirectoryValueRow {
  checked: boolean;
  icon?: ReactNode;
  key: string;
  label: string;
  onClick: () => void;
}

/**
 * Second pane of Linear's "Add filter" directory: the field's value list.
 * Enum fields multi-select into one `in` predicate (single `eq` for the
 * numeric priority set — the wire `in` only accepts strings); user/team/
 * project fields single-select `eq`; nullary rows appear when the spec
 * allows `isNull`/`isNotNull`. Renders only while its popover is open, so
 * the lists compute inline.
 */
const DirectoryFieldPane = memo<{
  builder: BuilderState;
  field: WorkQueryField;
  onBuilderChange: (builder: BuilderState) => void;
  projects: { id: string; name: string }[];
  teamOptions: { id: string; name: string }[];
}>(({ builder, field, onBuilderChange, projects, teamOptions }) => {
  const { t } = useTranslation(['common', 'chat']);
  const spec = workQueryFieldSpec('task', field);
  const memberQuery = useWorkspaceMembersQuery({ enabled: spec?.valueKind === 'user' });
  // Label picker — same registry fetch the filter builder uses (workspace-scoped).
  const workspaceId = useActiveWorkspaceId();
  const isLogin = useUserStore(authSelectors.isLogin);
  const { data: labelsData } = useClientDataSWR(
    spec?.valueKind === 'label' && isLogin ? taskLabelKeys.list(isLogin, workspaceId) : null,
    () => taskLabelService.getLabels(),
  );

  const selected = myWorkDirectorySelectedValues(builder, field);
  const isSelected = (value: unknown) => selected.some((item) => valuesEqual(item, value));

  const valueRows: DirectoryValueRow[] = [];
  const nullaryRows: DirectoryValueRow[] = [];

  if (spec) {
    switch (spec.valueKind) {
      case 'enum': {
        const multi =
          spec.ops.includes('in') &&
          (spec.enumValues ?? []).every((value) => typeof value === 'string');
        for (const value of spec.enumValues ?? []) {
          let icon: ReactNode;
          if (field === 'priority') {
            icon = <PriorityIcon priority={Number(value)} size={14} />;
          } else if (field === 'status') {
            const visual = TASK_STATUS_VISUALS[value as keyof typeof TASK_STATUS_VISUALS];
            if (visual) icon = <Icon color={visual.color} icon={visual.icon} size={14} />;
          } else if (field === 'workflowCategory') {
            const visual =
              WORKFLOW_CATEGORY_VISUALS[value as keyof typeof WORKFLOW_CATEGORY_VISUALS];
            if (visual) icon = <Icon color={visual.color} icon={visual.icon} size={14} />;
          }
          valueRows.push({
            checked: isSelected(value),
            icon,
            key: String(value),
            label: t(`savedViews.values.${field}.${value}` as never, {
              defaultValue: String(value),
            }),
            onClick: () =>
              onBuilderChange(
                multi
                  ? toggleMyWorkDirectoryEnum(builder, field, String(value))
                  : toggleMyWorkDirectoryValue(builder, field, value),
              ),
          });
        }
        break;
      }
      case 'user': {
        const me = { ref: 'currentUser' } as const;
        const options = spec.currentUserOnly
          ? [{ label: t('savedViews.filters.me'), value: me }]
          : [
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
      case 'project': {
        for (const project of projects) {
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
      case 'team': {
        for (const team of teamOptions) {
          valueRows.push({
            checked: isSelected(team.id),
            key: team.id,
            label: team.name || team.id,
            onClick: () => onBuilderChange(toggleMyWorkDirectoryValue(builder, field, team.id)),
          });
        }
        break;
      }
      case 'label': {
        // Label ids are strings and the spec allows `in` — picks collect
        // into one `in` predicate like the enum fields.
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

DirectoryFieldPane.displayName = 'DirectoryFieldPane';

interface MyWorkFilterMenuProps {
  /** Applied extra predicates — paints the Filter icon's active state. */
  activeFilterCount: number;
  builder: BuilderState;
  delegated: boolean;
  /** Advanced builder is only expressible on the saveable modes. */
  filterSupported: boolean;
  noProject: boolean;
  onBuilderChange: (builder: BuilderState) => void;
  onDelegatedChange: (checked: boolean) => void;
  onNoProjectChange: (checked: boolean) => void;
  onResetFilters: () => void;
  /** Project catalog for the `projectId` picker — name resolution only. */
  projects: { id: string; name: string }[];
  /** Joined teams for the `teamId` picker. */
  teamOptions: { id: string; name: string }[];
}

/**
 * Linear's "Add filter" chrome: a searchable field directory that opens a
 * per-field value picker, plus the existing predicate builder behind
 * "Advanced filter". The noProject/delegated chips keep their URL flags at
 * the menu root; nothing here invents a predicate the work-query spec
 * cannot express.
 */
const MyWorkFilterMenu = memo<MyWorkFilterMenuProps>(
  ({
    activeFilterCount,
    builder,
    delegated,
    filterSupported,
    noProject,
    onBuilderChange,
    onDelegatedChange,
    onNoProjectChange,
    onResetFilters,
    projects,
    teamOptions,
  }) => {
    const { t } = useTranslation('common');
    const [open, setOpen] = useState(false);
    const [pane, setPane] = useState<FilterPane>({ kind: 'menu' });
    const [keyword, setKeyword] = useState('');

    // Closing the popover returns it to the directory root for the next open.
    useEffect(() => {
      if (!open) {
        setPane({ kind: 'menu' });
        setKeyword('');
      }
    }, [open]);

    const directoryFields = useMemo(() => {
      const needle = keyword.trim().toLowerCase();
      return MY_WORK_FILTER_DIRECTORY_FIELDS.map((field) => ({
        active: myWorkDirectoryFieldActive(builder, field),
        field,
        icon: DIRECTORY_FIELD_ICONS[field],
        label: t(`savedViews.fields.${field}` as ParseKeys<'common'>, { defaultValue: field }),
      })).filter((entry) => !needle || entry.label.toLowerCase().includes(needle));
    }, [builder, keyword, t]);

    const content =
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
          <DirectoryFieldPane
            builder={builder}
            field={pane.field}
            projects={projects}
            teamOptions={teamOptions}
            onBuilderChange={onBuilderChange}
          />
        </Flexbox>
      ) : (
        <Flexbox className={styles.directoryPane} gap={2}>
          {filterSupported ? (
            <>
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
              <div className={styles.sectionDivider} />
            </>
          ) : (
            <Text fontSize={12} type="secondary">
              {t('myWork.filterUnsupported')}
            </Text>
          )}
          <Flexbox gap={2} style={{ paddingInline: 8 }}>
            <Checkbox checked={noProject} onChange={onNoProjectChange}>
              {t('myWork.noProject')}
            </Checkbox>
            <Checkbox checked={delegated} onChange={onDelegatedChange}>
              {t('myWork.delegated')}
            </Checkbox>
          </Flexbox>
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
      <Popover
        content={content}
        open={open}
        placement="bottomRight"
        trigger="click"
        onOpenChange={setOpen}
      >
        <ActionIcon
          active={activeFilterCount > 0 || noProject || delegated}
          aria-label={t('myWork.addFilter')}
          icon={FilterIcon}
          size="small"
          title={t('myWork.addFilter')}
        />
      </Popover>
    );
  },
);

MyWorkFilterMenu.displayName = 'MyWorkFilterMenu';

export default MyWorkFilterMenu;
