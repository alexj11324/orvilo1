'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Button, Segmented, Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus, TaskWorkflowCategory, WorkQuerySortMode } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { PriorityIcon } from '@/components/PriorityIcon';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import AssigneeUserAvatar from '@/features/AgentTasks/features/AssigneeUserAvatar';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import {
  MY_WORK_PRIORITY_LABEL_KEYS,
  myWorkPriorityGroupRank,
  workQueryFieldSections,
} from '@/features/MyWork/myWorkDisplay';
import {
  EMPTY_FILTER_BUILDER,
  myWorkActiveFilterCount,
  workQueryFilterHasPredicates,
} from '@/features/MyWork/myWorkFilters';
import MyWorkIssuePane from '@/features/MyWork/MyWorkIssuePane';
import {
  mergeWorkQueryGroups,
  mergeWorkQueryPage,
  type WorkQueryResultTask,
} from '@/features/MyWork/workQueryPaging';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import NewViewModal from '@/features/SavedViews/NewViewModal';
import {
  type BuilderState,
  builderToFilter,
  stableStringify,
} from '@/features/SavedViews/workQueryBuilder';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';
import { useSearchParams } from '@/libs/router/navigation';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useCurrentProjectList, useProjectStore } from '@/store/project';

import TeamIdentity from './TeamIdentity';
import TeamIssuesControls from './TeamIssuesControls';
import { nextTeamIssueScopeNavigation } from './teamIssueScopeNavigation';
import {
  filterTeamIssueRows,
  isTeamIssuesClientGrouping,
  patchTeamIssuesParams,
  readTeamIssuesUrlState,
  resetTeamIssuesDisplayParams,
  TEAM_ISSUES_ORDERING_SORTS,
  teamIssuesDisplayFiltersRows,
  teamIssuesServerGroupBy,
  type TeamIssuesUrlPatch,
} from './teamIssuesDisplay';
import { teamSurfaceState } from './teamSurfaceState';
import { ALL_TEAM_CYCLES, type TeamIssueScope, teamTaskQuery } from './teamWorkQuery';

const styles = createStaticStyles(({ css }) => ({
  /**
   * Peek layout mirrors My issues: the list keeps its flexible width and the
   * detail pane is a fixed 400px column that overlays under 900px of surface
   * width (Linear's proportions).
   */
  detailLayout: css`
    position: relative;

    overflow: hidden;
    display: flex;
    flex: 1;

    height: 0;
    min-height: 0;
  `,
  detailPane: css`
    overflow-y: auto;
    flex: none;

    width: 400px;
    padding-block-end: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgLayout};

    @container work-surface (max-width: 900px) {
      position: absolute;
      z-index: 10;
      inset-block: 0;
      inset-inline-end: 0;

      width: min(400px, calc(100% - 40px));

      box-shadow: ${cssVar.boxShadowSecondary};
    }
  `,
  filterChips: css`
    padding-block: 4px;
    padding-inline: 4px;
  `,
  resultsBody: css`
    box-sizing: border-box;
    min-height: 100%;
    padding-block: 8px;
  `,
  resultsScroll: css`
    overflow: auto;
    overscroll-behavior: contain;
    flex: 1;
    min-width: 0;
  `,
  separator: css`
    color: ${cssVar.colorTextQuaternary};
  `,
}));

// Board mode bounds the collection body to the scrollport so the kanban's own
// column scrollers engage; list mode lets the body grow and the scroll host
// stays the single scroll owner.
const boardBodyStyle = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
} as const;

// The peek split needs the body bound to the scrollport too — each side owns
// its own scroll — and flush padding so the pane reaches the surface edge.
const splitBodyStyle = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  paddingBlock: 0,
  paddingInline: 0,
} as const;

// Reference team-issues chrome orders the scope switch Active → Backlog →
// All issues; 'all' stays the canonical no-param URL.
const ISSUE_SCOPES: TeamIssueScope[] = ['active', 'backlog', 'all'];

const resolveIssueScope = (value: string | null): TeamIssueScope =>
  ISSUE_SCOPES.includes(value as TeamIssueScope) ? (value as TeamIssueScope) : 'all';

/**
 * The `/team/:id?tab=issues` surface — Linear's team issues chrome:
 * scope switch, Add filter (work-query builder + cycle/no-project), Display
 * options (layout/grouping/ordering/empty columns/sub-issues/completed
 * window/project chip), Open details peek, and the Add-new-view builder.
 * Every display/filter choice lives in the URL (`teamIssuesDisplay.ts`), so
 * reload and Back/forward restore the exact view.
 */
const TeamIssuesSurface = memo<{ teamId: string }>(({ teamId }) => {
  const { t } = useTranslation(['common', 'chat']);
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const issueScope = resolveIssueScope(searchParams.get('scope'));
  const { cycleId, display, layout, noProject } = readTeamIssuesUrlState(searchParams);
  const boardActive = layout === 'board';

  const updateParams = useCallback(
    (patch: TeamIssuesUrlPatch) => {
      setSearchParams(patchTeamIssuesParams(searchParams, patch), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const {
    data: teamData,
    error: teamError,
    mutate: revalidateTeam,
  } = useClientDataSWR(teamId && workspaceId ? ['team', workspaceId, teamId] : null, () =>
    lambdaClient.team.team.query({ teamId }),
  );
  const team = teamData?.data.team;
  // Triage is a per-team capability — a triaging team's issues feed must keep
  // `untriaged` rows out until intake resolves them.
  const triageCapable = team?.orchestrationPolicy?.triageEnabled !== false;

  /* ----------------------------- filters ----------------------------- */

  // The Add-filter builder state is component-local like My issues — the
  // durable form of a filter set is the saved view "Add new view" produces.
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_FILTER_BUILDER);
  const builderFilter = builderToFilter('task', builder);
  const hasCustomFilters = workQueryFilterHasPredicates(builderFilter);
  const activeFilterCount = myWorkActiveFilterCount(builder);

  /* ------------------------------ fetch ------------------------------ */

  const serverGroupBy = teamIssuesServerGroupBy(display, layout);
  const sort =
    display.ordering === 'default' ? undefined : TEAM_ISSUES_ORDERING_SORTS[display.ordering];
  // A field sort on the board is an ordering, not a manual position — the
  // kanban refuses same-column position writes under it.
  const sortMode: WorkQuerySortMode | undefined = sort && boardActive ? 'field' : undefined;
  const tasksQuery = useMemo(
    () =>
      teamTaskQuery(teamId, cycleId, noProject, layout, issueScope, triageCapable, {
        filter: hasCustomFilters ? builderFilter : undefined,
        groupBy: serverGroupBy,
        sort,
        sortMode,
      }),
    [
      builderFilter,
      cycleId,
      hasCustomFilters,
      issueScope,
      layout,
      noProject,
      serverGroupBy,
      sort,
      sortMode,
      teamId,
      triageCapable,
    ],
  );
  const tasksQueryKey = stableStringify(tasksQuery);
  const tasksKey = useMemo(
    () => ['team-tasks', workspaceId, teamId, tasksQueryKey],
    [tasksQueryKey, teamId, workspaceId],
  );
  const {
    data: teamTasksData,
    error: teamTasksError,
    isLoading: isTeamTasksLoading,
  } = useClientDataSWR(workspaceId ? tasksKey : null, () =>
    workAttentionService.query({ query: tasksQuery }),
  );

  const firstTeamTasks =
    teamTasksData?.data && 'tasks' in teamTasksData.data ? teamTasksData.data.tasks : [];
  const firstTeamGroups =
    teamTasksData?.data && 'groups' in teamTasksData.data ? (teamTasksData.data.groups ?? []) : [];
  const teamQueryHash =
    teamTasksData?.data && 'queryHash' in teamTasksData.data
      ? teamTasksData.data.queryHash
      : undefined;
  const [teamTail, setTeamTail] = useState<typeof firstTeamTasks>([]);
  const [teamGroupTail, setTeamGroupTail] = useState<typeof firstTeamGroups>([]);
  const {
    loadMoreError,
    loadMoreGroupErrors,
    resetLoadMoreError,
    retryLoadMore,
    retryLoadMoreGroup,
    runLoadMore,
    runLoadMoreGroup,
  } = usePagedLoadMore();
  useEffect(() => {
    setTeamTail([]);
    setTeamGroupTail([]);
    resetLoadMoreError();
  }, [resetLoadMoreError, tasksQueryKey, teamQueryHash, workspaceId]);
  const teamTasks = mergeWorkQueryPage(firstTeamTasks, teamTail);
  const teamGroups = mergeWorkQueryGroups(firstTeamGroups, teamGroupTail);
  const workState = teamSurfaceState({
    error: teamTasksError,
    isLoading: isTeamTasksLoading,
    itemCount: teamTasks.length + teamGroups.reduce((sum, group) => sum + group.tasks.length, 0),
  });

  const refresh = useCallback(async () => {
    setTeamTail([]);
    setTeamGroupTail([]);
    await mutate(tasksKey);
  }, [tasksKey]);

  // A board move can change a row's triage/scope membership — keep the team
  // surfaces (this feed plus the triage tab) in sync. The predicate matches
  // the augmented key prefix so every query-shape invalidates.
  const refreshWork = useCallback(() => {
    void refresh();
    void mutate(
      (key) =>
        Array.isArray(key) &&
        key[0] === 'team-triage' &&
        key[1] === workspaceId &&
        key[2] === teamId,
    );
  }, [refresh, teamId, workspaceId]);

  const fetchNextPage = useCallback(
    async (input: { afterId: string; groupKey?: string }) =>
      workAttentionService.query({
        afterId: input.afterId,
        groupKey: input.groupKey,
        query: tasksQuery,
        queryHash: teamQueryHash,
      }),
    [tasksQuery, teamQueryHash],
  );

  const loadMore = useCallback(async () => {
    const last = teamTasks.at(-1);
    if (!last || !teamQueryHash) return;
    const next = await fetchNextPage({ afterId: last.id });
    const incoming = next.data && 'tasks' in next.data ? next.data.tasks : [];
    setTeamTail((current) => mergeWorkQueryPage(current, incoming));
  }, [fetchNextPage, teamQueryHash, teamTasks]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = teamGroups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !teamQueryHash) return;
      const next = await fetchNextPage({ afterId: last.id, groupKey });
      const incoming = next.data && 'groups' in next.data ? (next.data.groups ?? []) : [];
      setTeamGroupTail((current) => mergeWorkQueryGroups(current, incoming));
    },
    [fetchNextPage, teamGroups, teamQueryHash],
  );

  /* --------------------------- display pass --------------------------- */

  // Display filters (completed window, sub-issues) are a presentation-only
  // pass over the loaded page — ordering stays server-side.
  const displayFiltersRows = teamIssuesDisplayFiltersRows(display);
  const displayTasks = useMemo(() => filterTeamIssueRows(teamTasks, display), [display, teamTasks]);
  const displayGroups = useMemo(
    () =>
      teamGroups.map((group) => {
        const filteredTasks = filterTeamIssueRows(group.tasks, display);
        return {
          ...group,
          tasks: filteredTasks,
          // A display-filtered group counts what it actually shows.
          total: displayFiltersRows ? filteredTasks.length : group.total,
        };
      }),
    [display, displayFiltersRows, teamGroups],
  );

  const cycleOptions = useMemo(
    () => [
      { label: t('teams.cycleAll'), value: ALL_TEAM_CYCLES },
      ...(teamData?.data.cycles ?? []).map((cycle) => ({
        label: cycle.name || cycle.id,
        value: cycle.id,
      })),
    ],
    [t, teamData?.data.cycles],
  );
  const cycleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cycle of teamData?.data.cycles ?? []) map.set(cycle.id, cycle.name || cycle.id);
    return map;
  }, [teamData?.data.cycles]);
  const cycleRankById = useMemo(() => {
    const map = new Map<string, number>();
    (teamData?.data.cycles ?? []).forEach((cycle, index) => map.set(cycle.id, index));
    return map;
  }, [teamData?.data.cycles]);

  // Project chips resolve names through the cached project list — the row
  // model carries `projectId` only, and an unknown project renders no chip.
  useProjectStore((s) => s.useFetchProjectList)(Boolean(workspaceId));
  const projects = useCurrentProjectList();
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      if (project.name) map.set(project.id, project.name);
    }
    return map;
  }, [projects]);

  // Assignee group headers need member display names — the row model carries
  // `assigneeUserId` only. The roster fetch stays dormant until the grouping
  // is actually picked.
  const { members } = useWorkspaceMembersQuery({
    enabled: layout === 'list' && display.grouping === 'assignee',
  });
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members ?? []) {
      if (!member.userId) continue;
      map.set(
        member.userId,
        member.user?.fullName || member.user?.username || member.user?.email || member.userId,
      );
    }
    return map;
  }, [members]);

  // Client-side list groupings — the work-query enum has no priority, project,
  // assignee or cycle dimension, so the surface fetches the flat feed
  // (`teamIssuesServerGroupBy` → 'none') and buckets the loaded page here.
  // Arrival order inside a section is the feed's own ordering; Load-more
  // keeps paging the flat list at the bottom.
  const flatSections = useMemo(() => {
    if (layout !== 'list' || !isTeamIssuesClientGrouping(display.grouping)) return undefined;
    if (display.grouping === 'priority') {
      return workQueryFieldSections(displayTasks, {
        // null and 0 are the same "No priority" bucket.
        keyOf: (task) => task.priority ?? 0,
        rankOf: myWorkPriorityGroupRank,
        titleOf: (key) =>
          t(
            `chat:${
              MY_WORK_PRIORITY_LABEL_KEYS[Number(key ?? 0)] ?? MY_WORK_PRIORITY_LABEL_KEYS[0]
            }` as never,
          ),
      }).map((section) => ({
        ...section,
        icon: (
          <PriorityIcon priority={section.key === 'none' ? 0 : Number(section.key)} size={14} />
        ),
      }));
    }
    if (display.grouping === 'project') {
      return workQueryFieldSections(displayTasks, {
        keyOf: (task) => task.projectId,
        // A projectId that resolves to no known name keeps its id as the
        // honest group label instead of folding into "No project".
        titleOf: (key) =>
          key === null ? t('myWork.noProject') : (projectNameById.get(key) ?? key),
      }).map((section) => ({
        ...section,
        icon: (
          <Icon
            color={section.key === 'none' ? cssVar.colorTextQuaternary : undefined}
            icon={PROJECT_ENTITY_ICON}
            size={14}
          />
        ),
      }));
    }
    if (display.grouping === 'assignee') {
      return workQueryFieldSections(displayTasks, {
        keyOf: (task) => task.assigneeUserId,
        titleOf: (key) =>
          key === null ? t('chat:taskList.unassigned') : (memberNameById.get(key) ?? key),
      }).map((section) => ({
        ...section,
        icon: <AssigneeUserAvatar size={18} userId={section.key === 'none' ? null : section.key} />,
      }));
    }
    // 'cycle' — buckets follow the team's own cycle list order; a cycle the
    // roster doesn't know and the "No cycle" bucket both trail.
    return workQueryFieldSections(displayTasks, {
      keyOf: (task) => task.cycleRefId,
      rankOf: (key) =>
        key === null
          ? Number.MAX_SAFE_INTEGER
          : (cycleRankById.get(key) ?? Number.MAX_SAFE_INTEGER),
      titleOf: (key) => (key === null ? t('teams.noCycle') : (cycleNameById.get(key) ?? key)),
    });
  }, [
    cycleNameById,
    cycleRankById,
    display.grouping,
    displayTasks,
    layout,
    memberNameById,
    projectNameById,
    t,
  ]);

  const rowExtras = useCallback(
    (task: WorkQueryResultTask) => {
      const name = task.projectId ? projectNameById.get(task.projectId) : undefined;
      if (!name) return null;
      return (
        <Flexbox flex="none">
          <Tag icon={<Icon icon={PROJECT_ENTITY_ICON} size={12} />} size="small" variant="outlined">
            {name}
          </Tag>
        </Flexbox>
      );
    },
    [projectNameById],
  );

  /* --------------------------- selection + peek --------------------------- */

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<WorkQueryResultTask | null>(null);
  // A selection is only meaningful inside the list it came from — switching
  // the effective query drops it.
  useEffect(() => {
    setSelected(null);
  }, [layout, serverGroupBy, tasksQueryKey]);
  const peekOnSelect = detailsOpen && !boardActive;
  const detailVisible = peekOnSelect && selected !== null;
  const openTaskPage = useCallback(
    (task: Pick<WorkQueryResultTask, 'identifier' | 'name'>) => {
      navigate(taskDetailPath(task.identifier, undefined, task.name));
    },
    [navigate],
  );

  /* ------------------------------ actions ------------------------------ */

  const [viewBuilderOpen, setViewBuilderOpen] = useState(false);

  const openCreateModal = useCallback(
    (preset?: {
      projectId?: string;
      status?: TaskStatus;
      workflowCategory?: TaskWorkflowCategory;
    }) => {
      createTaskModal({
        projectId: preset?.projectId,
        status: preset?.status,
        teamId,
        workflowCategory: preset?.workflowCategory,
        onCreated: (task) => {
          navigate(taskDetailPath(task.identifier, task.agentId ?? undefined, task.name));
        },
        showInlineToggle: false,
      });
    },
    [navigate, teamId],
  );
  // Server-grouped lists know the section's column — preset it so creating in
  // "In progress" lands there (the board presets its own column internally).
  const createInGroup = useCallback(
    (groupKey: string) =>
      openCreateModal(
        serverGroupBy === 'status'
          ? { status: groupKey as TaskStatus }
          : serverGroupBy === 'workflowCategory'
            ? { workflowCategory: groupKey as TaskWorkflowCategory }
            : undefined,
      ),
    [openCreateModal, serverGroupBy],
  );
  // Of the client-bucketed groupings only Project can preset a create-modal
  // field — the `+` stays off the other client buckets.
  const createInFlatSection = useCallback(
    (key: string) => openCreateModal({ projectId: key === 'none' ? undefined : key }),
    [openCreateModal],
  );

  const chipsRow =
    noProject || activeFilterCount > 0 || cycleId !== ALL_TEAM_CYCLES ? (
      <Flexbox horizontal align="center" className={styles.filterChips} gap={8}>
        {cycleId !== ALL_TEAM_CYCLES ? (
          <Tag closable size="small" onClose={() => updateParams({ cycleId: ALL_TEAM_CYCLES })}>
            {t('teams.cycle')}: {cycleNameById.get(cycleId) ?? cycleId}
          </Tag>
        ) : null}
        {noProject ? (
          <Tag closable size="small" onClose={() => updateParams({ noProject: false })}>
            {t('teams.noProject')}
          </Tag>
        ) : null}
        {activeFilterCount > 0 ? (
          <Tag closable size="small" onClose={() => setBuilder(EMPTY_FILTER_BUILDER)}>
            {t('myWork.filtersActive', { count: activeFilterCount })}
          </Tag>
        ) : null}
      </Flexbox>
    ) : null;

  const results =
    workState === 'error' ? (
      <AsyncError error={teamTasksError} onRetry={() => refresh()} />
    ) : (
      <>
        {/* Stale rows stay visible under an inline marker — a refetch failure
            must never blank the loaded list. */}
        {teamTasksError ? (
          <AsyncError error={teamTasksError} variant={'inline'} onRetry={() => refresh()} />
        ) : null}
        <WorkQueryResults
          createContext={{ teamId }}
          emptyLabel={t('teams.workEmpty')}
          flatNested={display.showSubIssues && display.nestedSubIssues}
          flatSections={flatSections}
          groups={displayGroups}
          hideEmptyColumns={!display.showEmptyColumns}
          layout={layout}
          loadMoreError={loadMoreError}
          loadMoreGroupErrors={loadMoreGroupErrors}
          loadMoreLabel={t('myWork.loadMore')}
          loading={workState === 'loading'}
          loadingLabel={t('teams.loading')}
          movable={layout === 'board'}
          peekOnSelect={peekOnSelect}
          rowExtras={display.projectChip ? rowExtras : undefined}
          selectedTaskId={selected?.identifier}
          sortMode={sortMode}
          tasks={displayTasks}
          groupBy={
            teamTasksData?.data && 'groupBy' in teamTasksData.data
              ? teamTasksData.data.groupBy
              : undefined
          }
          total={
            teamTasksData?.data && 'total' in teamTasksData.data
              ? teamTasksData.data.total
              : undefined
          }
          onCreateInFlatSection={display.grouping === 'project' ? createInFlatSection : undefined}
          onCreateInGroup={createInGroup}
          onLoadMore={teamGroups.length === 0 ? () => runLoadMore(loadMore) : undefined}
          onLoadMoreGroup={(key) => runLoadMoreGroup(key, () => loadMoreGroup(key))}
          onMoved={refreshWork}
          onOpenTask={openTaskPage}
          onRetryLoadMore={retryLoadMore}
          onRetryLoadMoreGroup={retryLoadMoreGroup}
          onSelectTask={(task) => setSelected(task)}
        />
      </>
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
            <Text weight={500}>{t('teams.navIssues')}</Text>
          </Flexbox>
        }
        right={
          <Flexbox horizontal align={'center'} gap={8}>
            <WorkFavoriteButton targetId={teamId} targetType="team" />
          </Flexbox>
        }
      />
      {!workspaceId ? (
        <Center flex={1}>
          <Empty description={t('teams.personal')} icon={UsersIcon} />
        </Center>
      ) : teamError ? (
        <AsyncError error={teamError} onRetry={() => revalidateTeam()} />
      ) : (
        <WorkSurfaceCollection
          style={detailVisible ? splitBodyStyle : boardActive ? boardBodyStyle : undefined}
          toolbar={
            <WorkSurfaceToolbar
              asideLabel={t('savedViews.viewOptions')}
              aside={
                <TeamIssuesControls
                  activeFilterCount={activeFilterCount}
                  builder={builder}
                  cycleId={cycleId}
                  cycleOptions={cycleOptions}
                  detailsDisabled={boardActive}
                  detailsExpanded={detailVisible}
                  detailsOpen={detailsOpen}
                  display={display}
                  layout={layout}
                  noProject={noProject}
                  onBuilderChange={setBuilder}
                  onCycleChange={(next) => updateParams({ cycleId: next })}
                  onDisplayChange={(patch) => updateParams(patch)}
                  onLayoutChange={(next) => updateParams({ layout: next })}
                  onNoProjectChange={(checked) => updateParams({ noProject: checked })}
                  onResetFilters={() => setBuilder(EMPTY_FILTER_BUILDER)}
                  onToggleDetails={() => setDetailsOpen((open) => !open)}
                  onResetDisplay={() =>
                    setSearchParams(resetTeamIssuesDisplayParams(searchParams), {
                      replace: true,
                    })
                  }
                />
              }
            >
              <Segmented
                size="small"
                value={issueScope}
                options={ISSUE_SCOPES.map((scope) => ({
                  // Linear labels the unfiltered scope "All issues".
                  label: scope === 'all' ? t('teams.scope.allIssues') : t(`teams.scope.${scope}`),
                  value: scope,
                }))}
                onChange={(value) =>
                  setSearchParams(
                    ...nextTeamIssueScopeNavigation(searchParams, value as TeamIssueScope),
                  )
                }
              />
              {/* "Add new view" opens the shared view builder scoped to this
                  team — same contract as the Projects tab's button. */}
              <Button
                icon={PlusIcon}
                size="small"
                type="text"
                onClick={() => setViewBuilderOpen(true)}
              >
                {t('savedViews.newView')}
              </Button>
            </WorkSurfaceToolbar>
          }
        >
          {detailVisible ? (
            <div className={styles.detailLayout}>
              <div className={styles.resultsScroll}>
                <div className={styles.resultsBody}>
                  {chipsRow}
                  {results}
                </div>
              </div>
              <aside aria-label={t('myWork.issueDetails')} className={styles.detailPane}>
                <MyWorkIssuePane
                  identifier={selected.identifier}
                  onClose={() => setSelected(null)}
                  onOpen={() => openTaskPage(selected)}
                />
              </aside>
            </div>
          ) : (
            <>
              {chipsRow}
              {results}
            </>
          )}
        </WorkSurfaceCollection>
      )}
      <NewViewModal
        defaultEntityType="task"
        defaultTeamId={teamId}
        open={viewBuilderOpen}
        onClose={() => setViewBuilderOpen(false)}
      />
    </WorkSurface>
  );
});

TeamIssuesSurface.displayName = 'TeamIssuesSurface';

export default TeamIssuesSurface;
