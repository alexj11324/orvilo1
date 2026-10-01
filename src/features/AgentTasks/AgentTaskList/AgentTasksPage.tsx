import { agentDisplayName } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon, Plus, XIcon } from 'lucide-react';
import { memo, use, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { DropdownMenu } from '@/components/ItemsMenu';
import { PriorityIcon } from '@/components/PriorityIcon';
import TablePagination from '@/components/TablePagination';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { LinearTaskSyncProvider } from '@/features/AgentTasks/shared/LinearTaskSyncStatus';
import {
  AutomationScopeSwitch,
  AutomationStatusSelect,
} from '@/features/Automations/AutomationScheduleFilters';
import AutomationScheduleList from '@/features/Automations/AutomationScheduleList';
import {
  type AutomationScope,
  type AutomationStatusFilter,
  resolveAutomationScope,
  resolveAutomationStatusFilter,
  SCHEDULED_TASKS_PAGE_SIZE,
} from '@/features/Automations/shared';
import { useScheduledTaskPage } from '@/features/Automations/useScheduledTaskPage';
import { CollaborationOverlay, CollaborationProvider } from '@/features/Collaboration';
import { resolveMineCollectionRedirect } from '@/features/MyWork/mineCollectionRedirect';
import { MY_WORK_PRIORITY_LABEL_KEYS } from '@/features/MyWork/myWorkDisplay';
import { workQueryBoardGroups, workQuerySourceKeysForKanbanColumn } from '@/features/MyWork/workQueryBoard';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import IssueDetailPane from '@/features/Projects/Issues/IssueDetailPane';
import IssueFilterChips from '@/features/Projects/Issues/IssueFilterChips';
import type { ProjectIssueFilter } from '@/features/Projects/Issues/issueFilters';
import {
  projectIssuesViewFilterSeed,
  readProjectIssueFilters,
  removeProjectIssueFilter,
  serializeIssueFilterParam,
  writeProjectIssueFilters,
} from '@/features/Projects/Issues/issueFilters';
import ProjectIssuesControls from '@/features/Projects/Issues/ProjectIssuesControls';
import {
  projectIssueBoardGroupBy,
  projectIssueListAxes,
  projectIssueListSort,
  projectIssueWorkQuery,
} from '@/features/Projects/Issues/projectIssueWorkQuery';
import { useProjectIssuePages } from '@/features/Projects/Issues/useProjectIssuePages';
import { ProjectToolbarContext } from '@/features/Projects/Layout/ProjectToolbarContext';
import {
  filterTasksByMilestone,
  PROJECT_MILESTONE_FILTER_PARAM,
  readProjectMilestoneFilter,
  type TaskMilestoneRef,
} from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import NewViewModal from '@/features/SavedViews/NewViewModal';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { taskLabelKeys } from '@/libs/swr/keys';
import { taskLabelService } from '@/services/taskLabel';
import { useGlobalStore } from '@/store/global';
import type { TaskViewMode } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useTaskStore } from '@/store/task';
import { taskListSelectors } from '@/store/task/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import { createTaskModal } from '../CreateTaskModal';
import AssigneeAvatar from '../features/AssigneeAvatar';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import Breadcrumb from '../shared/Breadcrumb';
import { taskDetailPath } from '../shared/taskDetailPath';
import CreateTaskInlineEntry from './CreateTaskInlineEntry';
import KanbanBoard from './KanbanBoard';
import type { TaskListViewOptions } from './listViewOptions';
import {
  collapseSubTasks,
  getVisibleTaskStatuses,
  normalizeTaskListViewOptions,
} from './listViewOptions';
import { shouldRenderTaskAgentPanelToggle } from './taskAgentPanelToggle';
import TaskList from './TaskList';
import TaskListVisibilityFilter from './TaskListVisibilityFilter';
import TasksGroupConfig from './TasksGroupConfig';

const styles = createStaticStyles(({ css }) => ({
  /**
   * The project issues peek pane — same 400px / layout background contract
   * the My issues detail pane holds.
   */
  detailPane: css`
    overflow-y: auto;
    flex: none;

    width: 400px;
    padding-block-end: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgLayout};
  `,
}));

interface TaskCreateActionBehaviorParams {
  canCreateTask: boolean;
  inlineCollapsed: boolean;
  /**
   * Whether the surface on screen is the board — the stored kanban mode. The
   * inline composer lives on the list surface only, so on a board the header
   * create opens the modal instead of expanding a composer that is not there.
   */
  isBoardSurface: boolean;
}

export const getTaskCreateActionBehavior = ({
  canCreateTask,
  inlineCollapsed,
  isBoardSurface,
}: TaskCreateActionBehaviorParams) => {
  const shouldExpandInline = inlineCollapsed && !isBoardSurface;

  return {
    disabled: shouldExpandInline ? false : !canCreateTask,
    mode: shouldExpandInline ? 'inline' : 'modal',
  } as const;
};

interface TaskPageHeaderVisibilityParams {
  agentId?: string;
  isMobile: boolean;
  projectId?: string;
}

export const getTaskPageHeaderVisibility = ({
  agentId,
  isMobile,
  projectId,
}: TaskPageHeaderVisibilityParams) => {
  // Projects already own their breadcrumb and details panel in the shared layout.
  const isScoped = !!agentId && !projectId;

  return {
    showBreadcrumb: isScoped,
    showTaskAgentPanelToggle: !projectId && shouldRenderTaskAgentPanelToggle(isMobile),
    // The visibility chip is the issues surface's filter entry; a project
    // scope is still a workspace list, so hiding it there was collateral of
    // the `!projectId` header gates — not intent. Agent scope stays without
    // it (its list is already scoped to one assignee).
    showVisibilityFilter: !agentId,
    showViewOptions: true,
  };
};

interface AgentTasksPageProps {
  /**
   * When provided, the page is scoped to a single agent's tasks; otherwise it
   * shows tasks across all agents.
   */
  agentId?: string;
  /** When provided, shows the complete task workspace scoped to one project. */
  projectId?: string;
  /**
   * The project's milestones — names the `?projectMilestoneId=` chip and feeds
   * the issues list's milestone grouping and row badges. Only read when
   * `projectId` is set.
   */
  projectMilestones?: readonly TaskMilestoneRef[];
}

export type TaskCollection = 'mine' | 'scheduled' | 'tasks';
/** "My tasks" sub-view: assigned to me as a member, or created by me. */
export type MyTaskScope = 'assigned' | 'created';
const COLLECTION_PAGE_SIZE = 50;

export const resolveTaskCollection = (
  searchParams: URLSearchParams,
  options: { allowMine?: boolean } = {},
): TaskCollection => {
  const value = searchParams.get('collection');
  if (value === 'scheduled') return 'scheduled';
  // The "My tasks" tab is only offered where member assignment exists; a deep
  // link into it from a scope without the tab falls back to ordinary tasks.
  if (value === 'mine' && options.allowMine) return 'mine';
  return 'tasks';
};

export const resolveMyTaskScope = (searchParams: URLSearchParams): MyTaskScope =>
  searchParams.get('scope') === 'created' ? 'created' : 'assigned';

/**
 * Keep the current page inside the range the total implies. `pageSize` is a
 * parameter rather than a module constant because the paginated collections do
 * not share one: the automations tab pages 25 at a time and "My tasks" pages
 * `COLLECTION_PAGE_SIZE`. Clamping with the wrong size snaps a reachable page
 * back to the first one.
 */
export const clampCollectionPage = (page: number, total: number, pageSize: number): number =>
  Math.min(page, Math.max(1, Math.ceil(total / pageSize)));

/**
 * View options the paginated (server-sliced) "My tasks" collection pins,
 * because a client-side reorder or cut would only ever apply to the fetched
 * page:
 * - ordering follows the server's updatedAt DESC page order. `compareTaskItems`
 *   inverts `orderDirection` for the date columns (see
 *   `effectiveOrderDirection`), so the token that renders newest-first is 'asc';
 * - every fetched row renders. With `showSubTasks: false` `TaskList` folds a
 *   child away whenever its parent shares the page, which would leave the page
 *   sparse while `total` still counts the hidden rows. Nesting (when enabled)
 *   still tucks a child under a parent that is on the same page.
 * Grouping stays client-side — it only arranges the rows of the current page.
 */
const PAGINATED_COLLECTION_VIEW = {
  orderBy: 'updatedAt',
  orderDirection: 'asc',
  showSubTasks: true,
} as const;

/**
 * "My tasks" additionally sends `hideCompleted` as a server status filter
 * (`getVisibleTaskStatuses`) rather than applying it to the fetched page.
 *
 * The automations tab is paginated too, but it renders the shared
 * `AutomationScheduleList` — its ordering, columns and narrowing all belong to
 * that surface, so this page pins no view options for it.
 */
export const getMyTaskViewOptions = (viewOptions: TaskListViewOptions): TaskListViewOptions => ({
  ...viewOptions,
  ...PAGINATED_COLLECTION_VIEW,
});

/**
 * The display controls `PAGINATED_COLLECTION_VIEW` overrides, so the config
 * panel can leave them out instead of offering a switch that changes nothing:
 * ordering follows the server page, and every fetched row renders.
 */
export const PAGINATED_COLLECTION_PINNED_OPTIONS = ['ordering', 'showSubTasks'] as const;

/**
 * Which surface a collection renders in the active view mode. Single-sourced
 * because every collection that is offered the list/board switch has to answer
 * it: "My tasks" rendered its list unconditionally while still showing the
 * switch, so picking Board did nothing at all. The scheduled tab is the one
 * collection with no switch (its config entry is hidden), so it stays a list.
 */
export const resolveTaskCollectionView = (
  collection: TaskCollection,
  viewMode: TaskViewMode,
): 'board' | 'list' => (collection !== 'scheduled' && viewMode === 'kanban' ? 'board' : 'list');

/**
 * The ordinary collection's surface follows the stored view mode alone. The
 * count must not vote: forcing the board onto an empty collection snapped
 * list-mode users onto the board, and the first added task then snapped them
 * back. Each surface renders its own empty state — the board shows its empty
 * columns, the list shows `taskList.empty` — so an empty list-mode collection
 * stays a list.
 */
export const resolveOrdinaryCollectionSurface = (viewMode: TaskViewMode): 'board' | 'list' =>
  resolveTaskCollectionView('tasks', viewMode);

const AgentTasksPage = memo<AgentTasksPageProps>(({ agentId, projectId, projectMilestones }) => {
  const { t } = useTranslation('chat');
  const projectToolbar = use(ProjectToolbarContext);
  const navigate = useWorkspaceAwareNavigate();
  const isMobile = useIsMobile();
  const { allowed: canCreateTask, reason } = usePermission('create_content');
  const storedViewMode = useGlobalStore((s) => s.status.taskListViewMode);
  // Linear parity scoped to this surface: a project's Issues collection opens
  // on the grouped list; every other collection keeps the board default. A
  // stored value is the user's own choice and always wins.
  const [searchParams, setSearchParams] = useSearchParams();
  // A project's issues narrowed to one milestone (the overview's progress
  // link; the rail's See issues opens the unfiltered list, as measured on
  // the reference). Filtered client-side over the complete list,
  // so the surface is pinned to that list: the board pages its columns on the
  // server and would show counts for the unfiltered set.
  const milestoneFilterId = projectId ? readProjectMilestoneFilter(searchParams) : undefined;
  const [collectionPage, setCollectionPage] = useState(1);
  const activeWorkspaceId = useActiveWorkspaceId();
  const mineRedirect = resolveMineCollectionRedirect({
    agentId,
    collection: searchParams.get('collection'),
    projectId,
    scope: searchParams.get('scope'),
  });
  useEffect(() => {
    if (mineRedirect) navigate(mineRedirect, { replace: true });
  }, [mineRedirect, navigate]);
  // Member assignment is a workspace concept (a task now carries a member
  // owner alongside its executor agent), so "My tasks" only earns its tab on
  // the global page of a workspace: personal mode has no members, and the
  // agent/project scopes keep their own focused lists.
  const showMineCollection = !!activeWorkspaceId && !agentId && !projectId;
  const collection = resolveTaskCollection(searchParams, { allowMine: showMineCollection });
  const isScheduledCollection = collection === 'scheduled';
  const isMineCollection = collection === 'mine';
  const isOrdinaryCollection = collection === 'tasks';
  // The generic Add-filter menu's applied clauses — `?filter=` params, the
  // same URL convention the projects list uses. Read only on a project's
  // ordinary issues tab: the param is meaningless on other scopes, and a
  // stray value on the scheduled tab must not paint chips there.
  const issueFilters = useMemo(
    () => (projectId && isOrdinaryCollection ? readProjectIssueFilters(searchParams) : []),
    [isOrdinaryCollection, projectId, searchParams],
  );
  const hasIssueFilters = issueFilters.length > 0;
  const updateIssueFilters = useCallback(
    (next: ProjectIssueFilter[]) =>
      setSearchParams(writeProjectIssueFilters(searchParams, next), { replace: true }),
    [searchParams, setSearchParams],
  );
  // Filtered surfaces pin the list for the same reason the milestone cut
  // does: the board pages columns server-side and would show counts for the
  // unfiltered set.
  const viewMode: TaskViewMode =
    milestoneFilterId || hasIssueFilters
      ? 'list'
      : (storedViewMode ?? (projectId ? 'list' : 'kanban'));
  const myTaskScope = resolveMyTaskScope(searchParams);
  // The automations tab reads the same two narrowings as the Automations page,
  // off the same query params, so a link into either door opens the same slice.
  // `scope` is shared with "My tasks"' member scoping and both read it as
  // "created by me"; switching collections clears it, so neither inherits the
  // other's reading.
  const automationScope = resolveAutomationScope(searchParams);
  const automationStatusFilter = resolveAutomationStatusFilter(searchParams);
  // "My tasks" honours the list/board switch like the ordinary tab does; the
  // board fetches its own server groups, so the paginated list fetch below is
  // gated off while it is up.
  const isBoardView = resolveTaskCollectionView(collection, viewMode) === 'board';
  const isMineBoard = isMineCollection && isBoardView;
  const useFetchTaskList = useTaskStore((s) => s.useFetchTaskList);
  // Keep the SWR handle only for `error` + `mutate` (the error/Retry state).
  // Every scope splits automated work out of the ordinary tab — it is the
  // scheduled tab's content, and listing it twice makes the split meaningless.
  // `complete`: this tab groups and sorts client-side with no pagination, so
  // it needs the whole list — one server page would drop every task older
  // than the newest 50 once the workspace grows past that. The scheduled and
  // "My tasks" tabs render their own paginated collections, so the fetch is
  // gated to the ordinary tab; and the kanban view fetches its own server
  // groups, so in board mode the list only warms a single store page.
  const isListView = !isBoardView;
  const { error, isLoading, mutate } = useFetchTaskList(
    projectId
      ? {
          automated: false,
          complete: isListView,
          enabled: isOrdinaryCollection,
          projectId,
          // No `visibility` pin: the header's visibility chip is the filter
          // entry for this scope too, so the fetch follows it like the
          // global list does.
        }
      : agentId
        ? { agentId, automated: false, complete: isListView, enabled: isOrdinaryCollection }
        : {
            allAgents: true,
            automated: false,
            complete: isListView,
            enabled: isOrdinaryCollection,
          },
  );
  // Drive the loading/empty boundary off the store's own init flag, NOT SWR's
  // per-key `data`. On a scope (agent ↔ all) or visibility switch the store
  // resets `tasks` + `isTaskListInit` together (`scopeChangeResetState`), but
  // SWR still holds cached `data` for the target key — so keying `hasSettled`
  // off SWR `data` made it `true` while `tasks` was empty and flashed the "no
  // tasks" empty during the refetch. `isTaskListInit` flips true only on the
  // current scope's success and resets in lockstep with `tasks`, so the settled
  // signal never disagrees with the emptiness signal. Still resets to false on a
  // failed first load, so we surface loading only while there's no error (below).
  const isTaskListInit = useTaskStore(taskListSelectors.isTaskListInit);
  const storeTasks = useTaskStore(taskListSelectors.taskList);
  const milestoneTasks = useMemo(
    () => (milestoneFilterId ? filterTasksByMilestone(storeTasks, milestoneFilterId) : undefined),
    [milestoneFilterId, storeTasks],
  );
  // An id no milestone answers to still narrows the list; say which id rather
  // than pretend the filter is not there.
  const milestoneFilterName =
    milestoneFilterId &&
    (projectMilestones?.find((milestone) => milestone.id === milestoneFilterId)?.name ??
      milestoneFilterId);
  // The menu's milestone picker and the header chip write the same param —
  // one state, two affordances.
  const handleMilestoneFilterChange = useCallback(
    (id: string | undefined) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set(PROJECT_MILESTONE_FILTER_PARAM, id);
      else next.delete(PROJECT_MILESTONE_FILTER_PARAM);
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );
  const clearMilestoneFilter = useCallback(
    () => handleMilestoneFilterChange(undefined),
    [handleMilestoneFilterChange],
  );
  // The surface follows the stored view mode alone; an empty collection no
  // longer snaps onto the board (see resolveOrdinaryCollectionSurface).
  const ordinarySurface = resolveOrdinaryCollectionSurface(viewMode);
  const isBoardSurface = isMineBoard || (isOrdinaryCollection && ordinarySurface === 'board');

  /* ------------------- project issues Add-filter state ------------------- */

  // Chip labels resolve through the same rosters the pickers use — fetched
  // only while a filter clause actually references them.
  const isLogin = useUserStore(authSelectors.isLogin);
  const agents = useHomeStore(homeAgentListSelectors.allAgents);
  const rosterViewOptions = normalizeTaskListViewOptions(
    useGlobalStore(systemStatusSelectors.taskListViewOptions),
  );
  const rosterAxes = projectIssueListAxes(rosterViewOptions.groupBy, rosterViewOptions.subGroupBy);
  const membersSWR = useWorkspaceMembersQuery({
    enabled:
      !!projectId &&
      !!activeWorkspaceId &&
      (hasIssueFilters ||
        rosterAxes?.groupBy === 'assignee' ||
        rosterAxes?.subGroupBy === 'assignee'),
  });
  const { data: issueLabelsData } = useClientDataSWR(
    projectId && hasIssueFilters && isLogin ? taskLabelKeys.list(isLogin, activeWorkspaceId) : null,
    () => taskLabelService.getLabels(),
  );
  const memberName = useCallback(
    (userId: string) => {
      const member = membersSWR.members?.find((item) => item.userId === userId);
      return member?.user?.fullName || member?.user?.username || userId;
    },
    [membersSWR.members],
  );
  const agentName = useCallback(
    (id: string) => agentDisplayName(agents.find((agent) => agent.id === id)) || id,
    [agents],
  );
  const labelName = useCallback(
    (id: string) => issueLabelsData?.find((label) => label.id === id)?.name ?? id,
    [issueLabelsData],
  );

  /* --------------------- selection + peek ("Open details") ------------- */

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(null);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  // The saved-view seed: project scope first, then every expressible applied
  // filter. Recomputed only when the URL filters change so NewViewModal's
  // builder state stays stable between renders.
  const viewFilterSeed = useMemo(
    () => (projectId ? projectIssuesViewFilterSeed(projectId, issueFilters) : undefined),
    [projectId, issueFilters],
  );
  // A selection is only meaningful inside the list it came from — switching
  // collection, filters or surface drops it (My issues clears on the same
  // cues).
  const issueFiltersSignature = issueFilters.map(serializeIssueFilterParam).join('|');
  useEffect(() => {
    setSelectedIdentifier(null);
  }, [collection, issueFiltersSignature, milestoneFilterId, projectId, viewMode]);
  // Peek only arms on the project issues list — board cards own their clicks.
  const peekEnabled = !!projectId && isOrdinaryCollection && ordinarySurface === 'list';
  const peekOnSelect = peekEnabled && detailsOpen;
  const openSelectedTaskPage = useCallback(() => {
    if (!selectedIdentifier) return;
    const task = storeTasks.find((item) => item.identifier === selectedIdentifier);
    navigate(taskDetailPath(selectedIdentifier, undefined, task?.name));
  }, [navigate, selectedIdentifier, storeTasks]);

  const scheduledSWR = useScheduledTaskPage({
    agentId,
    enabled: isScheduledCollection,
    page: collectionPage,
    projectId,
    scope: automationScope,
    statusFilter: automationStatusFilter,
  });
  const rawViewOptions = useGlobalStore(systemStatusSelectors.taskListViewOptions);
  const viewOptions = useMemo(() => normalizeTaskListViewOptions(rawViewOptions), [rawViewOptions]);
  // Filters and the milestone param page a work query (50 rows, then load
  // more). An unfiltered list keeps the store. Milestone has no board axis,
  // so a milestone-grouped board still uses status columns.
  const issueQueryActive = Boolean(
    projectId && isOrdinaryCollection && (issueFilters.length > 0 || milestoneFilterId),
  );
  const issueListAxes = useMemo(
    () =>
      issueQueryActive && ordinarySurface === 'list'
        ? projectIssueListAxes(viewOptions.groupBy, viewOptions.subGroupBy)
        : undefined,
    [issueQueryActive, ordinarySurface, viewOptions.groupBy, viewOptions.subGroupBy],
  );
  const issueListQuery = useMemo(
    () =>
      issueQueryActive && ordinarySurface === 'list' && projectId
        ? projectIssueWorkQuery({
            filters: issueFilters,
            groupBy: issueListAxes?.groupBy,
            hideCompleted: viewOptions.hideCompleted,
            layout: 'list',
            milestoneId: milestoneFilterId,
            projectId,
            showSubTasks: viewOptions.showSubTasks,
            sort: projectIssueListSort(viewOptions.orderBy, viewOptions.orderDirection),
            subGroupBy: issueListAxes?.subGroupBy,
          })
        : null,
    [
      issueFilters,
      issueListAxes?.groupBy,
      issueListAxes?.subGroupBy,
      issueQueryActive,
      milestoneFilterId,
      ordinarySurface,
      projectId,
      viewOptions.hideCompleted,
      viewOptions.orderBy,
      viewOptions.orderDirection,
      viewOptions.showSubTasks,
    ],
  );
  const {
    loadMoreGroupErrors: issueListGroupErrors,
    resetLoadMoreError: resetIssueListPaging,
    retryLoadMoreGroup: retryIssueListGroup,
    runLoadMoreGroup: runIssueListGroup,
  } = usePagedLoadMore();
  useEffect(() => {
    resetIssueListPaging();
  }, [issueListQuery, resetIssueListPaging]);
  const issueBoardAxis = projectIssueBoardGroupBy(viewOptions.groupBy);
  const issueBoardQuery = useMemo(
    () =>
      issueQueryActive && ordinarySurface === 'board' && projectId
        ? projectIssueWorkQuery({
            filters: issueFilters,
            groupBy: issueBoardAxis,
            hideCompleted: viewOptions.hideCompleted,
            layout: 'board',
            milestoneId: milestoneFilterId,
            projectId,
            showSubTasks: viewOptions.showSubTasks,
          })
        : null,
    [
      issueBoardAxis,
      issueFilters,
      issueQueryActive,
      milestoneFilterId,
      ordinarySurface,
      projectId,
      viewOptions.hideCompleted,
      viewOptions.showSubTasks,
    ],
  );
  const issueListPages = useProjectIssuePages(issueListQuery);
  const issueBoardPages = useProjectIssuePages(issueBoardQuery);
  const filteredIssueTasks = issueListQuery ? issueListPages.tasks : milestoneTasks;
  const serverGroupedList = Boolean(issueListQuery && issueListQuery.groupBy !== 'none');
  const issueListGroups = useMemo(() => {
    const groups = issueListPages.groups;
    if (viewOptions.showSubTasks) return groups;
    const visibleIds = new Set(
      collapseSubTasks(
        groups.flatMap((group) =>
          group.tasks.map((task) => ({ ...task, participants: task.participants ?? [] })),
        ),
      ).map((task) => task.id),
    );
    return groups.map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) => visibleIds.has(task.id)),
    }));
  }, [issueListPages.groups, viewOptions.showSubTasks]);
  const issueGroupTitle = useCallback(
    (axis: string, key: string) => {
      if (axis === 'priority') {
        const label = MY_WORK_PRIORITY_LABEL_KEYS[Number(key)] ?? MY_WORK_PRIORITY_LABEL_KEYS[0];
        return t(label as never);
      }
      if (axis === 'assignee') {
        if (key === 'none') return t('taskList.unassigned');
        return memberName(key);
      }
      if (axis === 'agent') {
        if (key === 'none') return t('taskList.unassigned');
        return agentName(key);
      }
      if (axis === 'milestone') {
        if (key === 'none') return t('taskList.noMilestone');
        return projectMilestones?.find((milestone) => milestone.id === key)?.name;
      }
      return undefined;
    },
    [agentName, memberName, projectMilestones, t],
  );
  const issueGroupRank = useCallback(
    (axis: string, key: string) => {
      if (axis !== 'milestone') return undefined;
      if (key === 'none') return Number.MAX_SAFE_INTEGER;
      const index = projectMilestones?.findIndex((milestone) => milestone.id === key) ?? -1;
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER - 1;
    },
    [projectMilestones],
  );
  const issueGroupIcon = useCallback(
    (axis: string, key: string) => {
      if (axis === 'priority') {
        return <PriorityIcon priority={key === 'none' ? 0 : Number(key)} size={14} />;
      }
      if (axis === 'milestone') return <MilestoneIcon muted={key === 'none'} size={14} />;
      if (axis === 'agent') {
        if (key === 'none') return <UnassignedAssigneeIcon kind={'human'} size={14} />;
        return <AssigneeAvatar agentId={key} size={18} />;
      }
      return undefined;
    },
    [],
  );
  const useFetchMyTaskList = useTaskStore((s) => s.useFetchMyTaskList);
  const mineSWR = useFetchMyTaskList({
    enabled: isMineCollection && !isMineBoard,
    limit: COLLECTION_PAGE_SIZE,
    offset: (collectionPage - 1) * COLLECTION_PAGE_SIZE,
    scope: myTaskScope,
    statuses: getVisibleTaskStatuses(viewOptions),
  });
  // The scheduled and "My tasks" tabs share one paginated-list shape; pick the
  // active tab's SWR handle so the pagination/empty/error plumbing is written
  // once.
  const collectionSWR = isMineCollection ? mineSWR : scheduledSWR;
  const collectionTasks = collectionSWR.data?.data ?? [];
  const collectionTasksTotal = collectionSWR.data?.total ?? 0;
  const isCollectionListInit = collectionSWR.data !== undefined;
  const myTaskViewOptions = useMemo(() => getMyTaskViewOptions(viewOptions), [viewOptions]);
  const collectionPageSize = isScheduledCollection
    ? SCHEDULED_TASKS_PAGE_SIZE
    : COLLECTION_PAGE_SIZE;
  useEffect(() => {
    if (!isCollectionListInit) return;
    setCollectionPage((page) =>
      clampCollectionPage(page, collectionTasksTotal, collectionPageSize),
    );
  }, [collectionPageSize, isCollectionListInit, collectionTasksTotal]);
  const inlineCollapsed = useGlobalStore(systemStatusSelectors.taskCreateInlineCollapsed);
  const [showTaskAgentPanel, toggleTaskAgentPanel] = useGlobalStore((s) => [
    systemStatusSelectors.showTaskAgentPanel(s),
    s.toggleTaskAgentPanel,
  ]);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const routeScope = agentId ? 'agent' : 'global';
  const setViewOptions = useCallback(
    (updater: (prev: TaskListViewOptions) => TaskListViewOptions) => {
      const normalized = normalizeTaskListViewOptions(updater(viewOptions));
      const next = {
        ...normalized,
        groupBy: normalized.groupBy === 'automationMode' ? 'status' : normalized.groupBy,
        subGroupBy: normalized.subGroupBy === 'automationMode' ? 'none' : normalized.subGroupBy,
      };
      updateSystemStatus({ taskListViewOptions: next }, 'updateTaskListViewOptions');
    },
    [updateSystemStatus, viewOptions],
  );

  const createActionBehavior = useMemo(
    () =>
      getTaskCreateActionBehavior({
        canCreateTask,
        inlineCollapsed,
        isBoardSurface,
      }),
    [canCreateTask, inlineCollapsed, isBoardSurface],
  );

  const handleCreateTask = useCallback(() => {
    if (createActionBehavior.mode === 'inline') {
      updateSystemStatus({ taskCreateInlineCollapsed: false }, 'expandTaskCreateInline');
      return;
    }

    if (!canCreateTask) return;
    createTaskModal({
      agentId,
      lockAssignee: !!agentId,
      projectId,
      onCreated: (task) => {
        navigate(taskDetailPath(task.identifier, agentId ? task.agentId : undefined, task.name));
      },
    });
  }, [agentId, canCreateTask, createActionBehavior.mode, navigate, projectId, updateSystemStatus]);

  const handleShowHiddenCompleted = useCallback(() => {
    setViewOptions((prev) => ({ ...prev, hideCompleted: false }));
  }, [setViewOptions]);

  const handleCollectionChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === 'scheduled' || value === 'mine') {
        next.set('collection', value);
      } else {
        next.delete('collection');
      }
      // The sub-view only means something inside "My tasks".
      if (value !== 'mine') next.delete('scope');
      // ...and the active/paused narrowing only means something inside the
      // automations tab, which brings its own scope from the tab itself.
      if (value !== 'scheduled') next.delete('status');
      setCollectionPage(1);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleMyTaskScopeChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === 'created') {
        next.set('scope', 'created');
      } else {
        next.delete('scope');
      }
      setCollectionPage(1);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleAutomationScopeChange = useCallback(
    (value: AutomationScope) => {
      const next = new URLSearchParams(searchParams);
      if (value === 'created') {
        next.set('scope', 'created');
      } else {
        next.delete('scope');
      }
      setCollectionPage(1);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleAutomationStatusChange = useCallback(
    (value: AutomationStatusFilter) => {
      const next = new URLSearchParams(searchParams);
      if (value === 'all') {
        next.delete('status');
      } else {
        next.set('status', value);
      }
      setCollectionPage(1);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const headerVisibility = getTaskPageHeaderVisibility({
    agentId,
    isMobile,
    projectId,
  });

  const headerLeft = (
    <div className="flex items-center gap-2">
      {headerVisibility.showBreadcrumb && <Breadcrumb />}
      <Tabs value={collection} onValueChange={handleCollectionChange}>
        <TabsList>
          <TabsTrigger value={'tasks'}>{t('taskList.title')}</TabsTrigger>
          <TabsTrigger value={'scheduled'}>{t('taskList.scheduled.title')}</TabsTrigger>
          {showMineCollection && (
            <TabsTrigger value={'mine'}>{t('taskList.mine.title')}</TabsTrigger>
          )}
        </TabsList>
      </Tabs>
      {isMineCollection && (
        <Tabs value={myTaskScope} onValueChange={handleMyTaskScopeChange}>
          <TabsList>
            <TabsTrigger value={'assigned'}>{t('taskList.mine.assigned')}</TabsTrigger>
            <TabsTrigger value={'created'}>{t('taskList.mine.created')}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {isScheduledCollection && (
        <>
          <AutomationScopeSwitch scope={automationScope} onChange={handleAutomationScopeChange} />
          <AutomationStatusSelect
            value={automationStatusFilter}
            onChange={handleAutomationStatusChange}
          />
        </>
      )}
    </div>
  );

  const pageHeader = (
    <NavHeader
      left={projectId ? undefined : headerLeft}
      right={
        <div className="flex items-center gap-1">
          {milestoneFilterName && (
            <div className="flex items-center gap-0.5">
              <div className="text-[12px] text-muted-foreground">
                {t('taskList.milestoneFilter', { name: milestoneFilterName })}
              </div>
              <ActionIcon
                icon={XIcon}
                size={'small'}
                title={t('taskList.milestoneFilterClear')}
                onClick={clearMilestoneFilter}
              />
            </div>
          )}
          {projectId && (
            <DropdownMenu
              items={[
                {
                  key: 'tasks',
                  label: t('taskList.title'),
                  onClick: () => handleCollectionChange('tasks'),
                },
                {
                  key: 'scheduled',
                  label: t('taskList.scheduled.title'),
                  onClick: () => handleCollectionChange('scheduled'),
                },
              ]}
            >
              <Button className="rounded-full" size="sm" variant="ghost">
                <ChevronDownIcon data-icon="inline-start" />
                {t(isScheduledCollection ? 'taskList.scheduled.title' : 'taskList.title')}
              </Button>
            </DropdownMenu>
          )}
          {isOrdinaryCollection && headerVisibility.showVisibilityFilter && (
            <TaskListVisibilityFilter />
          )}
          {isOrdinaryCollection && (inlineCollapsed || isBoardSurface) && (
            <ActionIcon
              disabled={createActionBehavior.disabled}
              icon={Plus}
              size={DESKTOP_HEADER_ICON_SMALL_SIZE}
              style={{ borderRadius: 9999 }}
              title={createActionBehavior.disabled ? reason : undefined}
              onClick={handleCreateTask}
            />
          )}
          {!isScheduledCollection && headerVisibility.showViewOptions && (
            <TasksGroupConfig
              milestones={projectId ? projectMilestones : undefined}
              options={viewOptions}
              pinnedOptions={isMineCollection ? PAGINATED_COLLECTION_PINNED_OPTIONS : undefined}
              setOptions={setViewOptions}
              viewMode={viewMode}
            />
          )}
          {projectId && isOrdinaryCollection && (
            <ProjectIssuesControls
              detailsOpen={detailsOpen}
              filters={issueFilters}
              milestoneId={milestoneFilterId || undefined}
              milestones={projectMilestones}
              peekEnabled={peekEnabled}
              onFiltersChange={updateIssueFilters}
              onMilestoneChange={handleMilestoneFilterChange}
              onNewView={() => setAdvancedFilterOpen(true)}
              onToggleDetails={() => setDetailsOpen((open) => !open)}
            />
          )}
          {headerVisibility.showTaskAgentPanelToggle && (
            <ToggleRightPanelButton
              hideWhenExpanded
              expand={showTaskAgentPanel}
              onToggle={() => toggleTaskAgentPanel()}
            />
          )}
        </div>
      }
      styles={{
        left: {
          paddingLeft: 4,
          gap: 8,
        },
      }}
    />
  );

  // Collaboration scope: a project board joins `project:{id}`; the global
  // workspace task page joins `workspace:{id}`; personal mode joins nothing —
  // there is no tenant to share presence with. Project rooms only exist under
  // a workspace, so without an active workspace there is no room to join.
  const collaborationRoom = activeWorkspaceId
    ? projectId
      ? { id: projectId, scope: 'project' as const }
      : { id: activeWorkspaceId, scope: 'workspace' as const }
    : null;

  return (
    <CollaborationProvider room={collaborationRoom} viewKey="tasks">
      <LinearTaskSyncProvider
        taskIds={
          isMineCollection || isScheduledCollection
            ? collectionTasks.map((task) => task.id)
            : undefined
        }
      >
        <div className="flex h-full flex-1 flex-col">
          {projectId && projectToolbar ? createPortal(pageHeader, projectToolbar) : pageHeader}
          {isMineBoard ? (
            <div
              className="flex flex-1 flex-col"
              style={{ overflowX: 'auto', overflowY: 'hidden' }}
            >
              <KanbanBoard
                myTaskScope={myTaskScope}
                options={viewOptions}
                routeScope={routeScope}
                emptyDescription={t(
                  myTaskScope === 'created'
                    ? 'taskList.mine.emptyCreated'
                    : 'taskList.mine.emptyAssigned',
                )}
                onViewAll={() =>
                  updateSystemStatus({ taskListViewMode: 'list' }, 'viewAllBoardTasks')
                }
              />
            </div>
          ) : isScheduledCollection ? (
            <WideScreenContainer fullWidth wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
              <div className="flex flex-col gap-4 px-4 py-4">
                <AutomationScheduleList
                  error={collectionSWR.error}
                  hasSettled={isCollectionListInit}
                  isFiltered={automationStatusFilter !== 'all'}
                  isLoading={!isCollectionListInit && !collectionSWR.error}
                  page={collectionPage}
                  tasks={collectionTasks}
                  total={collectionTasksTotal}
                  emptyContent={
                    <div className="flex flex-col items-center py-12">
                      <div className="text-muted-foreground">{t('taskList.scheduled.empty')}</div>
                    </div>
                  }
                  onPageChange={setCollectionPage}
                  onRefetch={() => collectionSWR.mutate()}
                />
              </div>
            </WideScreenContainer>
          ) : isMineCollection ? (
            <WideScreenContainer fullWidth wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
              <div className="flex flex-col gap-4 px-4 py-4">
                <TaskList
                  data={isCollectionListInit || undefined}
                  error={collectionSWR.error}
                  items={collectionTasks}
                  options={myTaskViewOptions}
                  routeScope={routeScope}
                  emptyDescription={t(
                    myTaskScope === 'created'
                      ? 'taskList.mine.emptyCreated'
                      : 'taskList.mine.emptyAssigned',
                  )}
                  isLoading={
                    collectionSWR.isLoading || (!isCollectionListInit && !collectionSWR.error)
                  }
                  onRetry={() => collectionSWR.mutate()}
                />
                {(collectionTasksTotal > COLLECTION_PAGE_SIZE || collectionPage > 1) && (
                  <div className="flex justify-center py-2">
                    <TablePagination
                      current={collectionPage}
                      pageSize={COLLECTION_PAGE_SIZE}
                      pageSizeOptions={[COLLECTION_PAGE_SIZE]}
                      total={collectionTasksTotal}
                      onChange={(page) => setCollectionPage(page)}
                    />
                  </div>
                )}
              </div>
            </WideScreenContainer>
          ) : ordinarySurface === 'board' ? (
            <div
              className="flex flex-1 flex-col"
              style={{ overflowX: 'auto', overflowY: 'hidden' }}
            >
              <KanbanBoard
                agentId={agentId}
                options={viewOptions}
                projectId={projectId}
                routeScope={routeScope}
                external={
                  issueBoardQuery
                    ? {
                        error: issueBoardPages.error,
                        groups: workQueryBoardGroups(issueBoardPages.groups, issueBoardAxis),
                        isLoading: issueBoardPages.isLoading,
                        onLoadMoreGroup: (columnKey) => {
                          const key = workQuerySourceKeysForKanbanColumn(
                            issueBoardAxis,
                            columnKey,
                          )[0];
                          if (key) void issueBoardPages.loadMoreGroup(key);
                        },
                        onRefresh: () => issueBoardPages.refresh(),
                        queryGroupBy: issueBoardAxis,
                        settled: issueBoardPages.settled || Boolean(issueBoardPages.error),
                      }
                    : undefined
                }
                onViewAll={() =>
                  updateSystemStatus({ taskListViewMode: 'list' }, 'viewAllBoardTasks')
                }
              />
            </div>
          ) : (
            <div className="flex flex-1" style={{ minHeight: 0, minWidth: 0 }}>
              <WideScreenContainer fullWidth wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
                <div className="flex flex-col gap-4 px-4 py-4">
                  {projectId && (
                    <IssueFilterChips
                      agentName={agentName}
                      filters={issueFilters}
                      labelName={labelName}
                      memberName={memberName}
                      onClearAll={() => updateIssueFilters([])}
                      onRemove={(key) =>
                        updateIssueFilters(removeProjectIssueFilter(issueFilters, key))
                      }
                    />
                  )}
                  {!inlineCollapsed && (
                    <CreateTaskInlineEntry
                      agentId={agentId}
                      lockAssignee={!!agentId}
                      projectId={projectId}
                    />
                  )}
                  {serverGroupedList ? (
                    issueListPages.error && issueListGroups.length === 0 ? (
                      <AsyncError
                        error={issueListPages.error}
                        variant={'block'}
                        onRetry={() => issueListPages.refresh()}
                      />
                    ) : (
                      <WorkQueryResults
                        nestInGroups
                        axisKeyRank={issueGroupRank}
                        emptyLabel={t('taskList.empty')}
                        flatNested={viewOptions.showSubTasks && viewOptions.nestedSubTasks}
                        groupBy={issueListQuery?.groupBy}
                        groupIcon={issueGroupIcon}
                        groupTitle={issueGroupTitle}
                        groups={issueListGroups}
                        layout={'list'}
                        loadMoreGroupErrors={issueListGroupErrors}
                        loadMoreLabel={t('topicComment.loadMore')}
                        loadingLabel={t('taskList.filter.loading')}
                        peekOnSelect={peekOnSelect}
                        selectedTaskId={selectedIdentifier ?? undefined}
                        subGroupBy={issueListQuery?.subGroupBy}
                        tasks={issueListPages.tasks}
                        total={issueListPages.total}
                        loading={
                          issueListPages.isLoading ||
                          (!issueListPages.settled && !issueListPages.error)
                        }
                        milestoneFor={(task) =>
                          viewOptions.showMilestone && task.projectMilestoneId
                            ? projectMilestones?.find(
                                (milestone) => milestone.id === task.projectMilestoneId,
                              )
                            : undefined
                        }
                        onRetryLoadMoreGroup={retryIssueListGroup}
                        onSelectTask={(task) => setSelectedIdentifier(task.identifier)}
                        onLoadMoreGroup={(key) =>
                          runIssueListGroup(key, () => issueListPages.loadMoreGroup(key))
                        }
                        onOpenTask={(task) =>
                          navigate(taskDetailPath(task.identifier, undefined, task.name))
                        }
                      />
                    )
                  ) : (
                    <TaskList
                      error={issueListQuery ? issueListPages.error : error}
                      items={filteredIssueTasks}
                      milestones={projectId ? projectMilestones : undefined}
                      options={viewOptions}
                      peekOnSelect={peekOnSelect}
                      routeScope={routeScope}
                      selectedIdentifier={selectedIdentifier ?? undefined}
                      data={
                        issueListQuery
                          ? issueListPages.settled || undefined
                          : isTaskListInit || undefined
                      }
                      isLoading={
                        issueListQuery
                          ? issueListPages.isLoading ||
                            (!issueListPages.settled && !issueListPages.error)
                          : isLoading || (!isTaskListInit && !error)
                      }
                      onRetry={() => (issueListQuery ? issueListPages.refresh() : mutate())}
                      onSelectTask={(task) => setSelectedIdentifier(task.identifier)}
                      onShowHiddenCompleted={handleShowHiddenCompleted}
                      onOpenTask={(task) =>
                        navigate(taskDetailPath(task.identifier, undefined, task.name))
                      }
                    />
                  )}
                  {issueListQuery && !serverGroupedList && issueListPages.hasMore ? (
                    <div className="flex justify-center py-2">
                      <Button
                        disabled={issueListPages.loadingMore}
                        variant="outline"
                        onClick={() => void issueListPages.loadMore()}
                      >
                        {t('topicComment.loadMore')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </WideScreenContainer>
              {peekOnSelect && (
                <div className={styles.detailPane}>
                  <IssueDetailPane
                    identifier={selectedIdentifier}
                    onClose={() => setDetailsOpen(false)}
                    onOpen={openSelectedTaskPage}
                  />
                </div>
              )}
            </div>
          )}
          <CollaborationOverlay />
          {projectId && viewFilterSeed && (
            <NewViewModal
              defaultEntityType={'task'}
              open={advancedFilterOpen}
              seedFilter={viewFilterSeed}
              onClose={() => setAdvancedFilterOpen(false)}
            />
          )}
        </div>
      </LinearTaskSyncProvider>
    </CollaborationProvider>
  );
});

export default AgentTasksPage;
