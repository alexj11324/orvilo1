import { Flexbox } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  DropdownMenu,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
} from '@lobehub/ui/base-ui';
import { Pagination } from 'antd';
import { ChevronDownIcon, Plus } from 'lucide-react';
import { memo, use, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
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
import NavHeader from '@/features/NavHeader';
import { ProjectToolbarContext } from '@/features/Projects/Layout/ProjectToolbarContext';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePermission } from '@/hooks/usePermission';
import { useGlobalStore } from '@/store/global';
import type { TaskViewMode } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useTaskStore } from '@/store/task';
import { taskListSelectors } from '@/store/task/selectors';

import { createTaskModal } from '../CreateTaskModal';
import Breadcrumb from '../shared/Breadcrumb';
import { taskDetailPath } from '../shared/taskDetailPath';
import CreateTaskInlineEntry from './CreateTaskInlineEntry';
import KanbanBoard from './KanbanBoard';
import type { TaskListViewOptions } from './listViewOptions';
import { getVisibleTaskStatuses, normalizeTaskListViewOptions } from './listViewOptions';
import { shouldRenderTaskAgentPanelToggle } from './taskAgentPanelToggle';
import TaskList from './TaskList';
import TaskListVisibilityFilter from './TaskListVisibilityFilter';
import TasksGroupConfig from './TasksGroupConfig';

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

const AgentTasksPage = memo<AgentTasksPageProps>(({ agentId, projectId }) => {
  const { t } = useTranslation('chat');
  const projectToolbar = use(ProjectToolbarContext);
  const navigate = useWorkspaceAwareNavigate();
  const isMobile = useIsMobile();
  const { allowed: canCreateTask, reason } = usePermission('create_content');
  const storedViewMode = useGlobalStore((s) => s.status.taskListViewMode);
  // Linear parity scoped to this surface: a project's Issues collection opens
  // on the grouped list; every other collection keeps the board default. A
  // stored value is the user's own choice and always wins.
  const viewMode = storedViewMode ?? (projectId ? 'list' : 'kanban');
  const [searchParams, setSearchParams] = useSearchParams();
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
          visibility: 'all',
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
  // The surface follows the stored view mode alone; an empty collection no
  // longer snaps onto the board (see resolveOrdinaryCollectionSurface).
  const ordinarySurface = resolveOrdinaryCollectionSurface(viewMode);
  const isBoardSurface = isMineBoard || (isOrdinaryCollection && ordinarySurface === 'board');
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
    <Flexbox horizontal align={'center'} gap={8}>
      {headerVisibility.showBreadcrumb && <Breadcrumb />}
      <TabsRoot size={'small'} value={collection} onValueChange={handleCollectionChange}>
        <TabsList>
          <TabsIndicator />
          <TabsTab value={'tasks'}>{t('taskList.title')}</TabsTab>
          <TabsTab value={'scheduled'}>{t('taskList.scheduled.title')}</TabsTab>
          {showMineCollection && <TabsTab value={'mine'}>{t('taskList.mine.title')}</TabsTab>}
        </TabsList>
      </TabsRoot>
      {isMineCollection && (
        <TabsRoot size={'small'} value={myTaskScope} onValueChange={handleMyTaskScopeChange}>
          <TabsList>
            <TabsIndicator />
            <TabsTab value={'assigned'}>{t('taskList.mine.assigned')}</TabsTab>
            <TabsTab value={'created'}>{t('taskList.mine.created')}</TabsTab>
          </TabsList>
        </TabsRoot>
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
    </Flexbox>
  );

  const pageHeader = (
    <NavHeader
      left={projectId ? undefined : headerLeft}
      right={
        <Flexbox horizontal align={'center'} gap={4}>
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
              <Button icon={ChevronDownIcon} size={'small'} type={'text'}>
                {t(isScheduledCollection ? 'taskList.scheduled.title' : 'taskList.title')}
              </Button>
            </DropdownMenu>
          )}
          {isOrdinaryCollection && !agentId && !projectId && <TaskListVisibilityFilter />}
          {isOrdinaryCollection && (inlineCollapsed || isBoardSurface) && (
            <ActionIcon
              disabled={createActionBehavior.disabled}
              icon={Plus}
              size={DESKTOP_HEADER_ICON_SMALL_SIZE}
              title={createActionBehavior.disabled ? reason : undefined}
              onClick={handleCreateTask}
            />
          )}
          {!isScheduledCollection && headerVisibility.showViewOptions && (
            <TasksGroupConfig
              options={viewOptions}
              pinnedOptions={isMineCollection ? PAGINATED_COLLECTION_PINNED_OPTIONS : undefined}
              setOptions={setViewOptions}
              viewMode={viewMode}
            />
          )}
          {headerVisibility.showTaskAgentPanelToggle && (
            <ToggleRightPanelButton
              hideWhenExpanded
              expand={showTaskAgentPanel}
              onToggle={() => toggleTaskAgentPanel()}
            />
          )}
        </Flexbox>
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
        <Flexbox flex={1} height={'100%'}>
          {projectId && projectToolbar ? createPortal(pageHeader, projectToolbar) : pageHeader}
          {isMineBoard ? (
            <Flexbox flex={1} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
              <KanbanBoard
                myTaskScope={myTaskScope}
                options={viewOptions}
                routeScope={routeScope}
                emptyDescription={t(
                  myTaskScope === 'created'
                    ? 'taskList.mine.emptyCreated'
                    : 'taskList.mine.emptyAssigned',
                )}
              />
            </Flexbox>
          ) : isScheduledCollection ? (
            <WideScreenContainer
              fullWidth
              gap={16}
              paddingBlock={16}
              paddingInline={16}
              wrapperStyle={{ flex: 1, overflowY: 'auto' }}
            >
              <AutomationScheduleList
                error={collectionSWR.error}
                hasSettled={isCollectionListInit}
                isFiltered={automationStatusFilter !== 'all'}
                isLoading={!isCollectionListInit && !collectionSWR.error}
                page={collectionPage}
                tasks={collectionTasks}
                total={collectionTasksTotal}
                emptyContent={
                  <Flexbox align={'center'} paddingBlock={48}>
                    <Text type={'secondary'}>{t('taskList.scheduled.empty')}</Text>
                  </Flexbox>
                }
                onPageChange={setCollectionPage}
                onRefetch={() => collectionSWR.mutate()}
              />
            </WideScreenContainer>
          ) : isMineCollection ? (
            <WideScreenContainer
              fullWidth
              gap={16}
              paddingBlock={16}
              paddingInline={16}
              wrapperStyle={{ flex: 1, overflowY: 'auto' }}
            >
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
                <Flexbox horizontal justify={'center'} paddingBlock={8}>
                  <Pagination
                    current={collectionPage}
                    pageSize={COLLECTION_PAGE_SIZE}
                    showSizeChanger={false}
                    total={collectionTasksTotal}
                    onChange={setCollectionPage}
                  />
                </Flexbox>
              )}
            </WideScreenContainer>
          ) : ordinarySurface === 'board' ? (
            <Flexbox flex={1} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
              <KanbanBoard
                agentId={agentId}
                options={viewOptions}
                projectId={projectId}
                routeScope={routeScope}
              />
            </Flexbox>
          ) : (
            <WideScreenContainer
              fullWidth
              gap={16}
              paddingBlock={16}
              paddingInline={16}
              wrapperStyle={{ flex: 1, overflowY: 'auto' }}
            >
              {!inlineCollapsed && (
                <CreateTaskInlineEntry
                  agentId={agentId}
                  lockAssignee={!!agentId}
                  projectId={projectId}
                />
              )}
              <TaskList
                data={isTaskListInit || undefined}
                error={error}
                isLoading={isLoading || (!isTaskListInit && !error)}
                options={viewOptions}
                routeScope={routeScope}
                onRetry={() => mutate()}
                onShowHiddenCompleted={handleShowHiddenCompleted}
              />
            </WideScreenContainer>
          )}
          <CollaborationOverlay />
        </Flexbox>
      </LinearTaskSyncProvider>
    </CollaborationProvider>
  );
});

export default AgentTasksPage;
