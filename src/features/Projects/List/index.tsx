'use client';

import { Center, ContextMenuTrigger, Empty, Flexbox, Icon, Input, SearchBar } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  confirmModal,
  type DropdownItem,
  DropdownMenu,
  Popover,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { ProjectHealth } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PlusIcon,
  SearchXIcon,
  TrashIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { getProjectActivityPath } from '@/features/Projects/Layout/navigation';
import { NoLeadIcon } from '@/features/Projects/List/NoLeadIcon';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { PROJECT_ENTITY_ICON, ProjectIcon } from '@/features/Projects/ProjectIcon';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import NewViewModal from '@/features/SavedViews/NewViewModal';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import type { ProjectListItem } from '@/store/project/store';
import { useUserStore } from '@/store/user';
import { labPreferSelectors, userProfileSelectors } from '@/store/user/selectors';

import AddFilterPopover from './AddFilterPopover';
import { projectListSummaryRows, summarizeProjectList } from './aggregateSummary';
import {
  DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS,
  filterClosedProjects,
  groupProjectList,
  nextSortFromHeader,
  normalizeProjectListDisplayOptions,
  type ProjectListColumn,
  type ProjectListDisplayOptions,
  projectListGridTemplate,
  type ProjectListSortableOrdering,
  sortProjectList,
  visibleProjectListColumns,
} from './displayOptions';
import DisplayOptionsPopover from './DisplayOptionsPopover';
import ProjectListFilterChips from './FilterChips';
import {
  filterProjectList,
  type ProjectListFilter,
  readProjectListFilters,
  removeProjectListFilter,
  writeProjectListFilters,
} from './listFilters';
import ProjectMilestoneChip from './MilestoneChip';
import ProjectBoard from './ProjectBoard';
import ProjectListAggregateSidebar from './ProjectListAggregateSidebar';
import ProjectTimeline from './ProjectTimeline';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actions: css`
    position: relative;
    z-index: 1;

    flex: none;

    opacity: 0;

    transition: opacity ${cssVar.motionDurationFast};

    @media (hover: none) {
      opacity: 1;
    }
  `,
  cell: css`
    flex: none;

    min-width: 0;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  /**
   * The health cell is its own navigation target (the latest-update surface /
   * write-update flow), so it floats above the row's stretched link like the
   * lead trigger does.
   */
  healthCell: css`
    cursor: pointer;

    position: relative;
    z-index: 1;

    display: flex;
    gap: 6px;
    align-items: center;
    align-self: stretch;

    width: 100%;

    text-decoration: none;

    &:hover,
    &:focus-visible {
      color: ${cssVar.colorText};
    }
  `,
  columns: css`
    display: grid;
    gap: 12px;
    align-items: center;
  `,
  groupHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  headerRow: css`
    padding-block: 4px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    font-weight: 450;
    color: ${cssVar.colorTextTertiary};
  `,
  identifier: css`
    flex: none;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextQuaternary};
  `,
  link: css`
    position: absolute;
    inset: 0;
    border-radius: inherit;
    color: inherit;
  `,
  leadEmpty: css`
    opacity: 0;

    &:focus-visible {
      opacity: 1;
    }

    @media (hover: none) {
      opacity: 1;
    }
  `,
  leadOpen: css`
    opacity: 1;
  `,
  leadOption: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    min-height: 32px;
    padding-inline: 8px;
    border: 0;
    border-radius: 4px;

    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover,
    &:focus-visible {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  leadPopover: css`
    overflow: auto;
    width: 240px;
    max-height: 320px;
    padding: 4px;
  `,
  leadTrigger: css`
    cursor: pointer;

    position: relative;
    z-index: 1;

    display: inline-flex;
    gap: 8px;
    align-items: center;

    min-width: 28px;
    max-width: 100%;
    height: 28px;
    padding-block: 0;
    padding-inline: 4px;
    border: 0;
    border-radius: 4px;

    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover,
    &:focus-visible {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  nameCell: css`
    flex: 1;
    min-width: 0;
  `,
  owner: css`
    display: flex;
    flex: none;
    align-items: center;
    min-width: 0;
  `,
  row: css`
    position: relative;

    min-height: 48px;
    padding-block: 7px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    color: inherit;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:hover .project-row-actions,
    &:focus-within .project-row-actions {
      opacity: 1;
    }

    &:hover .project-lead-empty,
    &:focus-within .project-lead-empty {
      opacity: 1;
    }
  `,
  progressFill: css`
    display: block;
    height: 100%;
    border-radius: inherit;
    background: ${cssVar.colorTextSecondary};
  `,
  progressTrack: css`
    overflow: hidden;
    flex: 1;

    min-width: 20px;
    height: 3px;
    border-radius: 2px;

    background: ${cssVar.colorFillSecondary};
  `,
  screenReaderOnly: css`
    position: absolute;

    overflow: hidden;

    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;

    white-space: nowrap;

    clip-path: inset(50%);
  `,
  sortHeader: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    padding: 0;
    border: 0;

    font: inherit;
    color: inherit;
    text-align: start;

    background: transparent;

    &:hover,
    &:focus-visible {
      color: ${cssVar.colorText};
    }
  `,
  sortHeaderActive: css`
    color: ${cssVar.colorText};
  `,
}));

/**
 * Grid/row chrome for the projects table. Also imported by the team-scoped
 * projects tab (WorkTeams/TeamProjectsSurface) so both surfaces render the
 * reference's identical column geometry — one presentation, not two tables.
 */
export const projectListStyles = styles;

const PROJECT_PRIORITY_LABEL_KEY = {
  0: 'create.priority.noPriority',
  1: 'create.priority.urgent',
  2: 'create.priority.high',
  3: 'create.priority.normal',
  4: 'create.priority.low',
} as const;

/**
 * Reference §health: the cell is the latest-update affordance — a filled
 * health dot + label when a project update exists, the dashed circle +
 * "No updates" hint when none does. The row payload carries only the
 * denormalized `project.health` (no update body/date), so instead of faking
 * an excerpt the whole cell navigates to the project's update surface;
 * with no update it lands in write-update mode ("Click to write update.").
 */
const ProjectHealthCell = memo<{ project: ProjectListItem }>(({ project }) => {
  const { t } = useTranslation('project');
  const health: null | ProjectHealth =
    project.health && project.health in PROJECT_HEALTH_META ? project.health : null;
  return (
    <WorkspaceLink
      className={cx(styles.cell, styles.healthCell)}
      state={health ? undefined : { projectUpdate: true }}
      title={health ? undefined : t('list.health.noUpdatesHint')}
      to={getProjectActivityPath(project.slug ?? project.id)}
    >
      <ProjectHealthIcon health={health} size={14} />
      <Text fontSize={12}>
        {health
          ? t(PROJECT_HEALTH_META[health].key, { defaultValue: health })
          : t('list.health.noUpdates')}
      </Text>
    </WorkspaceLink>
  );
});

ProjectHealthCell.displayName = 'ProjectHealthCell';

export type MembersQuery = ReturnType<typeof useWorkspaceMembersQuery>;

const ProjectLeadCell = memo<{ members: MembersQuery; project: ProjectListItem }>(
  ({ members, project }) => {
    const { t } = useTranslation('project');
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [saving, setSaving] = useState(false);
    const updateProject = useProjectStore((s) => s.updateProject);
    const lead = members.data?.find((member) => member.userId === project.leadUserId);
    const leadName =
      lead?.user?.fullName || lead?.user?.username || project.leadUserId || undefined;
    const availableMembers = useMemo(() => {
      if (!open) return [];
      const normalizedKeyword = keyword.trim().toLocaleLowerCase();
      return (members.data ?? [])
        .filter((member) => {
          if (member.deletedAt || member.suspendedAt) return false;
          const name = member.user?.fullName || member.user?.username || member.userId;
          return name.toLocaleLowerCase().includes(normalizedKeyword);
        })
        .sort((a, b) => {
          const nameA = a.user?.fullName || a.user?.username || a.userId;
          const nameB = b.user?.fullName || b.user?.username || b.userId;
          return nameA.toLocaleLowerCase().localeCompare(nameB.toLocaleLowerCase());
        });
    }, [keyword, members.data, open]);

    const saveLead = async (leadUserId: string | null) => {
      if (saving || leadUserId === project.leadUserId) {
        setOpen(false);
        return;
      }
      setSaving(true);
      try {
        await updateProject(project.id, { leadUserId });
        setOpen(false);
      } catch (error) {
        console.error('Failed to update project lead', error);
        toast.error(t('properties.saveError'));
      } finally {
        setSaving(false);
      }
    };

    return (
      <Popover
        open={open}
        placement="bottomLeft"
        trigger="click"
        content={
          <Flexbox
            className={styles.leadPopover}
            gap={4}
            onClick={(event) => event.stopPropagation()}
          >
            <Input
              autoFocus
              aria-label={t('list.lead.search')}
              placeholder={t('list.lead.search')}
              size="small"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <button
              className={styles.leadOption}
              disabled={saving}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void saveLead(null);
              }}
            >
              <NoLeadIcon />
              {t('properties.noLead')}
            </button>
            {members.isLoading ? (
              <Text fontSize={12} type="secondary">
                {t('list.lead.loading')}
              </Text>
            ) : members.error ? (
              <AsyncError error={members.error} variant="inline" onRetry={() => members.mutate()} />
            ) : availableMembers.length === 0 ? (
              <Text fontSize={12} type="secondary">
                {t('list.lead.noMatches')}
              </Text>
            ) : (
              availableMembers.map((member) => {
                const name = member.user?.fullName || member.user?.username || member.userId;
                return (
                  <button
                    className={styles.leadOption}
                    disabled={saving}
                    key={member.userId}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void saveLead(member.userId);
                    }}
                  >
                    <Avatar avatar={member.user?.avatar ?? undefined} name={name} size={18} />
                    {name}
                  </button>
                );
              })
            )}
          </Flexbox>
        }
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setKeyword('');
        }}
      >
        <button
          aria-label={leadName ? `${t('properties.lead')}: ${leadName}` : t('properties.noLead')}
          className={`${styles.leadTrigger} ${!project.leadUserId ? `${styles.leadEmpty} project-lead-empty` : ''} ${open ? styles.leadOpen : ''}`}
          disabled={saving}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {project.leadUserId ? (
            <>
              <Avatar
                avatar={lead?.user?.avatar ?? undefined}
                name={leadName}
                shape="circle"
                size={20}
                title={leadName}
              />
              <Text ellipsis fontSize={12}>
                {leadName}
              </Text>
            </>
          ) : (
            <NoLeadIcon />
          )}
        </button>
      </Popover>
    );
  },
);

ProjectLeadCell.displayName = 'ProjectLeadCell';

// `lll` needs the localizedFormat plugin, which src/initialize.ts does not
// register — spell the same shape out in core tokens instead.
const DateCell = memo<{ value: Date | null | string | undefined }>(({ value }) => (
  <Text
    className={styles.cell}
    fontSize={12}
    title={value ? dayjs(value).format('MMM D, YYYY h:mm A') : undefined}
  >
    {value ? dayjs(value).format('MMM D') : '—'}
  </Text>
));

DateCell.displayName = 'DateCell';

interface ProjectRowProps {
  columns: ProjectListColumn[];
  members: MembersQuery;
  project: ProjectListItem;
  properties: ProjectListDisplayOptions['properties'];
}

export const ProjectRow = memo<ProjectRowProps>(({ columns, members, project, properties }) => {
  const { t } = useTranslation(['project', 'common']);
  const [deleting, setDeleting] = useState(false);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const canDelete = currentUserId === project.userId;
  const priority = resolvePriorityLevel(project.priority);
  const status = resolveProjectStatus(project.status);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success(t('list.deleteSuccess', { name: project.name }));
    } catch (error) {
      console.error('Failed to delete project', error);
      toast.error(t('list.deleteError'));
      setDeleting(false);
    }
  };

  const menuItems: DropdownItem[] = [
    {
      danger: true,
      icon: <Icon icon={TrashIcon} />,
      key: 'delete',
      label: t('list.deleteAction'),
      onClick: () => {
        confirmModal({
          cancelText: t('cancel', { ns: 'common' }),
          content: t('list.deleteConfirmDescription', { name: project.name }),
          okButtonProps: { danger: true },
          okText: t('delete', { ns: 'common' }),
          onOk: () => void handleDelete(),
          title: t('list.deleteConfirmTitle'),
        });
      },
    },
  ];

  const cellFor = (column: ProjectListColumn): ReactNode => {
    switch (column.key) {
      case 'health': {
        return <ProjectHealthCell project={project} />;
      }
      case 'priority': {
        return (
          <span className={styles.cell} title={t(PROJECT_PRIORITY_LABEL_KEY[priority])}>
            <PriorityIcon
              aria-label={t(PROJECT_PRIORITY_LABEL_KEY[priority])}
              priority={priority}
              role="img"
              size={16}
            />
          </span>
        );
      }
      case 'lead': {
        return <ProjectLeadCell members={members} project={project} />;
      }
      case 'summary': {
        return (
          <Text ellipsis className={styles.cell} fontSize={12} title={project.summary ?? undefined}>
            {project.summary || '—'}
          </Text>
        );
      }
      case 'startDate': {
        return <DateCell value={project.startDate} />;
      }
      case 'targetDate': {
        return <DateCell value={project.targetDate} />;
      }
      case 'issues': {
        return (
          <Text className={styles.cell} fontSize={12}>
            {typeof project.taskCount === 'number' ? project.taskCount : '—'}
          </Text>
        );
      }
      case 'created': {
        return <DateCell value={project.createdAt} />;
      }
      case 'updated': {
        return <DateCell value={project.updatedAt} />;
      }
      case 'completed': {
        return <DateCell value={project.completedAt} />;
      }
      case 'status': {
        // Reference §5: status icon + percentage + a thin progress bar.
        const percent =
          typeof project.progressPercent === 'number'
            ? Math.min(100, Math.max(0, project.progressPercent))
            : null;
        return (
          <Flexbox horizontal align={'center'} className={styles.cell} gap={6}>
            <span className={styles.screenReaderOnly}>{t(`status.${status}`)}</span>
            <ProjectStatusIcon percent={percent ?? 0} size={14} status={status} />
            <Text fontSize={12}>{percent == null ? '—' : `${percent}%`}</Text>
            {percent == null ? null : (
              <span aria-hidden className={styles.progressTrack}>
                <span className={styles.progressFill} style={{ width: `${percent}%` }} />
              </span>
            )}
          </Flexbox>
        );
      }
    }
  };

  const row = (
    <Flexbox
      horizontal
      align={'center'}
      className={`${styles.row} ${styles.columns}`}
      gap={0}
      style={projectListGridTemplate(columns)}
    >
      <WorkspaceLink
        aria-label={project.name}
        className={styles.link}
        to={`/project/${project.slug ?? project.id}`}
      />
      <Flexbox horizontal align={'center'} className={styles.nameCell} gap={10}>
        {project.avatar && project.avatar !== '📦' ? (
          <Avatar avatar={project.avatar} name={project.name} shape={'square'} size={18} />
        ) : (
          <ProjectIcon color={cssVar.colorTextTertiary} size={16} />
        )}
        {properties.id ? (
          <Text className={styles.identifier} fontSize={11}>
            {project.identifier}
          </Text>
        ) : null}
        <Text ellipsis fontSize={13} weight={500}>
          {project.name}
        </Text>
        {properties.milestones ? <ProjectMilestoneChip projectId={project.id} /> : null}
      </Flexbox>
      {columns.map((column) => (
        <span className={styles.owner} key={column.key}>
          {cellFor(column)}
        </span>
      ))}
      {canDelete && (
        <span className={`${styles.actions} project-row-actions`}>
          <DropdownMenu items={menuItems} placement={'bottomRight'}>
            <ActionIcon
              aria-label={t('list.moreActions')}
              icon={MoreHorizontalIcon}
              loading={deleting}
              size={'small'}
            />
          </DropdownMenu>
        </span>
      )}
    </Flexbox>
  );

  return canDelete ? <ContextMenuTrigger items={menuItems}>{row}</ContextMenuTrigger> : row;
});

ProjectRow.displayName = 'ProjectRow';

export const COLUMN_HEADER_KEYS = {
  completed: 'list.columnCompleted',
  created: 'list.columnCreated',
  health: 'list.columnHealth',
  issues: 'list.columnIssues',
  lead: 'list.columnLead',
  priority: 'list.columnPriority',
  startDate: 'list.columnStart',
  status: 'list.columnStatus',
  summary: 'list.display.property.summary',
  targetDate: 'list.columnTarget',
  updated: 'list.columnUpdated',
} as const satisfies Record<ProjectListColumn['key'], string>;

/**
 * Sortable column header — the reference's Name/Health/Priority/Target
 * date/Status headers are buttons that set the ordering (and flip its
 * direction on a repeat click).
 */
export const SortableHeader = memo<{
  label: string;
  onSort: (field: ProjectListSortableOrdering) => void;
  orderBy: ProjectListDisplayOptions['orderBy'];
  orderDirection: 'asc' | 'desc';
  sortBy?: ProjectListSortableOrdering;
}>(({ label, onSort, orderBy, orderDirection, sortBy }) => {
  if (!sortBy) {
    return (
      <Text fontSize={12} type={'secondary'}>
        {label}
      </Text>
    );
  }
  const active = orderBy === sortBy;
  return (
    <button
      className={cx(styles.sortHeader, active && styles.sortHeaderActive)}
      type="button"
      onClick={() => onSort(sortBy)}
    >
      {label}
      {active ? (
        <Icon aria-hidden icon={orderDirection === 'asc' ? ArrowUpIcon : ArrowDownIcon} size={12} />
      ) : null}
    </button>
  );
});

SortableHeader.displayName = 'SortableHeader';

/**
 * Column header row for the projects table — shared verbatim with the
 * team-scoped projects tab (WorkTeams/TeamProjectsSurface) so both surfaces
 * render the reference's identical grid geometry and sortable headers.
 */
export const ProjectListTableHeader = memo<{
  columns: ProjectListColumn[];
  onSort: (field: ProjectListSortableOrdering) => void;
  orderBy: ProjectListDisplayOptions['orderBy'];
  orderDirection: 'asc' | 'desc';
}>(({ columns, onSort, orderBy, orderDirection }) => {
  const { t } = useTranslation('project');
  return (
    <Flexbox
      horizontal
      align={'center'}
      className={`${styles.headerRow} ${styles.columns}`}
      gap={0}
      style={projectListGridTemplate(columns)}
    >
      <Flexbox horizontal align={'center'} className={styles.nameCell} gap={10}>
        <SortableHeader
          label={t('list.columnName', { defaultValue: 'Name' })}
          orderBy={orderBy}
          orderDirection={orderDirection}
          sortBy="name"
          onSort={onSort}
        />
      </Flexbox>
      {columns.map((column) => (
        <span className={styles.owner} key={column.key}>
          <SortableHeader
            label={t(COLUMN_HEADER_KEYS[column.key])}
            orderBy={orderBy}
            orderDirection={orderDirection}
            sortBy={column.sortBy}
            onSort={onSort}
          />
        </span>
      ))}
    </Flexbox>
  );
});

ProjectListTableHeader.displayName = 'ProjectListTableHeader';

/**
 * Inner content of a project group strip — `status:*` renders the lifecycle
 * icon + label, `lead:*` the lead avatar + name ("No lead" for the empty
 * bucket). Shared with the team-scoped projects tab; `all` renders nothing.
 */
export const ProjectListGroupHeader = memo<{
  groupKey: string;
  leadAvatar: (userId: string) => string | undefined;
  leadName: (userId: string) => string | undefined;
}>(({ groupKey, leadAvatar, leadName }) => {
  const { t } = useTranslation('project');
  if (groupKey === 'all') return null;
  if (groupKey.startsWith('status:')) {
    const status = resolveProjectStatus(groupKey.slice(7));
    return (
      <>
        <ProjectStatusIcon size={14} status={status} />
        <Text fontSize={12} weight={500}>
          {t(`status.${status}`)}
        </Text>
      </>
    );
  }
  const userId = groupKey.slice(5);
  if (userId === 'none') {
    return (
      <>
        <NoLeadIcon />
        <Text fontSize={12} type="secondary" weight={500}>
          {t('properties.noLead')}
        </Text>
      </>
    );
  }
  const name = leadName(userId);
  return (
    <>
      <Avatar avatar={leadAvatar(userId)} name={name} shape="circle" size={16} />
      <Text fontSize={12} weight={500}>
        {name}
      </Text>
    </>
  );
});

ProjectListGroupHeader.displayName = 'ProjectListGroupHeader';

const ProjectListPage = memo(() => {
  const { t } = useTranslation('project');
  const [keyword, setKeyword] = useState('');
  const enabled = useUserStore(labPreferSelectors.enableProjects);
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(enabled);
  const {
    data: membersData,
    error: membersError,
    isLoading: membersLoading,
    mutate: revalidateMembers,
  } = useWorkspaceMembersQuery({ enabled });
  // The hook returns a fresh object each render; rebuild a stable one so the
  // memoized rows below skip unrelated re-renders (e.g. search keystrokes).
  const members = useMemo<MembersQuery>(
    () => ({
      data: membersData,
      error: membersError,
      isLoading: membersLoading,
      members: membersData,
      mutate: revalidateMembers,
    }),
    [membersData, membersError, membersLoading, revalidateMembers],
  );

  // Display options persist in SystemStatus (personal scope) — the minimal
  // chain for a built-in page with no saved_views row. See displayOptions.ts.
  const rawOptions = useGlobalStore(systemStatusSelectors.projectListViewOptions);
  const options = useMemo(() => normalizeProjectListDisplayOptions(rawOptions), [rawOptions]);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const updateOptions = useCallback(
    (patch: Partial<ProjectListDisplayOptions>) =>
      updateSystemStatus(
        { projectListViewOptions: { ...options, ...patch } },
        'updateProjectListViewOptions',
      ),
    [options, updateSystemStatus],
  );
  const resetOptions = useCallback(
    () =>
      updateSystemStatus(
        { projectListViewOptions: DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS },
        'resetProjectListViewOptions',
      ),
    [updateSystemStatus],
  );

  const memberName = useCallback(
    (userId: string) => {
      const member = membersData?.find((item) => item.userId === userId);
      return member?.user?.fullName || member?.user?.username || userId;
    },
    [membersData],
  );
  const memberAvatar = useCallback(
    (userId: string) =>
      membersData?.find((item) => item.userId === userId)?.user?.avatar ?? undefined,
    [membersData],
  );

  // Applied property filters live in the URL — Linear reflects applied
  // filters there (shareable filtered lists), and MyWork carries its chips
  // the same way. They compose with (never replace) the persisted display
  // options: filters narrow the set, ordering sorts what survives.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readProjectListFilters(searchParams), [searchParams]);
  const updateFilters = useCallback(
    (next: ProjectListFilter[]) =>
      setSearchParams(writeProjectListFilters(searchParams, next), { replace: true }),
    [searchParams, setSearchParams],
  );
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const projectName = useCallback(
    (id: string) => projects.find((project) => project.id === id)?.name ?? id,
    [projects],
  );

  const columns = useMemo(
    () => visibleProjectListColumns(options.properties),
    [options.properties],
  );
  const visibleProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    const searched = normalizedKeyword
      ? projects.filter((project) =>
          [project.name, project.identifier, project.description]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(normalizedKeyword)),
        )
      : projects;
    const filtered = filterProjectList(searched, filters);
    const open = filterClosedProjects(filtered, options.showClosed);
    return sortProjectList(open, options.orderBy, options.orderDirection);
  }, [filters, keyword, options.orderBy, options.orderDirection, options.showClosed, projects]);

  // Board layout always groups by status (the reference's project board is a
  // status kanban); the list layout honors the Grouping option.
  const groups = useMemo(
    () =>
      groupProjectList(
        visibleProjects,
        options.layout === 'board' ? 'status' : options.grouping,
        memberName,
      ),
    [memberName, options.grouping, options.layout, visibleProjects],
  );

  // Aggregate sidebar — the reference's Health/Teams/Leads tab panel.
  // Buckets double as one-click filters and count the full loaded set minus
  // what the closed-window option hides (those rows can never render), so
  // they stay stable while a bucket filter narrows the table; shared with
  // the team projects tab.
  const summaryRows = useMemo(
    () => projectListSummaryRows(projects, options.showClosed),
    [options.showClosed, projects],
  );
  const summary = useMemo(
    () => summarizeProjectList(summaryRows, memberName),
    [memberName, summaryRows],
  );
  const summaryRowIds = useMemo(() => summaryRows.map((project) => project.id), [summaryRows]);

  const handleHeaderSort = useCallback(
    (field: ProjectListSortableOrdering) => updateOptions(nextSortFromHeader(options, field)),
    [options, updateOptions],
  );

  if (!enabled) return <ProjectDisabled />;

  const groupHeader = (groupKey: string): ReactNode => (
    <ProjectListGroupHeader groupKey={groupKey} leadAvatar={memberAvatar} leadName={memberName} />
  );

  return (
    <WorkSurface>
      <NavHeader
        left={<Text weight={500}>{t('list.title')}</Text>}
        right={
          <Button
            icon={PlusIcon}
            shape={'round'}
            size={'small'}
            type="primary"
            onClick={() => openCreateProjectModal()}
          >
            {t('create.action')}
          </Button>
        }
      />
      {/* The reference's sidebar is a floating panel over the rows — never a
          flex sibling — so the toolbar owns a full-width row and the panel
          overlays only the collection region below it. */}
      <Flexbox flex={1} style={{ minHeight: 0 }}>
        <WorkSurfaceToolbar
          asideLabel={t('list.toolbarControls')}
          aside={
            <>
              <AddFilterPopover
                currentUserId={currentUserId}
                filters={filters}
                members={membersData}
                membersError={membersError}
                membersLoading={membersLoading}
                projects={projects}
                onChange={updateFilters}
                onOpenAdvanced={() => setAdvancedFilterOpen(true)}
              />
              <DisplayOptionsPopover
                options={options}
                onChange={updateOptions}
                onReset={resetOptions}
              />
              {/* Icon-only disclosure toggle — the reference's 28px panel
                  button: name flips Open↔Close, aria-expanded tracks state. */}
              <ActionIcon
                active={sidebarOpen}
                aria-expanded={sidebarOpen}
                aria-label={sidebarOpen ? t('list.sidebar.close') : t('list.sidebar.open')}
                icon={PanelRightIcon}
                size="small"
                title={sidebarOpen ? t('list.sidebar.close') : t('list.sidebar.open')}
                onClick={() => setSidebarOpen((open) => !open)}
              />
            </>
          }
        >
          <SearchBar
            allowClear
            placeholder={t('list.searchPlaceholder')}
            style={{ maxWidth: 280 }}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <ProjectListFilterChips
            filters={filters}
            memberName={memberName}
            projectName={projectName}
            onClearAll={() => updateFilters([])}
            onRemove={(key) => updateFilters(removeProjectListFilter(filters, key))}
          />
        </WorkSurfaceToolbar>
        <Flexbox flex={1} style={{ minHeight: 0, position: 'relative' }}>
          <WorkSurfaceCollection>
            {error ? (
              <AsyncError error={error} onRetry={() => mutate()} />
            ) : isLoading && projects.length === 0 ? (
              <SkeletonList rows={8} />
            ) : visibleProjects.length === 0 ? (
              <Center flex={1} padding={48}>
                <Empty
                  icon={keyword.trim() || filters.length > 0 ? SearchXIcon : PROJECT_ENTITY_ICON}
                  description={
                    filters.length > 0
                      ? t('list.filter.noResults')
                      : keyword.trim()
                        ? t('list.searchEmpty')
                        : t('list.emptyDescription')
                  }
                />
              </Center>
            ) : options.layout === 'board' ? (
              <ProjectBoard
                groups={groups}
                leadAvatar={memberAvatar}
                leadName={memberName}
                properties={options.properties}
              />
            ) : options.layout === 'timeline' ? (
              <ProjectTimeline
                groupLabel={groupHeader}
                groups={groups}
                leadAvatar={memberAvatar}
                leadName={memberName}
                options={options}
              />
            ) : (
              <Flexbox gap={0} style={{ minWidth: 'max-content' }}>
                <ProjectListTableHeader
                  columns={columns}
                  orderBy={options.orderBy}
                  orderDirection={options.orderDirection}
                  onSort={handleHeaderSort}
                />
                {groups.map((group) => (
                  <Flexbox gap={0} key={group.key}>
                    {group.key !== 'all' ? (
                      <div className={styles.groupHeader}>
                        {groupHeader(group.key)}
                        <Text fontSize={12} type="secondary">
                          {group.items.length}
                        </Text>
                      </div>
                    ) : null}
                    {group.items.map((project) => (
                      <ProjectRow
                        columns={columns}
                        key={project.id}
                        members={members}
                        project={project}
                        properties={options.properties}
                      />
                    ))}
                  </Flexbox>
                ))}
              </Flexbox>
            )}
          </WorkSurfaceCollection>
          {sidebarOpen ? (
            <ProjectListAggregateSidebar
              filters={filters}
              memberAvatar={memberAvatar}
              memberName={memberName}
              rowIds={summaryRowIds}
              summary={summary}
              onFilters={updateFilters}
            />
          ) : null}
        </Flexbox>
      </Flexbox>
      {/* "Advanced filter" lands here: the WorkQuery builder (AND/OR groups)
          exists only for saved views, so the menu entry opens the real
          project-entity view builder instead of a fake inline clause row. */}
      <NewViewModal
        defaultEntityType="project"
        open={advancedFilterOpen}
        onClose={() => setAdvancedFilterOpen(false)}
      />
    </WorkSurface>
  );
});

ProjectListPage.displayName = 'ProjectListPage';

export default ProjectListPage;
