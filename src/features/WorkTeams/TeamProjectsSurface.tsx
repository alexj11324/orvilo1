'use client';

import type { ProjectHealth } from '@orvilo/types';
import { cn } from 'cn';
import { Layers2Icon, LoaderCircleIcon, PanelRightIcon, PlusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import SimpleEmpty from '@/components/SimpleEmpty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import { mergeWorkQueryPage, workQueryHasMore } from '@/features/MyWork/workQueryPaging';
import NavHeader from '@/features/NavHeader';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import { ProjectHealthIcon } from '@/features/Projects/healthMeta';
import {
  type MembersQuery,
  ProjectListGroupHeader,
  projectListStyles,
  ProjectListTableHeader,
  ProjectRow,
} from '@/features/Projects/List';
import AddFilterPopover from '@/features/Projects/List/AddFilterPopover';
import {
  DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS,
  filterClosedProjects,
  groupProjectList,
  nextSortFromHeader,
  normalizeProjectListDisplayOptions,
  type ProjectListDisplayOptions,
  type ProjectListSortableOrdering,
  sortProjectList,
  visibleProjectListColumns,
} from '@/features/Projects/List/displayOptions';
import DisplayOptionsPopover from '@/features/Projects/List/DisplayOptionsPopover';
import ProjectListFilterChips from '@/features/Projects/List/FilterChips';
import {
  filterProjectList,
  type ProjectListFilter,
  readProjectListFilters,
  removeProjectListFilter,
  upsertProjectListFilter,
  writeProjectListFilters,
} from '@/features/Projects/List/listFilters';
import { NoLeadIcon } from '@/features/Projects/List/NoLeadIcon';
import ProjectBoard from '@/features/Projects/List/ProjectBoard';
import ProjectTimeline from '@/features/Projects/List/ProjectTimeline';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import NewViewModal from '@/features/SavedViews/NewViewModal';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';
import { useSearchParams } from '@/libs/router/navigation';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import TeamIdentity from './TeamIdentity';
import { enrichTeamProjects, summarizeTeamProjects, teamProjectsWorkQuery } from './teamProjects';

const styles = {
  loadMore: 'py-3',
  separator: 'flex-none',
  sidebar: 'overflow-y-auto flex-none box-border w-66 p-4 border-s border-sidebar-border bg-card',
  sidebarRow:
    'cursor-pointer flex gap-2 items-center w-full py-1.25 px-2 border-none rounded-[6px] text-foreground text-start bg-transparent hover:bg-accent',
  sidebarRowActive: 'text-primary bg-selected',
  sidebarRowCount: 'ms-auto text-[12px] text-muted-foreground',
  sidebarSection: 'flex flex-col gap-0.5',
  viewChip:
    'cursor-pointer inline-flex items-center h-7 px-3 border border-transparent rounded-[999px] text-muted-foreground bg-transparent hover:bg-accent',
  viewChipActive: 'text-foreground bg-selected',
};

/**
 * Team Projects tab — the Linear `/team/:key/projects` surface (evidence:
 * docs/research/linear/team-projects/DIFFERENCE-AND-ACCEPTANCE.md).
 *
 * Self-contained like `TeamViewsSurface`: the host mounts it for
 * `?tab=projects` and it owns the whole surface — team identity + Projects
 * breadcrumb header, view toolbar, the shared seven-column project table
 * (or board/timeline), the aggregate sidebar, and cursor pagination.
 *
 * Data: `workAttention.query` scoped by `teamId` (authoritative for team
 * membership + readability) joined onto the workspace `project.list`
 * projection for `taskCount`/`progressPercent` — see teamProjects.ts.
 */
interface TeamProjectsSurfaceProps {
  teamId: string;
}

const TEAM_PROJECT_LIST_DEFAULT_OPTIONS: ProjectListDisplayOptions = {
  ...DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS,
  orderBy: 'manual',
};

const TeamProjectsSurface = memo<TeamProjectsSurfaceProps>(({ teamId }) => {
  const { t } = useTranslation(['project', 'common']);
  const workspaceId = useActiveWorkspaceId();
  const currentUserId = useUserStore(userProfileSelectors.userId);

  // Same SWR keys as TeamPage — mounting the surface reuses the in-flight
  // cache instead of issuing a second request.
  const {
    data: teamData,
    error: teamError,
    mutate: revalidateTeam,
  } = useClientDataSWR(teamId && workspaceId ? ['team', workspaceId, teamId] : null, () =>
    lambdaClient.team.team.query({ teamId }),
  );
  const {
    data: projectsData,
    error: projectsError,
    isLoading: projectsLoading,
    mutate: revalidateProjects,
  } = useClientDataSWR(teamId && workspaceId ? ['team-projects', workspaceId, teamId] : null, () =>
    workAttentionService.query({ query: teamProjectsWorkQuery(teamId) }),
  );

  const firstPage = useMemo(
    () =>
      projectsData?.data && 'projects' in projectsData.data
        ? (projectsData.data.projects ?? [])
        : [],
    [projectsData],
  );
  const queryHash =
    projectsData?.data && 'queryHash' in projectsData.data
      ? projectsData.data.queryHash
      : undefined;
  const total =
    projectsData?.data && 'total' in projectsData.data ? projectsData.data.total : undefined;

  // Cursor pagination — the work query pages at 50 rows; the tail is fetched
  // through the same `afterId`/`queryHash` protocol the team issues list uses.
  const [tail, setTail] = useState<(typeof firstPage)[number][]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const { loadMoreError, resetLoadMoreError, retryLoadMore, runLoadMore } = usePagedLoadMore();
  useEffect(() => {
    setTail([]);
    resetLoadMoreError();
  }, [queryHash, resetLoadMoreError, teamId, workspaceId]);
  const teamRows = useMemo(() => mergeWorkQueryPage(firstPage, tail), [firstPage, tail]);
  const hasMore = workQueryHasMore(teamRows.length, total);
  const loadMore = useCallback(async () => {
    const last = teamRows.at(-1);
    if (!last || !queryHash || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await workAttentionService.query({
        afterId: last.id,
        query: teamProjectsWorkQuery(teamId),
        queryHash,
      });
      const incoming = next.data && 'projects' in next.data ? (next.data.projects ?? []) : [];
      setTail((current) => mergeWorkQueryPage(current, incoming));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, queryHash, teamId, teamRows]);

  // The work query returns raw project rows — the shared table needs the
  // workspace list's computed taskCount/progressPercent, joined by id.
  useProjectStore((s) => s.useFetchProjectList)(Boolean(workspaceId));
  const workspaceProjects = useCurrentProjectList();
  const projects = useMemo(
    () => enrichTeamProjects(teamRows, workspaceProjects),
    [teamRows, workspaceProjects],
  );

  const {
    data: membersData,
    error: membersError,
    isLoading: membersLoading,
    mutate: revalidateMembers,
  } = useWorkspaceMembersQuery();
  // Stable wrapper so memoized ProjectRow cells skip unrelated re-renders.
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

  // Display options persist per surface — the team tab keeps its own
  // SystemStatus slot so it never clobbers the workspace list's options.
  const rawOptions = useGlobalStore(systemStatusSelectors.teamProjectsViewOptions);
  const options = useMemo(
    () => normalizeProjectListDisplayOptions(rawOptions ?? TEAM_PROJECT_LIST_DEFAULT_OPTIONS),
    [rawOptions],
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const updateOptions = useCallback(
    (patch: Partial<ProjectListDisplayOptions>) =>
      updateSystemStatus(
        { teamProjectsViewOptions: { ...options, ...patch } },
        'updateTeamProjectsViewOptions',
      ),
    [options, updateSystemStatus],
  );
  const resetOptions = useCallback(
    () =>
      updateSystemStatus(
        { teamProjectsViewOptions: TEAM_PROJECT_LIST_DEFAULT_OPTIONS },
        'resetTeamProjectsViewOptions',
      ),
    [updateSystemStatus],
  );

  // Applied filters live in the URL like the workspace list; the writer only
  // rewrites `filter` params, so `?tab=projects` survives.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readProjectListFilters(searchParams), [searchParams]);
  const updateFilters = useCallback(
    (next: ProjectListFilter[]) =>
      setSearchParams(writeProjectListFilters(searchParams, next), { replace: true }),
    [searchParams, setSearchParams],
  );
  const [viewBuilderOpen, setViewBuilderOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const columns = useMemo(
    () => visibleProjectListColumns(options.properties),
    [options.properties],
  );
  const visibleProjects = useMemo(() => {
    const filtered = filterProjectList(projects, filters);
    const open = filterClosedProjects(filtered, options.showClosed);
    return sortProjectList(open, options.orderBy, options.orderDirection);
  }, [filters, options.orderBy, options.orderDirection, options.showClosed, projects]);
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
  const projectName = useCallback(
    (id: string) => projects.find((project) => project.id === id)?.name ?? id,
    [projects],
  );

  // Aggregate sidebar — the reference's Health/Leads/Update-missing panel.
  // Buckets double as one-click filters.
  const summary = useMemo(
    () => summarizeTeamProjects(projects, memberName),
    [memberName, projects],
  );
  const activeHealth = useMemo(
    () => new Set(filters.find((filter) => filter.type === 'health')?.values ?? []),
    [filters],
  );
  const activeLeads = useMemo(
    () => new Set(filters.find((filter) => filter.type === 'lead')?.values ?? []),
    [filters],
  );
  const toggleHealth = useCallback(
    (health: null | ProjectHealth) =>
      updateFilters(upsertProjectListFilter(filters, { type: 'health', values: [health] })),
    [filters, updateFilters],
  );
  const toggleLead = useCallback(
    (userId: null | string) =>
      updateFilters(upsertProjectListFilter(filters, { type: 'lead', values: [userId] })),
    [filters, updateFilters],
  );

  const team = teamData?.data.team;

  const groupHeader = (groupKey: string): ReactNode => (
    <ProjectListGroupHeader groupKey={groupKey} leadAvatar={memberAvatar} leadName={memberName} />
  );

  const sidebar = (
    <aside aria-label={t('list.sidebar.open', { ns: 'project' })} className={styles.sidebar}>
      <div className="flex flex-col gap-4">
        <div className={styles.sidebarSection}>
          <span className="text-sm text-muted-foreground font-medium">
            {t('list.sidebar.health', { ns: 'project' })}
          </span>
          {summary.health.map(({ count, state }) => (
            <button
              aria-pressed={activeHealth.has(state)}
              className={cn(styles.sidebarRow, activeHealth.has(state) && styles.sidebarRowActive)}
              key={state}
              type="button"
              onClick={() => toggleHealth(state)}
            >
              <ProjectHealthIcon health={state} size={14} />
              <span className="text-sm">
                {t(`list.health.${state}`, { defaultValue: state, ns: 'project' })}
              </span>
              <span className={styles.sidebarRowCount}>{count}</span>
            </button>
          ))}
        </div>
        <div className={styles.sidebarSection}>
          <span className="text-sm text-muted-foreground font-medium">
            {t('list.sidebar.leads', { ns: 'project' })}
          </span>
          {summary.leads.map(({ count, userId }) => (
            <button
              aria-pressed={activeLeads.has(userId)}
              className={cn(styles.sidebarRow, activeLeads.has(userId) && styles.sidebarRowActive)}
              key={userId ?? 'none'}
              type="button"
              onClick={() => toggleLead(userId)}
            >
              {userId ? (
                <Avatar
                  avatar={memberAvatar(userId)}
                  name={memberName(userId)}
                  shape="circle"
                  size={16}
                />
              ) : (
                <NoLeadIcon />
              )}
              <span className="text-sm truncate">
                {userId ? memberName(userId) : t('properties.noLead', { ns: 'project' })}
              </span>
              <span className={styles.sidebarRowCount}>{count}</span>
            </button>
          ))}
        </div>
        <div className={styles.sidebarSection}>
          <span className="text-sm text-muted-foreground font-medium">
            {t('list.sidebar.updateMissing', { ns: 'project' })}
          </span>
          <button
            aria-pressed={activeHealth.has(null)}
            className={cn(styles.sidebarRow, activeHealth.has(null) && styles.sidebarRowActive)}
            type="button"
            onClick={() => toggleHealth(null)}
          >
            <ProjectHealthIcon health={null} size={14} />
            <span className="text-sm">{t('list.health.noUpdates', { ns: 'project' })}</span>
            <span className={styles.sidebarRowCount}>{summary.updateMissing}</span>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <WorkSurface>
      <NavHeader
        left={
          <div className="flex flex-row items-center gap-2" style={{ paddingInlineStart: 4 }}>
            {team ? (
              <TeamIdentity
                color={team.color}
                id={team.id}
                letter={(team.key || team.name).slice(0, 1)}
              />
            ) : null}
            {team ? <span className="text-sm text-muted-foreground">{team.name}</span> : null}
            <span aria-hidden className={cn('text-muted-foreground', styles.separator)}>
              ›
            </span>
            <span className="text-sm font-medium">{t('list.title', { ns: 'project' })}</span>
            <WorkFavoriteButton icon="star" targetId={teamId} targetType="team" variant="icon" />
          </div>
        }
        right={
          <Button size="sm" variant="ghost" onClick={() => openCreateProjectModal({ teamId })}>
            <PlusIcon aria-hidden className="size-4" />
            {t('create.title', { ns: 'project' })}
          </Button>
        }
      />
      {teamError ? (
        <AsyncError error={teamError} onRetry={() => revalidateTeam()} />
      ) : (
        <div className="flex flex-row flex-1 min-h-0">
          <WorkSurfaceCollection
            toolbar={
              <WorkSurfaceToolbar
                asideLabel={t('list.toolbarControls', { ns: 'project' })}
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
                      onOpenAdvanced={() => setViewBuilderOpen(true)}
                    />
                    <DisplayOptionsPopover
                      options={options}
                      onChange={updateOptions}
                      onReset={resetOptions}
                    />
                    <Button
                      aria-pressed={sidebarOpen}
                      className={cn('rounded-full', sidebarOpen && 'bg-muted')}
                      size="icon-sm"
                      variant="outline"
                      aria-label={
                        sidebarOpen
                          ? t('list.sidebar.close', { ns: 'project' })
                          : t('list.sidebar.open', { ns: 'project' })
                      }
                      title={
                        sidebarOpen
                          ? t('list.sidebar.close', { ns: 'project' })
                          : t('list.sidebar.open', { ns: 'project' })
                      }
                      onClick={() => setSidebarOpen((open) => !open)}
                    >
                      <PanelRightIcon aria-hidden className="size-4" />
                    </Button>
                  </>
                }
              >
                <span className={cn(styles.viewChip, styles.viewChipActive)}>
                  {t('teams.viewAllProjects', { ns: 'common' })}
                </span>
                <Button
                  aria-label={t('savedViews.newView', { ns: 'common' })}
                  className="rounded-full"
                  size="icon-sm"
                  title={t('savedViews.newView', { ns: 'common' })}
                  variant="outline"
                  onClick={() => setViewBuilderOpen(true)}
                >
                  <Layers2Icon aria-hidden className="size-4" />
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
            {projectsError && projects.length === 0 ? (
              <AsyncError error={projectsError} onRetry={() => revalidateProjects()} />
            ) : projectsLoading && projects.length === 0 ? (
              <div
                aria-busy
                aria-label={t('teams.loading', { ns: 'common' })}
                className="flex flex-col gap-0.5"
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton className="h-11 w-full" key={index} />
                ))}
              </div>
            ) : visibleProjects.length === 0 ? (
              <SimpleEmpty
                icon={PROJECT_ENTITY_ICON}
                description={
                  filters.length > 0
                    ? t('list.filter.noResults', { ns: 'project' })
                    : t('teams.projectsEmpty', { ns: 'common' })
                }
              >
                {filters.length === 0 ? (
                  <Button variant="outline" onClick={() => openCreateProjectModal({ teamId })}>
                    <PlusIcon aria-hidden className="size-4" />
                    {t('create.title', { ns: 'project' })}
                  </Button>
                ) : null}
              </SimpleEmpty>
            ) : (
              <>
                {projectsError ? (
                  <AsyncError
                    error={projectsError}
                    variant={'inline'}
                    onRetry={() => revalidateProjects()}
                  />
                ) : null}
                {options.layout === 'board' ? (
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
                  <div className="flex flex-col gap-0" style={{ minWidth: 'max-content' }}>
                    <ProjectListTableHeader
                      columns={columns}
                      orderBy={options.orderBy}
                      orderDirection={options.orderDirection}
                      onSort={handleHeaderSort}
                    />
                    {groups.map((group) => (
                      <div className="flex flex-col gap-0" key={group.key}>
                        {group.key !== 'all' ? (
                          <div className={projectListStyles.groupHeader}>
                            {groupHeader(group.key)}
                            <span className="text-sm text-muted-foreground">
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
                {/* A failed tail page keeps the loaded rows — the retry
                    re-issues exactly the request that failed. */}
                {loadMoreError ? (
                  <AsyncError error={loadMoreError} variant={'inline'} onRetry={retryLoadMore} />
                ) : null}
                {hasMore ? (
                  <div className={cn('flex flex-col items-center justify-center', styles.loadMore)}>
                    <Button
                      aria-busy={loadingMore}
                      disabled={loadingMore}
                      variant="outline"
                      onClick={() => runLoadMore(loadMore)}
                    >
                      {loadingMore ? <LoaderCircleIcon className="animate-spin" /> : null}
                      {t('myWork.loadMore', { ns: 'common' })}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </WorkSurfaceCollection>
          {sidebarOpen ? sidebar : null}
        </div>
      )}
      {/* "Add new view" opens the shared view builder scoped to this team —
          the reference routes to a dedicated editor page; the modal carries
          the same definition editor (noted in the task report). */}
      <NewViewModal
        defaultEntityType="project"
        defaultTeamId={teamId}
        open={viewBuilderOpen}
        onClose={() => setViewBuilderOpen(false)}
      />
    </WorkSurface>
  );
});

TeamProjectsSurface.displayName = 'TeamProjectsSurface';

export default TeamProjectsSurface;
