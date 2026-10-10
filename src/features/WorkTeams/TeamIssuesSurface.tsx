'use client';
import type { TaskStatus, TaskWorkflowCategory, WorkQuerySortMode } from '@orvilo/types';
import { cn } from 'cn';
import { PlusIcon, UsersIcon, XIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { PriorityIcon } from '@/components/PriorityIcon';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import AssigneeUserAvatar from '@/features/AgentTasks/features/AssigneeUserAvatar';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import {
  completedWindowQueryFilter,
  MY_WORK_PRIORITY_LABEL_KEYS,
} from '@/features/MyWork/myWorkDisplay';
import {
  EMPTY_FILTER_BUILDER,
  mergeWorkQueryFilters,
  myWorkActiveFilterCount,
  parseWorkQueryFilterParam,
  serializeWorkQueryFilterParam,
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
  filterToBuilder,
  stableStringify,
} from '@/features/SavedViews/workQueryBuilder';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';
import { usePermission } from '@/hooks/usePermission';
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
  patchTeamIssuesParams,
  readTeamIssuesUrlState,
  resetTeamIssuesDisplayParams,
  TEAM_ISSUES_ORDERING_SORTS,
  teamIssuesBoardLane,
  teamIssuesServerGroupBy,
  type TeamIssuesUrlPatch,
  teamIssuesVisibilityQueryFilter,
} from './teamIssuesDisplay';
import { teamSurfaceState } from './teamSurfaceState';
import { ALL_TEAM_CYCLES, type TeamIssueScope, teamTaskQuery } from './teamWorkQuery';

const styles = {
  detailLayout: 'relative overflow-hidden flex flex-1 h-0 min-h-0',
  detailPane:
    'overflow-y-auto flex-none w-100 [padding-block-end:12px] border-s border-sidebar-border bg-background [@container_work-surface_(max-width:900px)]:absolute [@container_work-surface_(max-width:900px)]:z-10 [@container_work-surface_(max-width:900px)]:[inset-block:0] [@container_work-surface_(max-width:900px)]:end-0 [@container_work-surface_(max-width:900px)]:w-[min(400px,calc(100%-40px))] [@container_work-surface_(max-width:900px)]:shadow-(--ant-box-shadow-secondary)',
  filterChips: 'p-1',
  resultsBody: 'box-border min-h-full py-2',
  resultsScroll: 'overflow-auto overscroll-contain flex-1 min-w-0',
};

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

  // The applied AST lives in `?filter=`. Incomplete builder rows stay local
  // until they produce a predicate.
  const filterParam = searchParams.get('filter');
  const [builder, setBuilderState] = useState<BuilderState>(() =>
    filterToBuilder('task', parseWorkQueryFilterParam(filterParam)),
  );
  useEffect(() => {
    const parsed = parseWorkQueryFilterParam(filterParam);
    setBuilderState((current) => {
      if (stableStringify(builderToFilter('task', current)) === stableStringify(parsed)) {
        return current;
      }
      return filterToBuilder('task', parsed);
    });
  }, [filterParam]);
  const setBuilder = useCallback(
    (next: BuilderState) => {
      setBuilderState(next);
      const serialized = serializeWorkQueryFilterParam(builderToFilter('task', next));
      if ((serialized ?? null) === (filterParam ?? null)) return;
      updateParams({ filter: serialized });
    },
    [filterParam, updateParams],
  );
  const builderFilter = builderToFilter('task', builder);
  const hasCustomFilters = workQueryFilterHasPredicates(builderFilter);
  const activeFilterCount = myWorkActiveFilterCount(builder);

  /* ------------------------------ fetch ------------------------------ */

  const serverGroupBy = teamIssuesServerGroupBy(display, layout);
  const boardLane =
    layout === 'board' ? teamIssuesBoardLane(display.boardGrouping, display.boardLane) : 'none';
  const sort =
    display.ordering === 'default' ? undefined : TEAM_ISSUES_ORDERING_SORTS[display.ordering];
  // A field sort on the board is an ordering, not a manual position — the
  // kanban refuses same-column position writes under it.
  const sortMode: WorkQuerySortMode | undefined = sort && boardActive ? 'field' : undefined;
  const queryFilter = mergeWorkQueryFilters(
    mergeWorkQueryFilters(
      hasCustomFilters ? builderFilter : undefined,
      completedWindowQueryFilter(display.completed),
    ),
    teamIssuesVisibilityQueryFilter(display),
  );
  const tasksQuery = useMemo(
    () =>
      teamTaskQuery(teamId, cycleId, noProject, layout, issueScope, triageCapable, {
        filter: queryFilter,
        groupBy: serverGroupBy,
        sort,
        sortMode,
        subGroupBy: boardLane === 'none' ? undefined : boardLane,
      }),
    [
      boardLane,
      cycleId,
      issueScope,
      layout,
      noProject,
      queryFilter,
      serverGroupBy,
      sort,
      sortMode,
      teamId,
      triageCapable,
    ],
  );
  const pageLimit = boardLane !== 'none' ? 10 : undefined;
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
    workAttentionService.query({ limit: pageLimit, query: tasksQuery }),
  );

  const firstTeamTasks =
    teamTasksData?.data && 'tasks' in teamTasksData.data ? teamTasksData.data.tasks : [];
  const firstTeamGroups =
    teamTasksData?.data && 'groups' in teamTasksData.data ? (teamTasksData.data.groups ?? []) : [];
  const teamQueryHash =
    teamTasksData?.data && 'queryHash' in teamTasksData.data
      ? teamTasksData.data.queryHash
      : undefined;
  const pageToken = `${tasksQueryKey}\u001F${teamQueryHash ?? ''}`;
  const pageTokenRef = useRef(pageToken);
  pageTokenRef.current = pageToken;
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
        limit: pageLimit,
        query: tasksQuery,
        queryHash: teamQueryHash,
      }),
    [pageLimit, tasksQuery, teamQueryHash],
  );

  const loadMore = useCallback(async () => {
    const last = teamTasks.at(-1);
    const started = pageTokenRef.current;
    if (!last || !teamQueryHash) return;
    const next = await fetchNextPage({ afterId: last.id });
    if (pageTokenRef.current !== started) return;
    const incoming = next.data && 'tasks' in next.data ? next.data.tasks : [];
    setTeamTail((current) => mergeWorkQueryPage(current, incoming));
  }, [fetchNextPage, teamQueryHash, teamTasks]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = teamGroups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      const started = pageTokenRef.current;
      if (!last || !teamQueryHash) return;
      const next = await fetchNextPage({ afterId: last.id, groupKey });
      if (pageTokenRef.current !== started) return;
      const incoming = next.data && 'groups' in next.data ? (next.data.groups ?? []) : [];
      setTeamGroupTail((current) => mergeWorkQueryGroups(current, incoming));
    },
    [fetchNextPage, teamGroups, teamQueryHash],
  );

  /* --------------------------- display pass --------------------------- */

  // Sub-issues stay a presentation pass. The completed window is a query
  // predicate, and neither pass replaces the server group total.
  const displayTasks = useMemo(
    () => filterTeamIssueRows(teamTasks, { ...display, completed: 'all' }),
    [display, teamTasks],
  );
  const displayGroups = useMemo(
    () =>
      teamGroups.map((group) => ({
        ...group,
        tasks: filterTeamIssueRows(group.tasks, { ...display, completed: 'all' }),
      })),
    [display, teamGroups],
  );
  const hiddenRowProperties = useMemo(
    () => (display.projectChip ? undefined : new Set(['project'] as const)),
    [display.projectChip],
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

  const groupTitle = useCallback(
    (axis: string, key: string) => {
      if (axis === 'priority') {
        const label = MY_WORK_PRIORITY_LABEL_KEYS[Number(key)] ?? MY_WORK_PRIORITY_LABEL_KEYS[0];
        return t(`chat:${label}` as never);
      }
      if (axis === 'project') {
        if (key === 'none') return t('myWork.noProject');
        return projectNameById.get(key) ?? key;
      }
      if (axis === 'assignee') {
        if (key === 'none') return t('chat:taskList.unassigned');
        return memberNameById.get(key) ?? key;
      }
      if (axis === 'cycle') {
        if (key === 'none') return t('teams.noCycle');
        return cycleNameById.get(key) ?? key;
      }
      return undefined;
    },
    [cycleNameById, memberNameById, projectNameById, t],
  );
  const groupIcon = useCallback((axis: string, key: string) => {
    if (axis === 'priority') {
      return <PriorityIcon priority={key === 'none' ? 0 : Number(key)} size={14} />;
    }
    if (axis === 'project') {
      return (
        <PROJECT_ENTITY_ICON
          aria-hidden
          className="size-4 shrink-0"
          color={key === 'none' ? cssVar.colorTextQuaternary : undefined}
        />
      );
    }
    if (axis === 'assignee') {
      return <AssigneeUserAvatar size={18} userId={key === 'none' ? null : key} />;
    }
    return undefined;
  }, []);

  const rowExtras = useCallback(
    (task: WorkQueryResultTask) => {
      const name = task.projectId ? projectNameById.get(task.projectId) : undefined;
      if (!name) return null;
      return (
        <div className="flex flex-col shrink-0">
          <Badge variant="secondary">
            <PROJECT_ENTITY_ICON aria-hidden className="size-4 shrink-0" />
            {name}
          </Badge>
        </div>
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
  const { allowed: canCreateIssue } = usePermission('create_content');

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
            : serverGroupBy === 'project'
              ? { projectId: groupKey === 'none' ? undefined : groupKey }
              : undefined,
      ),
    [openCreateModal, serverGroupBy],
  );
  const listCreateInGroup =
    display.grouping === 'priority' ||
    display.grouping === 'assignee' ||
    display.grouping === 'cycle'
      ? undefined
      : createInGroup;

  const chipsRow =
    noProject || activeFilterCount > 0 || cycleId !== ALL_TEAM_CYCLES ? (
      <div className={cn('flex flex-row items-center gap-2', styles.filterChips)}>
        {cycleId !== ALL_TEAM_CYCLES ? (
          <Badge variant="secondary">
            {t('teams.cycle')}: {cycleNameById.get(cycleId) ?? cycleId}
            <Button
              aria-label={t('close')}
              size="icon-xs"
              variant="ghost"
              onClick={() => updateParams({ cycleId: ALL_TEAM_CYCLES })}
            >
              <XIcon />
            </Button>
          </Badge>
        ) : null}
        {noProject ? (
          <Badge variant="secondary">
            {t('teams.noProject')}
            <Button
              aria-label={t('close')}
              size="icon-xs"
              variant="ghost"
              onClick={() => updateParams({ noProject: false })}
            >
              <XIcon />
            </Button>
          </Badge>
        ) : null}
        {activeFilterCount > 0 ? (
          <Badge variant="secondary">
            {t('myWork.filtersActive', { count: activeFilterCount })}
            <Button
              aria-label={t('close')}
              size="icon-xs"
              variant="ghost"
              onClick={() => setBuilder(EMPTY_FILTER_BUILDER)}
            >
              <XIcon />
            </Button>
          </Badge>
        ) : null}
      </div>
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
          collapsedColumns={display.collapsedColumns}
          collapsedGroups={display.collapsedGroups}
          createContext={{ teamId }}
          emptyLabel={t('teams.workEmpty')}
          flatNested={display.showSubIssues && display.nestedSubIssues}
          groupIcon={groupIcon}
          groupTitle={groupTitle}
          groups={displayGroups}
          hiddenRowProperties={hiddenRowProperties}
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
          subGroupBy={boardLane === 'none' ? undefined : boardLane}
          tasks={displayTasks}
          groupBy={
            teamTasksData?.data && 'groupBy' in teamTasksData.data
              ? teamTasksData.data.groupBy
              : undefined
          }
          groupRank={
            layout === 'list' && display.grouping === 'cycle'
              ? (key) =>
                  key === 'none'
                    ? Number.MAX_SAFE_INTEGER
                    : (cycleRankById.get(key) ?? Number.MAX_SAFE_INTEGER - 1)
              : undefined
          }
          total={
            teamTasksData?.data && 'total' in teamTasksData.data
              ? teamTasksData.data.total
              : undefined
          }
          onCollapsedColumnsChange={(keys) => updateParams({ collapsedColumns: keys })}
          onCollapsedGroupsChange={(keys) => updateParams({ collapsedGroups: keys })}
          onCreateInGroup={listCreateInGroup}
          onLoadMore={teamGroups.length === 0 ? () => runLoadMore(loadMore) : undefined}
          onLoadMoreGroup={(key) => runLoadMoreGroup(key, () => loadMoreGroup(key))}
          onMoved={refreshWork}
          onOpenTask={openTaskPage}
          onRetryLoadMore={retryLoadMore}
          onRetryLoadMoreGroup={retryLoadMoreGroup}
          onSelectTask={(task) => setSelected(task)}
          onPeekTask={(task) => {
            // Space on a row arms "Open details" and peeks it; Esc / Space on
            // the peeked row closes the pane (the header's close button).
            if (task) setDetailsOpen(true);
            setSelected(task);
          }}
        />
      </>
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
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
            <span className="text-sm font-medium">{t('teams.navIssues')}</span>
          </div>
        }
        right={
          <div className="flex flex-row items-center gap-2">
            <WorkFavoriteButton targetId={teamId} targetType="team" />
            {canCreateIssue ? (
              <Button size="sm" onClick={() => openCreateModal()}>
                <PlusIcon aria-hidden className="size-4" />
                {t('teams.newIssue')}
              </Button>
            ) : null}
          </div>
        }
      />
      {!workspaceId ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <UsersIcon aria-hidden className="size-8" />
            <p>{t('teams.personal')}</p>
          </div>
        </div>
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
              <Tabs
                value={issueScope}
                onValueChange={(value) =>
                  setSearchParams(
                    ...nextTeamIssueScopeNavigation(searchParams, value as TeamIssueScope),
                  )
                }
              >
                <TabsList>
                  {ISSUE_SCOPES.map((scope) => ({
                    // Linear labels the unfiltered scope "All issues".
                    label: scope === 'all' ? t('teams.scope.allIssues') : t(`teams.scope.${scope}`),
                    value: scope,
                  })).map((option) => (
                    <TabsTrigger key={option.value} value={option.value}>
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {/* "Add new view" opens the shared view builder scoped to this
                  team — same contract as the Projects tab's button. */}
              <Button variant="ghost" onClick={() => setViewBuilderOpen(true)}>
                <PlusIcon aria-hidden className="size-4" />
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
              <aside
                aria-label={t('myWork.issueDetails')}
                className={styles.detailPane}
                data-issue-peek-pane=""
              >
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
        seedFilter={hasCustomFilters ? builderFilter : undefined}
        onClose={() => setViewBuilderOpen(false)}
      />
    </WorkSurface>
  );
});

TeamIssuesSurface.displayName = 'TeamIssuesSurface';

export default TeamIssuesSurface;
