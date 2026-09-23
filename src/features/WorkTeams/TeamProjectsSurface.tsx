'use client';

import { Center, Empty, Flexbox } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import type { ProjectHealth } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { PanelRightIcon, PlusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import { mergeWorkQueryPage, workQueryHasMore } from '@/features/MyWork/workQueryPaging';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
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

const styles = createStaticStyles(({ css, cssVar }) => ({
  loadMore: css`
    padding-block: 12px;
  `,
  separator: css`
    flex: none;
    color: ${cssVar.colorTextQuaternary};
  `,
  sidebar: css`
    overflow-y: auto;
    flex: none;

    box-sizing: border-box;
    width: 264px;
    padding: 16px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  sidebarRow: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    padding-block: 5px;
    padding-inline: 8px;
    border: none;
    border-radius: 6px;

    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  sidebarRowActive: css`
    color: ${cssVar.colorPrimary};
    background: ${cssVar.colorFillSecondary};
  `,
  sidebarRowCount: css`
    margin-inline-start: auto;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  sidebarSection: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  viewChip: css`
    cursor: pointer;

    display: inline-flex;
    align-items: center;

    height: 28px;
    padding-inline: 12px;
    border: 1px solid transparent;
    border-radius: 999px;

    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  viewChipActive: css`
    border-color: ${cssVar.colorBorderSecondary};
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillSecondary};
  `,
}));

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
  useEffect(() => {
    setTail([]);
  }, [queryHash, teamId, workspaceId]);
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
  const options = useMemo(() => normalizeProjectListDisplayOptions(rawOptions), [rawOptions]);
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
        { teamProjectsViewOptions: DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS },
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
      <Flexbox gap={16}>
        <div className={styles.sidebarSection}>
          <Text fontSize={12} type="secondary" weight={500}>
            {t('list.sidebar.health', { ns: 'project' })}
          </Text>
          {summary.health.map(({ count, state }) => (
            <button
              aria-pressed={activeHealth.has(state)}
              className={cx(styles.sidebarRow, activeHealth.has(state) && styles.sidebarRowActive)}
              key={state}
              type="button"
              onClick={() => toggleHealth(state)}
            >
              <ProjectHealthIcon health={state} size={14} />
              <Text fontSize={13}>
                {t(`list.health.${state}`, { defaultValue: state, ns: 'project' })}
              </Text>
              <span className={styles.sidebarRowCount}>{count}</span>
            </button>
          ))}
        </div>
        <div className={styles.sidebarSection}>
          <Text fontSize={12} type="secondary" weight={500}>
            {t('list.sidebar.leads', { ns: 'project' })}
          </Text>
          {summary.leads.map(({ count, userId }) => (
            <button
              aria-pressed={activeLeads.has(userId)}
              className={cx(styles.sidebarRow, activeLeads.has(userId) && styles.sidebarRowActive)}
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
              <Text ellipsis fontSize={13}>
                {userId ? memberName(userId) : t('properties.noLead', { ns: 'project' })}
              </Text>
              <span className={styles.sidebarRowCount}>{count}</span>
            </button>
          ))}
        </div>
        <div className={styles.sidebarSection}>
          <Text fontSize={12} type="secondary" weight={500}>
            {t('list.sidebar.updateMissing', { ns: 'project' })}
          </Text>
          <button
            aria-pressed={activeHealth.has(null)}
            className={cx(styles.sidebarRow, activeHealth.has(null) && styles.sidebarRowActive)}
            type="button"
            onClick={() => toggleHealth(null)}
          >
            <ProjectHealthIcon health={null} size={14} />
            <Text fontSize={13}>{t('list.health.noUpdates', { ns: 'project' })}</Text>
            <span className={styles.sidebarRowCount}>{summary.updateMissing}</span>
          </button>
        </div>
      </Flexbox>
    </aside>
  );

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Flexbox horizontal align={'center'} gap={8} style={{ paddingInlineStart: 4 }}>
            {team ? (
              <TeamIdentity
                color={team.color}
                id={team.id}
                letter={(team.key || team.name).slice(0, 1)}
              />
            ) : null}
            {team ? <Text type="secondary">{team.name}</Text> : null}
            <span aria-hidden className={styles.separator}>
              ›
            </span>
            <Text weight={500}>{t('list.title', { ns: 'project' })}</Text>
          </Flexbox>
        }
        right={
          <Flexbox horizontal align={'center'} gap={8}>
            <WorkFavoriteButton targetId={teamId} targetType="team" />
            <Button
              icon={PlusIcon}
              shape={'round'}
              size={'small'}
              type="primary"
              onClick={() => openCreateProjectModal({ teamId })}
            >
              {t('create.title', { ns: 'project' })}
            </Button>
          </Flexbox>
        }
      />
      {teamError ? (
        <AsyncError error={teamError} onRetry={() => revalidateTeam()} />
      ) : (
        <Flexbox horizontal flex={1} style={{ minHeight: 0 }}>
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
                      icon={PanelRightIcon}
                      size="small"
                      type={sidebarOpen ? 'primary' : 'default'}
                      onClick={() => setSidebarOpen((open) => !open)}
                    >
                      {sidebarOpen
                        ? t('list.sidebar.close', { ns: 'project' })
                        : t('list.sidebar.open', { ns: 'project' })}
                    </Button>
                  </>
                }
              >
                <span className={cx(styles.viewChip, styles.viewChipActive)}>
                  {t('teams.viewAllProjects', { ns: 'common' })}
                </span>
                <Button
                  icon={PlusIcon}
                  size="small"
                  type="text"
                  onClick={() => setViewBuilderOpen(true)}
                >
                  {t('savedViews.newView', { ns: 'common' })}
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
              <SkeletonList aria-label={t('teams.loading', { ns: 'common' })} rows={8} />
            ) : visibleProjects.length === 0 ? (
              <Center flex={1} padding={48}>
                <Flexbox align={'center'} gap={16}>
                  <Empty
                    icon={PROJECT_ENTITY_ICON}
                    description={
                      filters.length > 0
                        ? t('list.filter.noResults', { ns: 'project' })
                        : t('teams.projectsEmpty', { ns: 'common' })
                    }
                  />
                  {filters.length === 0 ? (
                    <Button
                      icon={PlusIcon}
                      size="small"
                      onClick={() => openCreateProjectModal({ teamId })}
                    >
                      {t('create.title', { ns: 'project' })}
                    </Button>
                  ) : null}
                </Flexbox>
              </Center>
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
                          <div className={projectListStyles.groupHeader}>
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
                {hasMore ? (
                  <Center className={styles.loadMore}>
                    <Button loading={loadingMore} size="small" onClick={() => void loadMore()}>
                      {t('myWork.loadMore', { ns: 'common' })}
                    </Button>
                  </Center>
                ) : null}
              </>
            )}
          </WorkSurfaceCollection>
          {sidebarOpen ? sidebar : null}
        </Flexbox>
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
