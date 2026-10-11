'use client';

import type { ProjectHealth } from '@orvilo/types';
import { cn } from 'cn';
import dayjs from 'dayjs';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Layers2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchXIcon,
  TrashIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { type DropdownItem } from '@/components/ItemsMenu';
import { ContextMenuTrigger } from '@/components/ItemsMenu';
import { confirmModal } from '@/components/Modal';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import NavHeader from '@/features/NavHeader';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { getProjectActivityPath } from '@/features/Projects/Layout/navigation';
import { NoLeadIcon } from '@/features/Projects/List/NoLeadIcon';
import { PROJECT_ENTITY_ICON, ProjectIcon } from '@/features/Projects/ProjectIcon';
import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
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
import { userProfileSelectors } from '@/store/user/selectors';

import AddFilterPopover from './AddFilterPopover';
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
import ProjectTimeline from './ProjectTimeline';

const styles = {
  actions:
    'relative z-1 flex-none opacity-0 transition-opacity duration-(--orvilo-motion-fast) [@media(hover:none)]:opacity-100',
  cell: 'min-w-0 flex-none text-xs leading-5 text-muted-foreground whitespace-nowrap',
  healthCell:
    'relative z-1 flex w-full cursor-pointer items-center self-stretch gap-1.5 no-underline hover:text-foreground focus-visible:text-foreground',
  columns: 'grid items-center gap-3',
  groupHeader:
    'flex items-center gap-2 border-be border-divider px-3 py-2 text-xs leading-5 text-muted-foreground',
  headerRow: 'px-3 py-1 text-xs leading-5 font-normal text-muted-foreground',
  identifier: 'flex-none font-mono text-xs leading-5 text-foreground-quaternary',
  link: 'absolute inset-0 rounded-[inherit] text-inherit',
  leadEmpty: 'opacity-0 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
  leadOpen: 'opacity-100',
  leadOption:
    'flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-(--radius-button) border-0 bg-transparent px-2 text-start text-sm leading-5.5 text-foreground hover:bg-accent focus-visible:bg-accent',
  leadPopover: 'max-h-80 w-60 overflow-auto p-1',
  leadTrigger:
    'relative z-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-(--radius-input) border-0 bg-transparent p-0 text-muted-foreground hover:bg-accent focus-visible:bg-accent',
  nameCell: 'min-w-0 flex-1',
  numeric: 'justify-end pe-2 tabular-nums',
  owner: 'flex min-w-0 flex-none items-center',
  row: 'relative min-h-12 px-3 py-1.75 text-inherit hover:bg-accent [&:hover_.project-row-actions]:opacity-100 [&:focus-within_.project-row-actions]:opacity-100 [&:hover_.project-lead-empty]:opacity-100 [&:focus-within_.project-lead-empty]:opacity-100',
  screenReaderOnly: 'sr-only',
  sortHeader:
    'inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-(--radius-button) border-0 bg-transparent p-0 text-start [font:inherit] text-inherit hover:text-foreground focus-visible:text-foreground',
  sortHeaderActive: 'text-foreground',
};

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
      className={cn(styles.cell, styles.healthCell)}
      state={health ? undefined : { projectUpdate: true }}
      title={health ? undefined : t('list.health.noUpdatesHint')}
      to={getProjectActivityPath(project.slug ?? project.id)}
    >
      <ProjectHealthIcon health={health} size={14} />
      <span
        className={cn(
          'text-xs leading-5',
          !health && 'font-medium',
          health ? PROJECT_HEALTH_META[health].textClass : 'text-muted-foreground',
        )}
      >
        {health
          ? t(PROJECT_HEALTH_META[health].key, { defaultValue: health })
          : t('list.health.noUpdates')}
      </span>
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
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setKeyword('');
        }}
      >
        <PopoverTrigger
          render={
            <button
              className={`${styles.leadTrigger} ${!project.leadUserId ? `${styles.leadEmpty} project-lead-empty` : ''} ${open ? styles.leadOpen : ''}`}
              disabled={saving}
              type="button"
              aria-label={
                leadName ? `${t('properties.lead')}: ${leadName}` : t('properties.noLead')
              }
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {project.leadUserId ? (
                <Avatar
                  avatar={lead?.user?.avatar ?? undefined}
                  name={leadName}
                  shape="circle"
                  size={20}
                  title={leadName}
                />
              ) : (
                <NoLeadIcon />
              )}
            </button>
          }
        />
        <PopoverContent align="start" side="bottom">
          {
            <div
              className={cn(cn('flex flex-col', styles.leadPopover), 'gap-1')}

              onClick={(event) => event.stopPropagation()}
            >
              <Input
                autoFocus
                aria-label={t('list.lead.search')}
                placeholder={t('list.lead.search')}
                value={keyword}
                visualSize="compact"
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
                <span className="text-muted-foreground text-xs leading-5">
                  {t('list.lead.loading')}
                </span>
              ) : members.error ? (
                <AsyncError
                  error={members.error}
                  variant="inline"
                  onRetry={() => members.mutate()}
                />
              ) : availableMembers.length === 0 ? (
                <span className="text-muted-foreground text-xs leading-5">
                  {t('list.lead.noMatches')}
                </span>
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
            </div>
          }
        </PopoverContent>
      </Popover>
    );
  },
);

ProjectLeadCell.displayName = 'ProjectLeadCell';

// `lll` needs the localizedFormat plugin, which src/initialize.ts does not
// register — spell the same shape out in core tokens instead.
const DateCell = memo<{ value: Date | null | string | undefined }>(({ value }) => (
  <span
    className={cn(cn('text-sm', styles.cell), 'text-xs leading-5')}

    title={value ? dayjs(value).format('YYYY/MM/DD h:mm A') : undefined}
  >
    {value ? formatProjectDay(value) : '—'}
  </span>
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
      icon: <TrashIcon size={16} />,
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
          <span
            className={cn(cn('text-sm truncate', styles.cell), 'text-xs leading-5')}

            title={project.summary ?? undefined}
          >
            {project.summary || '—'}
          </span>
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
          <span
            className={cn(
              cn('text-sm', styles.cell),
              'text-xs leading-5 font-normal text-foreground',
            )}
          >
            {typeof project.taskCount === 'number' ? project.taskCount : '—'}
          </span>
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
        // Linear: status icon + percentage; no progress bar.
        const percent =
          typeof project.progressPercent === 'number'
            ? Math.min(100, Math.max(0, project.progressPercent))
            : null;
        return (
          <div className={cn(cn('flex flex-row', styles.cell), 'items-center gap-1.5')}>
            <span className={styles.screenReaderOnly}>{t(`status.${status}`)}</span>
            <ProjectStatusIcon percent={percent ?? 0} size={16} status={status} />
            <span className="text-xs leading-5">{percent == null ? '—' : `${percent}%`}</span>
          </div>
        );
      }
    }
  };

  const row = (
    <div
      className={cn('flex flex-row', `${styles.row} ${styles.columns}`)}
      style={projectListGridTemplate(columns)}
    >
      <WorkspaceLink
        aria-label={project.name}
        className={styles.link}
        to={`/project/${project.slug ?? project.id}`}
      />
      <div className={cn(cn('flex flex-row', styles.nameCell), 'items-center gap-2.5')}>
        {project.avatar && project.avatar !== '📦' ? (
          <Avatar avatar={project.avatar} name={project.name} shape={'square'} size={18} />
        ) : (
          <ProjectIcon color="var(--foreground-tertiary)" size={16} />
        )}
        {properties.id ? (
          <span className={cn(cn('text-sm', styles.identifier), 'text-xs leading-5')}>
            {project.identifier}
          </span>
        ) : null}
        <span className="truncate text-sm leading-5.5 font-medium">{project.name}</span>
        {properties.milestones ? <ProjectMilestoneChip projectId={project.id} /> : null}
      </div>
      {columns.map((column) => (
        <span
          className={cn(styles.owner, column.key === 'issues' && styles.numeric)}
          key={column.key}
        >
          {cellFor(column)}
        </span>
      ))}
      {canDelete && (
        <span className={`${styles.actions} project-row-actions`}>
          <DropdownMenu items={menuItems} placement={'bottomRight'}>
            <Button
              aria-busy={deleting}
              aria-label={t('list.moreActions')}
              disabled={deleting}
              size="icon-sm"
              variant="ghost"
            >
              {createElement(MoreHorizontalIcon, { 'size': 16, 'aria-hidden': true })}
              {deleting && <Spinner />}
            </Button>
          </DropdownMenu>
        </span>
      )}
    </div>
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
    return <span className="text-muted-foreground text-xs leading-5">{label}</span>;
  }
  const active = orderBy === sortBy;
  return (
    <button
      className={cn(styles.sortHeader, active && styles.sortHeaderActive)}
      type="button"
      onClick={() => onSort(sortBy)}
    >
      {label}
      {active
        ? createElement(orderDirection === 'asc' ? ArrowDownIcon : ArrowUpIcon, {
            'aria-hidden': true,
            'size': 12,
          })
        : null}
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
    <div
      className={cn('flex flex-row', `${styles.headerRow} ${styles.columns}`)}
      style={projectListGridTemplate(columns)}
    >
      <div className={cn(cn('flex flex-row', styles.nameCell), 'items-center gap-2.5')}>
        <SortableHeader
          label={t('list.columnName', { defaultValue: 'Name' })}
          orderBy={orderBy}
          orderDirection={orderDirection}
          sortBy="name"
          onSort={onSort}
        />
      </div>
      {columns.map((column) => (
        <span
          className={cn(styles.owner, column.key === 'issues' && styles.numeric)}
          key={column.key}
        >
          <SortableHeader
            label={t(COLUMN_HEADER_KEYS[column.key])}
            orderBy={orderBy}
            orderDirection={orderDirection}
            sortBy={column.sortBy}
            onSort={onSort}
          />
        </span>
      ))}
    </div>
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
        <ProjectStatusIcon size={16} status={status} />
        <span className="text-xs leading-5 font-medium">{t(`status.${status}`)}</span>
      </>
    );
  }
  const userId = groupKey.slice(5);
  if (userId === 'none') {
    return (
      <>
        <NoLeadIcon />
        <span className="text-muted-foreground text-xs leading-5 font-medium">
          {t('properties.noLead')}
        </span>
      </>
    );
  }
  const name = leadName(userId);
  return (
    <>
      <Avatar avatar={leadAvatar(userId)} name={name} shape="circle" size={16} />
      <span className="text-xs leading-5 font-medium">{name}</span>
    </>
  );
});

ProjectListGroupHeader.displayName = 'ProjectListGroupHeader';

const ProjectListPage = memo(() => {
  const { t } = useTranslation('project');
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(true);
  const {
    data: membersData,
    error: membersError,
    isLoading: membersLoading,
    mutate: revalidateMembers,
  } = useWorkspaceMembersQuery();
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
  const projectName = useCallback(
    (id: string) => projects.find((project) => project.id === id)?.name ?? id,
    [projects],
  );

  const columns = useMemo(
    () => visibleProjectListColumns(options.properties),
    [options.properties],
  );
  const visibleProjects = useMemo(() => {
    const filtered = filterProjectList(projects, filters);
    const open = filterClosedProjects(filtered, options.showClosed);
    return sortProjectList(open, options.orderBy, options.orderDirection);
  }, [filters, options.orderBy, options.orderDirection, options.showClosed, projects]);

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

  const handleHeaderSort = useCallback(
    (field: ProjectListSortableOrdering) => updateOptions(nextSortFromHeader(options, field)),
    [options, updateOptions],
  );

  const groupHeader = (groupKey: string): ReactNode => (
    <ProjectListGroupHeader groupKey={groupKey} leadAvatar={memberAvatar} leadName={memberName} />
  );

  return (
    <WorkSurface>
      <NavHeader
        left={<span className="text-sm font-medium">{t('list.title')}</span>}
        right={
          <Button size="lg" variant="ghost" onClick={() => openCreateProjectModal()}>
            {createElement(PlusIcon, { 'size': 16, 'aria-hidden': true })}
            {t('create.title')}
          </Button>
        }
      />
      <WorkSurfaceCollection
        toolbar={
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
              </>
            }
          >
            <span className="inline-flex h-7 items-center rounded-full bg-muted px-3 text-xs font-medium text-foreground">
              {t('teams.viewAllProjects', { ns: 'common' })}
            </span>
            <Button
              aria-label={t('savedViews.newView', { ns: 'common' })}
              className="rounded-full"
              size="icon"
              title={t('savedViews.newView', { ns: 'common' })}
              variant="ghost"
              onClick={() => setAdvancedFilterOpen(true)}
            >
              {createElement(Layers2Icon, { 'size': 16, 'aria-hidden': true })}
            </Button>
            <ProjectListFilterChips
              filters={filters}
              memberName={memberName}
              projectName={projectName}
              onClearAll={() => updateFilters([])}
              onRemove={(key) => updateFilters(removeProjectListFilter(filters, key))}
            />
          </WorkSurfaceToolbar>
        }
      >
        {error ? (
          <AsyncError error={error} onRetry={() => mutate()} />
        ) : isLoading && projects.length === 0 ? (
          <div aria-busy="true" className="flex flex-col gap-2" role="status">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton className="h-8 w-full" key={index} />
            ))}
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 p-12">
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
              {createElement(filters.length > 0 ? SearchXIcon : PROJECT_ENTITY_ICON, {
                'size': 40,
                'aria-hidden': true,
              })}
              <div>
                {filters.length > 0 ? t('list.filter.noResults') : t('list.emptyDescription')}
              </div>
            </div>
          </div>
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
          <div className="flex flex-col gap-0 min-w-max">
            <ProjectListTableHeader
              columns={columns}
              orderBy={options.orderBy}
              orderDirection={options.orderDirection}
              onSort={handleHeaderSort}
            />
            {groups.map((group) => (
              <div className="flex flex-col gap-0" key={group.key}>
                {group.key !== 'all' ? (
                  <div className={styles.groupHeader}>
                    {groupHeader(group.key)}
                    <span className="text-muted-foreground text-xs leading-5">
                      {group.items.length}
                    </span>
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
              </div>
            ))}
          </div>
        )}
      </WorkSurfaceCollection>
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
