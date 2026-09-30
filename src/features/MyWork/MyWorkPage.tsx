'use client';

import {
  type MyWorkMode,
  normalizeWorkQuerySubGroupBy,
  type TaskStatus,
  type WorkQueryLayout,
} from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import AsyncError from '@/components/AsyncError';
import IssueRowChip from '@/components/IssueRowChip';
import { confirmModal } from '@/components/Modal';
import { PriorityIcon } from '@/components/PriorityIcon';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Tabs as TabsRoot, TabsList, TabsTrigger as TabsTab } from '@/components/ui/tabs';
import { COLUMN_I18N_KEYS } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { COLUMN_STATUS_VISUAL } from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import AssigneeUserAvatar from '@/features/AgentTasks/features/AssigneeUserAvatar';
import { useTaskStatusChange } from '@/features/AgentTasks/features/useTaskStatusChange';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import {
  builderToFilter,
  filterToBuilder,
  stableStringify,
} from '@/features/SavedViews/workQueryBuilder';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { inboxPriorityScopeKey } from '@/features/WorkInbox/inboxPriority';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';
import { usePermission } from '@/hooks/usePermission';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { useCacheScope } from '@/libs/swr/useCacheScope';
import { lambdaClient } from '@/libs/trpc/client';
import { taskService } from '@/services/task';
import { workAttentionService } from '@/services/workAttention';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import BulkActionsBar from './BulkActionsBar';
import type { BulkSelectGesture } from './bulkSelection';
import MyWorkControls from './MyWorkControls';
import {
  activityBucketTitle,
  completedWindowQueryFilter,
  filterMyWorkTaskRows,
  isMyWorkClientGrouping,
  MY_WORK_PRIORITY_LABEL_KEYS,
  MY_WORK_ROW_PROPERTIES,
  type MyWorkDisplay,
  myWorkListGroupingOptions,
  myWorkOrderingOptions,
  myWorkPriorityGroupRank,
  type MyWorkRowProperty,
  myWorkServerGroupBy,
  myWorkStatusGroupRank,
  normalizeMyWorkDisplay,
  sortTasksByImportance,
  workQueryActivitySections,
  workQueryFieldSections,
} from './myWorkDisplay';
import {
  EMPTY_FILTER_BUILDER,
  mergeWorkQueryFilters,
  myWorkActiveFilterCount,
  myWorkComposedQuery,
  parseWorkQueryFilterParam,
  serializeWorkQueryFilterParam,
} from './myWorkFilters';
import MyWorkIssuePane from './MyWorkIssuePane';
import { isMyWorkSaveableMode } from './myWorkSaveAs';
import { isTaskFollowed } from './myWorkSubscribe';
import { useBulkSelection } from './useBulkSelection';
import { isMyWorkBoardMode, workQueryListGroupBy } from './workQueryBoard';
import { applyWorkQueryStatusChange } from './workQueryBoardMove';
import {
  mergeWorkQueryGroups,
  mergeWorkQueryPage,
  workQueryResponseGroups,
  workQueryResponseTasks,
  type WorkQueryResultTask,
} from './workQueryPaging';
import WorkQueryResults from './WorkQueryResults';

const styles = createStaticStyles(({ css }) => ({
  /**
   * Peek layout mirrors the saved-view page: list keeps its flexible width,
   * the detail pane is a fixed 400px column that overlays under 900px of
   * surface width (Linear's My issues proportions).
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

    background: ${cssVar.colorBgContainer};

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
}));

// Board mode bounds the collection body to the scrollport so the kanban's own
// column scrollers engage; list mode lets the body grow and the scroll host
// stays the single scroll owner. The split pane uses the same bounding so
// each side owns its own scroll.
const boundedBodyStyle = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  paddingBlock: 0,
  paddingInline: 0,
} as const;

const listBodyStyle = { paddingInline: 0 } as const;

/**
 * My issues tabs (v5 contract): Assigned / Created / Subscribed / Activity.
 * Delegation is a filter chip (`?delegated=1`), never a tab; review work
 * lives on `/reviews` — the `/my-work` route redirect already maps the old
 * `tab=delegated|review` deep links.
 */
const MY_ISSUES_TABS: MyWorkMode[] = ['assigned', 'created', 'subscribed', 'activity'];

const resolveMode = (value: string | null): MyWorkMode => {
  if (value === 'delegated') return 'activity';
  if (value && (MY_ISSUES_TABS as readonly string[]).includes(value)) {
    return value as MyWorkMode;
  }
  return 'assigned';
};

const resolveLayout = (mode: MyWorkMode, value: string | null): WorkQueryLayout => {
  if (!isMyWorkBoardMode(mode)) return 'list';
  return value === 'board' ? 'board' : 'list';
};

/**
 * Hydrates one project's detail into the `projectDetails` cache so a row's
 * `projectMilestoneId` can resolve to the `◆ name · date` badge. Rendered
 * once per referenced project — hooks cannot loop, so each id gets a child.
 */
const MilestoneCatalogProject = memo<{ id: string }>(({ id }) => {
  useProjectStore((s) => s.useFetchProjectDetail)(id);
  return null;
});

MilestoneCatalogProject.displayName = 'MilestoneCatalogProject';

const MyWorkPage = memo(() => {
  const { t, i18n } = useTranslation(['common', 'chat']);
  const workspaceId = useActiveWorkspaceId();
  const workspaceSlug = useActiveWorkspaceSlug();
  const navigate = useWorkspaceAwareNavigate();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const mode = resolveMode(rawTab);
  const layout = resolveLayout(mode, searchParams.get('layout'));
  const noProject = searchParams.get('noProject') === '1';
  // `tab=delegated` implies the delegated filter even when `delegated=1` is
  // absent — the redirect writes both, this keeps hand-built URLs honest.
  const delegated = searchParams.get('delegated') === '1' || rawTab === 'delegated';
  const canBoard = isMyWorkBoardMode(mode);
  const boardActive = canBoard && layout === 'board';

  /* ----------------------- display options + filters ---------------------- */

  // Per-tab display state persisted in SystemStatus — Linear keeps these per
  // tab server-side; the work-query API exposes no preference store, so the
  // local store stands in under the same `userId:workspaceId` scope key the
  // inbox prefs use.
  const viewScopeKey = inboxPriorityScopeKey({ userId: currentUserId, workspaceId });
  const persistedViews = useGlobalStore(systemStatusSelectors.myWorkViewOptions(viewScopeKey));
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const display = useMemo(
    () => normalizeMyWorkDisplay(mode, persistedViews?.[mode]),
    [mode, persistedViews],
  );
  const setDisplay = useCallback(
    (patch: Partial<MyWorkDisplay>) => {
      updateSystemStatus({
        myWorkViewOptions: {
          [viewScopeKey]: { [mode]: normalizeMyWorkDisplay(mode, { ...display, ...patch }) },
        },
      });
    },
    [display, mode, updateSystemStatus, viewScopeKey],
  );

  // Filter-builder rows, also per tab. The applied AST lives in `?filter=`
  // so reload and Back/forward restore it. Delegated stays on the mode query.
  const filterParam = searchParams.get('filter');
  const [builderByMode, setBuilderByMode] = useState<Partial<Record<MyWorkMode, BuilderState>>>(
    () => {
      if (!isMyWorkSaveableMode(mode)) return {};
      const parsed = parseWorkQueryFilterParam(filterParam);
      return parsed ? { [mode]: filterToBuilder('task', parsed) } : {};
    },
  );
  const builder = builderByMode[mode] ?? EMPTY_FILTER_BUILDER;
  const filterSupported = isMyWorkSaveableMode(mode);
  useEffect(() => {
    if (!filterSupported) return;
    const parsed = parseWorkQueryFilterParam(filterParam);
    setBuilderByMode((current) => {
      const existing = current[mode] ?? EMPTY_FILTER_BUILDER;
      if (stableStringify(builderToFilter('task', existing)) === stableStringify(parsed)) {
        return current;
      }
      return { ...current, [mode]: filterToBuilder('task', parsed) };
    });
  }, [filterParam, filterSupported, mode]);
  const setBuilder = useCallback(
    (next: BuilderState) => {
      setBuilderByMode((current) => ({ ...current, [mode]: next }));
      if (!filterSupported) return;
      const serialized = serializeWorkQueryFilterParam(builderToFilter('task', next));
      if ((serialized ?? null) === (filterParam ?? null)) return;
      const params = new URLSearchParams(searchParams);
      if (serialized) params.set('filter', serialized);
      else params.delete('filter');
      setSearchParams(params, { replace: true });
    },
    [filterParam, filterSupported, mode, searchParams, setSearchParams],
  );
  const builderFilter = filterSupported ? builderToFilter('task', builder) : undefined;
  const activeFilterCount = myWorkActiveFilterCount(builder);

  const serverGroupBy = myWorkServerGroupBy(display, layout);
  const boardLane =
    layout === 'board'
      ? normalizeWorkQuerySubGroupBy(
          display.boardGrouping,
          display.boardLane === 'none' ? undefined : display.boardLane,
        )
      : undefined;
  const queryFilter = mergeWorkQueryFilters(
    builderFilter,
    completedWindowQueryFilter(display.completed),
  );
  // A non-default ordering needs the generic endpoint. Filters, the completed
  // window, priority/assignee columns and swimlanes ride `myWork` so the
  // follow bells stay on the mode feed.
  const composedQuery = useMemo(
    () =>
      display.ordering !== 'default'
        ? myWorkComposedQuery({
            completed: display.completed,
            delegated,
            filter: builderFilter,
            groupBy: serverGroupBy,
            layout,
            mode,
            noProject,
            ordering: display.ordering,
            subGroupBy: boardLane,
          })
        : null,
    [
      boardLane,
      builderFilter,
      delegated,
      display.completed,
      display.ordering,
      layout,
      mode,
      noProject,
      serverGroupBy,
    ],
  );

  /* -------------------------------- fetch --------------------------------- */

  // One feed powers both layouts: list rows and the board's external groups
  // come from the same work query, so the two never disagree. The key carries
  // the resolved grouping + composed query so option changes refetch.
  const pageLimit = boardLane ? 10 : undefined;
  const swrKey = useMemo(
    () => [
      'workAttention:myWork',
      workspaceId,
      mode,
      layout,
      noProject,
      delegated,
      serverGroupBy,
      boardLane ?? '',
      stableStringify(queryFilter ?? null),
      composedQuery ? stableStringify(composedQuery) : '',
    ],
    [
      boardLane,
      composedQuery,
      delegated,
      layout,
      mode,
      noProject,
      queryFilter,
      serverGroupBy,
      workspaceId,
    ],
  );
  const { data, error, isLoading } = useClientDataSWR(swrKey, () =>
    composedQuery
      ? workAttentionService.query({
          limit: pageLimit,
          query: composedQuery,
        })
      : workAttentionService.myWork({
          delegated,
          filter: queryFilter,
          groupBy: serverGroupBy,
          layout,
          limit: pageLimit,
          mode,
          noProject,
          subGroupBy: boardLane,
        }),
  );
  const firstTasks = workQueryResponseTasks<WorkQueryResultTask>(data?.data);
  const firstGroups = workQueryResponseGroups<WorkQueryResultTask>(data?.data);
  const queryHash = data?.data.queryHash;
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  const [taskTail, setTaskTail] = useState<typeof firstTasks>([]);
  const [extraSubscribed, setExtraSubscribed] = useState<string[]>([]);
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
    setGroupTail([]);
    setTaskTail([]);
    setExtraSubscribed([]);
    resetLoadMoreError();
  }, [
    boardLane,
    delegated,
    layout,
    mode,
    noProject,
    queryFilter,
    queryHash,
    resetLoadMoreError,
    serverGroupBy,
    workspaceId,
  ]);
  const tasks = mergeWorkQueryPage(firstTasks, taskTail);
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);
  // The generic query endpoint does not return subscription state — the
  // follow bells degrade to "unfollowed" on a filtered/ordered feed.
  const subscribedTaskIds = [
    ...((data?.data as { subscribedTaskIds?: string[] } | undefined)?.subscribedTaskIds ?? []),
    ...extraSubscribed,
  ];
  const canSaveAs = isMyWorkSaveableMode(mode);

  const refresh = useCallback(async () => {
    setGroupTail([]);
    setTaskTail([]);
    await mutate(swrKey);
  }, [swrKey]);

  /** Page the next batch for either endpoint — same cursor contract. */
  const fetchNextPage = useCallback(
    async (input: { afterId: string; groupKey?: string }) =>
      composedQuery
        ? workAttentionService.query({
            afterId: input.afterId,
            groupKey: input.groupKey,
            limit: pageLimit,
            query: composedQuery,
            queryHash,
          })
        : workAttentionService.myWork({
            afterId: input.afterId,
            delegated,
            filter: queryFilter,
            groupBy: serverGroupBy,
            groupKey: input.groupKey,
            layout,
            limit: pageLimit,
            mode,
            noProject,
            queryHash,
            subGroupBy: boardLane,
          }),
    [
      boardLane,
      composedQuery,
      delegated,
      layout,
      mode,
      noProject,
      pageLimit,
      queryFilter,
      queryHash,
      serverGroupBy,
    ],
  );

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash) return;
      const next = await fetchNextPage({ afterId: last.id, groupKey });
      setGroupTail((current) =>
        mergeWorkQueryGroups(current, workQueryResponseGroups<WorkQueryResultTask>(next.data)),
      );
      setExtraSubscribed((current) => [
        ...current,
        ...((next.data as { subscribedTaskIds?: string[] }).subscribedTaskIds ?? []),
      ]);
    },
    [fetchNextPage, groups, queryHash],
  );

  // Flat lists page by the last row's id — needed now that Created/Subscribed
  // default to `none` grouping instead of per-status groups.
  const loadMore = useCallback(async () => {
    const last = tasks.at(-1);
    if (!last || !queryHash) return;
    const next = await fetchNextPage({ afterId: last.id });
    setTaskTail((current) =>
      mergeWorkQueryPage(current, workQueryResponseTasks<WorkQueryResultTask>(next.data)),
    );
    setExtraSubscribed((current) => [
      ...current,
      ...((next.data as { subscribedTaskIds?: string[] }).subscribedTaskIds ?? []),
    ]);
  }, [fetchNextPage, queryHash, tasks]);

  /* ----------------------------- display pass ----------------------------- */

  // Display filters (completed window, sub-issues, triage) and Assigned's
  // importance ordering are presentation-only passes over the loaded page.
  const importanceOrdered = mode === 'assigned' && display.ordering === 'default' && !boardActive;
  const displayTasks = useMemo(() => {
    const filtered = filterMyWorkTaskRows(tasks, display);
    return importanceOrdered ? sortTasksByImportance(filtered) : filtered;
  }, [display, importanceOrdered, tasks]);
  // Sub-issues and triage stay a client pass. Their hiding must not replace
  // the server total — the completed window is already a query predicate.
  const displayGroups = useMemo(
    () =>
      groups.map((group) => {
        const filteredTasks = filterMyWorkTaskRows(group.tasks, display);
        return {
          ...group,
          tasks: importanceOrdered ? sortTasksByImportance(filteredTasks) : filteredTasks,
        };
      }),
    [display, groups, importanceOrdered],
  );

  /* --------------------------- selection + peek --------------------------- */

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<WorkQueryResultTask | null>(null);
  // A selection is only meaningful inside the list it came from — switching
  // tabs, layout or the effective query drops it.
  useEffect(() => {
    setSelected(null);
  }, [mode, layout, serverGroupBy, queryHash]);

  const peekOnSelect = detailsOpen && !boardActive;
  const detailVisible = peekOnSelect && selected !== null;
  const openTaskPage = useCallback(
    (task: Pick<WorkQueryResultTask, 'identifier' | 'name'>) => {
      navigate(taskDetailPath(task.identifier, undefined, task.name));
    },
    [navigate],
  );

  /* ---------------------------- bulk selection ---------------------------- */

  const changeTaskStatus = useTaskStatusChange();
  const { allowed: canBulkEdit } = usePermission('create_content');

  // Rendered-row ids — the selection prunes to this set and bulk actions
  // resolve their task objects through it, so invisible rows are never
  // selected on or mutated.
  const { bulkTaskById, visibleTaskIds } = useMemo(() => {
    const ids = new Set<string>();
    const byId = new Map<string, WorkQueryResultTask>();
    const add = (task: WorkQueryResultTask) => {
      ids.add(task.id);
      if (!byId.has(task.id)) byId.set(task.id, task);
    };
    displayTasks.forEach(add);
    displayGroups.forEach((group) => group.tasks.forEach(add));
    return { bulkTaskById: byId, visibleTaskIds: ids };
  }, [displayGroups, displayTasks]);

  const {
    applyGesture: applyBulkGesture,
    clear: clearBulk,
    count: bulkCount,
    selectedIds: bulkSelectedIds,
  } = useBulkSelection({
    resetKey: `${mode}:${layout}:${serverGroupBy}:${queryHash ?? ''}`,
    visibleIds: visibleTaskIds,
  });
  // List layout only — the board's cards keep their own drag contract.
  const bulkEnabled = layout === 'list' && canBulkEdit;
  const bulkTasks = useMemo(
    () =>
      [...bulkSelectedIds]
        .map((id) => bulkTaskById.get(id))
        .filter((task): task is WorkQueryResultTask => Boolean(task)),
    [bulkSelectedIds, bulkTaskById],
  );

  const handleBulkSelect = useCallback(
    (task: WorkQueryResultTask, gesture: BulkSelectGesture, orderedRowIds: string[]) => {
      applyBulkGesture(task.id, gesture, orderedRowIds);
    },
    [applyBulkGesture],
  );

  const [bulkBusy, setBulkBusy] = useState(false);
  // One mutation per selected task, sequentially: a Linear-linked status move
  // can surface a per-task workflow-state picker or a subtask-cascade modal —
  // parallel runs would stack them. Afterwards the feed refetches once and a
  // single toast reports applied vs failed.
  const runBulk = useCallback(
    async (
      apply: (task: WorkQueryResultTask) => Promise<unknown>,
      doneKey: 'myWork.bulk.deleted' | 'myWork.bulk.updated',
    ) => {
      if (bulkBusy) return;
      const targets = bulkTasks;
      if (targets.length === 0) return;
      setBulkBusy(true);
      let failed = 0;
      for (const task of targets) {
        try {
          await apply(task);
        } catch (mutationError) {
          failed += 1;
          console.error('[MyWork] bulk action failed for', task.identifier, mutationError);
        }
      }
      setBulkBusy(false);
      await refresh();
      if (failed === 0) {
        toast.success(t(doneKey, { count: targets.length }));
      } else {
        toast.error(t('myWork.bulk.failed', { failed, total: targets.length }));
      }
    },
    [bulkBusy, bulkTasks, refresh, t],
  );

  // Status writes reuse the row path: Linear-linked tasks go through
  // `moveBoard` (state picker included), unlinked ones through `task.update`.
  // Attention/flat groupings write `status`, matching the rows' own choice.
  const bulkStatusGroupBy =
    workQueryListGroupBy(data?.data.groupBy) === 'workflowCategory' ? 'workflowCategory' : 'status';

  const bulkSetStatus = useCallback(
    (status: TaskStatus) =>
      void runBulk(
        (task) =>
          applyWorkQueryStatusChange({
            changeLocal: changeTaskStatus,
            groupBy: bulkStatusGroupBy,
            status,
            task,
          }),
        'myWork.bulk.updated',
      ),
    [bulkStatusGroupBy, changeTaskStatus, runBulk],
  );

  const bulkSetPriority = useCallback(
    (priority: number) =>
      void runBulk((task) => taskService.update(task.id, { priority }), 'myWork.bulk.updated'),
    [runBulk],
  );

  const bulkSetAssignee = useCallback(
    (userId: string | null) =>
      void runBulk(
        (task) =>
          taskService.update(task.id, {
            assigneeUserId: userId,
            expectedDomainRevision: task.domainRevision,
          }),
        'myWork.bulk.updated',
      ),
    [runBulk],
  );

  // The member picker no-ops the option matching `currentUserId`. A shared
  // assignee shows as current; a mixed selection reports a sentinel so every
  // option — including Unassigned — stays actionable.
  const bulkAssigneeCurrentId = useMemo(() => {
    if (bulkTasks.length === 0) return undefined;
    const first = bulkTasks[0].assigneeUserId ?? null;
    return bulkTasks.every((task) => (task.assigneeUserId ?? null) === first)
      ? first
      : '__bulk_mixed__';
  }, [bulkTasks]);

  const bulkDelete = useCallback(() => {
    const count = bulkTasks.length;
    if (count === 0) return;
    confirmModal({
      cancelText: t('cancel'),
      content: t('myWork.bulk.deleteConfirmContent', { count }),
      okButtonProps: { danger: true },
      okText: t('delete'),
      title: t('myWork.bulk.deleteConfirmTitle', { count }),
      onOk: async () => {
        await runBulk((task) => taskService.delete(task.id), 'myWork.bulk.deleted');
        clearBulk();
      },
    });
  }, [bulkTasks.length, clearBulk, runBulk, t]);

  const bulkBar =
    bulkEnabled && bulkCount > 0 ? (
      <BulkActionsBar
        assigneeCurrentId={bulkAssigneeCurrentId}
        busy={bulkBusy}
        count={bulkCount}
        onAssignee={bulkSetAssignee}
        onClear={clearBulk}
        onDelete={bulkDelete}
        onSetPriority={bulkSetPriority}
        onSetStatus={bulkSetStatus}
      />
    ) : null;

  /* --------------------------- teams + projects ---------------------------- */

  // Cross-team create asks the one ambiguous choice — same pattern the saved
  // view board uses.
  const { data: teamsData } = useSWR(
    // Neutral key shared with SavedViewPage — same fetcher, one cache entry.
    workspaceId && currentUserId ? ['work-joined-teams', currentUserId, workspaceId] : null,
    () => lambdaClient.team.teams.query(),
    { revalidateOnFocus: false },
  );
  const joinedTeamOptions = useMemo(
    () =>
      (teamsData?.data ?? [])
        .filter((team) => team.joined === true)
        .map((team) => ({ id: team.id, name: team.name })),
    [teamsData],
  );

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
  const projectFilterOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, name: project.name ?? project.id })),
    [projects],
  );

  // The milestone badge resolves through the cached project details — the
  // catalog knows only the milestones of projects whose detail was fetched;
  // an unknown link renders no chip rather than a raw id.
  const cacheScope = useCacheScope();
  const projectDetails = useProjectStore((s) => s.projectDetails[cacheScope]);
  const milestoneById = useMemo(() => {
    const map = new Map<string, TaskMilestoneRef>();
    for (const detail of Object.values(projectDetails ?? {})) {
      for (const milestone of detail.milestones ?? []) {
        if (!map.has(milestone.id)) map.set(milestone.id, milestone);
      }
    }
    return map;
  }, [projectDetails]);
  const milestoneFor = useCallback(
    (task: WorkQueryResultTask) =>
      display.properties.milestone && task.projectMilestoneId
        ? milestoneById.get(task.projectMilestoneId)
        : undefined,
    [display.properties.milestone, milestoneById],
  );
  // The catalog only knows milestones of projects whose detail was fetched —
  // hydrate the projects the rendered rows actually reference, and only while
  // the badge is enabled.
  const milestoneProjectIds = useMemo(() => {
    if (!display.properties.milestone) return [];
    const ids = new Set<string>();
    const collect = (task: WorkQueryResultTask) => {
      if (task.projectMilestoneId && task.projectId) ids.add(task.projectId);
    };
    for (const task of displayTasks) collect(task);
    for (const group of displayGroups) for (const task of group.tasks) collect(task);
    return [...ids].sort();
  }, [display.properties.milestone, displayGroups, displayTasks]);

  // Assignee group headers need member display names — the row model carries
  // `assigneeUserId` only. The roster fetch stays dormant until the grouping
  // is actually picked (primary or sub-grouping).
  const { members } = useWorkspaceMembersQuery({
    enabled:
      layout === 'list' && (display.grouping === 'assignee' || display.subGrouping === 'assignee'),
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

  // One bucketer shared by the primary field groupings and the sub-grouping
  // menu — the work-query enum covers none of these dimensions, so they all
  // bucket client-side over the loaded rows with the same labels/icons.
  const fieldSections = useCallback(
    (
      field: 'activityDate' | 'assignee' | 'priority' | 'project' | 'status',
      rows: WorkQueryResultTask[],
    ): { icon?: ReactNode; key: string; tasks: WorkQueryResultTask[]; title: string }[] => {
      if (field === 'activityDate') {
        const labels = {
          today: t('time.today'),
          unknown: t('myWork.unknownDate'),
          yesterday: t('time.yesterday'),
        };
        return workQueryActivitySections(rows).map((section) => ({
          ...section,
          title: activityBucketTitle(section.key, { labels, locale: i18n.language }),
        }));
      }
      if (field === 'priority') {
        return workQueryFieldSections(rows, {
          // null and 0 are the same "No priority" bucket — matching
          // `taskImportanceRank`, which ranks them identically.
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
      if (field === 'project') {
        return workQueryFieldSections(rows, {
          keyOf: (task) => task.projectId,
          // A projectId that resolves to no known name keeps its id as the
          // honest group label (stale link / unreadable project) instead of
          // folding into "No project" — the row does carry a project.
          titleOf: (key) =>
            key === null ? t('myWork.noProject') : (projectNameById.get(key) ?? key),
        }).map((section) => ({
          ...section,
          icon: createElement(PROJECT_ENTITY_ICON, {
            className: 'size-4 shrink-0',
            color: section.key === 'none' ? cssVar.colorTextQuaternary : undefined,
          }),
        }));
      }
      if (field === 'assignee') {
        return workQueryFieldSections(rows, {
          keyOf: (task) => task.assigneeUserId,
          titleOf: (key) =>
            key === null ? t('chat:taskList.unassigned') : (memberNameById.get(key) ?? key),
        }).map((section) => ({
          ...section,
          icon: (
            <AssigneeUserAvatar size={18} userId={section.key === 'none' ? null : section.key} />
          ),
        }));
      }
      // `status` — the kanban's `st:` visual family so sub-headers match the
      // primary status grouping's column marks.
      return workQueryFieldSections(rows, {
        keyOf: (task) => task.status,
        rankOf: myWorkStatusGroupRank,
        titleOf: (key) => {
          const i18nKey =
            key === null ? undefined : (COLUMN_I18N_KEYS[`st:${key}`] ?? COLUMN_I18N_KEYS[key]);
          return i18nKey ? t(`chat:${i18nKey}` as never) : t('myWork.noStatus');
        },
      }).map((section) => ({
        ...section,
        icon: (() => {
          const visual =
            COLUMN_STATUS_VISUAL[`st:${section.key}`] ?? COLUMN_STATUS_VISUAL[section.key];
          return visual
            ? createElement(visual.icon, { className: 'size-4 shrink-0', color: visual.color })
            : undefined;
        })(),
      }));
    },
    [i18n.language, memberNameById, projectNameById, t],
  );

  // Client-side list groupings — the work-query enum has no activity-date,
  // priority, project or assignee dimension, so the page fetches the flat
  // feed (`myWorkServerGroupBy` → 'none') and buckets the loaded page here.
  // Arrival order inside a section is the feed's own ordering; Load-more
  // keeps paging the flat list at the bottom.
  const flatSections = useMemo(() => {
    if (layout !== 'list' || !isMyWorkClientGrouping(display.grouping)) return undefined;
    return fieldSections(display.grouping, displayTasks);
  }, [display.grouping, displayTasks, fieldSections, layout]);

  // Sub-grouping nests a second level inside each primary section — Linear's
  // two-level headers. `none`, a board layout, a flat primary grouping, or a
  // sub-dimension equal to the primary all keep the flat body.
  const subSectionsFor = useCallback(
    (sectionTasks: WorkQueryResultTask[]) => {
      const sub = display.subGrouping;
      if (layout !== 'list' || sub === 'none' || sub === display.grouping) return undefined;
      const sections = fieldSections(sub, sectionTasks);
      return sections.length > 0 ? sections : undefined;
    },
    [display.grouping, display.subGrouping, fieldSections, layout],
  );

  // Display-property toggles — the set of row chips hidden in place. Project
  // and milestone drop out upstream (`rowExtras`/`milestoneFor`).
  const hiddenRowProperties = useMemo(() => {
    const hidden = new Set<MyWorkRowProperty>();
    for (const property of MY_WORK_ROW_PROPERTIES) {
      if (!display.properties[property]) hidden.add(property);
    }
    return hidden.size > 0 ? hidden : undefined;
  }, [display.properties]);

  // The project chip is a display property — the toggle drops it entirely
  // rather than hiding in place (the chip is caller-supplied chrome).
  const rowExtras = useCallback(
    (task: WorkQueryResultTask) => {
      if (!display.properties.project) return null;
      const name = task.projectId ? projectNameById.get(task.projectId) : undefined;
      if (!name) return null;
      return (
        <IssueRowChip icon={createElement(PROJECT_ENTITY_ICON, { className: 'size-4 shrink-0' })}>
          {name}
        </IssueRowChip>
      );
    },
    [display.properties.project, projectNameById],
  );

  /* -------------------------------- actions ------------------------------- */

  const tabs = useMemo(
    () =>
      MY_ISSUES_TABS.map((item) => ({
        key: item,
        label: String(t(`myWork.${item}` as never)),
      })),
    [t],
  );

  const toggleFollow = useCallback(
    async (taskId: string, followed: boolean) => {
      try {
        if (followed) {
          await workAttentionService.unsubscribe(taskId);
        } else {
          await workAttentionService.subscribe(taskId);
        }
        await refresh();
      } catch {
        toast.error(t(followed ? 'myWork.unsubscribeFailed' : 'myWork.subscribeFailed'));
      }
    },
    [refresh, t],
  );

  const openCreateModal = useCallback(
    (preset?: { projectId?: string }) => {
      createTaskModal({
        onCreated: (task) => {
          navigate(taskDetailPath(task.identifier, task.agentId ?? undefined, task.name));
        },
        projectId: preset?.projectId,
        showInlineToggle: false,
        teamOptions: joinedTeamOptions,
      });
    },
    [joinedTeamOptions, navigate],
  );

  const createInGroup = useCallback(() => openCreateModal(), [openCreateModal]);

  // Of the client-bucketed groupings only Project can preset a create-modal
  // field — the `+` stays off the day/priority/assignee headers.
  const createInFlatSection = useCallback(
    (key: string) => openCreateModal({ projectId: key === 'none' ? undefined : key }),
    [openCreateModal],
  );

  const saveCopy = useCallback(async () => {
    if (!isMyWorkSaveableMode(mode)) return;
    const query = myWorkComposedQuery({
      completed: display.completed,
      delegated,
      filter: builderFilter,
      groupBy: serverGroupBy,
      layout,
      mode,
      noProject,
      ordering: display.ordering,
      subGroupBy: boardLane,
    });
    if (!query) return;
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: 'task',
        layout: canBoard ? layout : 'list',
        name: t(`myWork.${mode}`),
        query,
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('myWork.saveAsFailed'));
    }
  }, [
    boardLane,
    builderFilter,
    canBoard,
    delegated,
    display.completed,
    display.ordering,
    layout,
    mode,
    navigate,
    noProject,
    serverGroupBy,
    t,
    workspaceId,
  ]);

  const writeParams = (patch: {
    delegated?: boolean;
    layout?: WorkQueryLayout;
    noProject?: boolean;
    tab?: string;
  }) => {
    const nextTab = patch.tab ?? mode;
    const nextLayout = patch.layout ?? layout;
    const nextNoProject = patch.noProject ?? noProject;
    const nextDelegated = patch.delegated ?? delegated;
    const nextMode = (patch.tab ?? mode) as MyWorkMode;
    const nextBuilder =
      nextMode === mode ? builder : (builderByMode[nextMode] ?? EMPTY_FILTER_BUILDER);
    const serialized = isMyWorkSaveableMode(nextMode)
      ? serializeWorkQueryFilterParam(builderToFilter('task', nextBuilder))
      : null;
    setSearchParams(
      {
        tab: nextTab,
        ...(isMyWorkBoardMode(nextTab as MyWorkMode) && nextLayout === 'board'
          ? { layout: 'board' }
          : {}),
        ...(nextNoProject ? { noProject: '1' } : {}),
        ...(nextDelegated ? { delegated: '1' } : {}),
        ...(serialized ? { filter: serialized } : {}),
      },
      { replace: true },
    );
  };

  // `?tab=review` on the new surface is a mistyped deep link — send it to
  // Reviews rather than silently rendering Assigned.
  if (rawTab === 'review') {
    return <Navigate replace to={buildWorkspaceAwarePath('/reviews?tab=for-me', workspaceSlug)} />;
  }

  const chipsRow =
    noProject || delegated || activeFilterCount > 0 ? (
      <div
        className={cn('flex flex-row', styles.filterChips)}
        style={{ alignItems: 'center', gap: 8 }}
      >
        {noProject ? (
          <Badge variant="secondary">
            {t('myWork.noProject')}
            <Button
              aria-label={t('close')}
              size="icon-xs"
              variant="ghost"
              onClick={() => writeParams({ noProject: false })}
            >
              <XIcon />
            </Button>
          </Badge>
        ) : null}
        {delegated ? (
          <Badge variant="secondary">
            {t('myWork.delegated')}
            <Button
              aria-label={t('close')}
              size="icon-xs"
              variant="ghost"
              onClick={() => writeParams({ delegated: false })}
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
    error && tasks.length === 0 ? (
      /* A failed fetch must never render as a confident empty list —
         loaded data stays visible with an inline failure marker. */
      <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
    ) : (
      <>
        {error ? (
          <AsyncError error={error} variant={'inline'} onRetry={() => void refresh()} />
        ) : null}
        {milestoneProjectIds.map((id) => (
          <MilestoneCatalogProject id={id} key={id} />
        ))}
        <WorkQueryResults
          bulkSelectedIds={bulkEnabled ? bulkSelectedIds : undefined}
          collapsedColumns={display.collapsedColumns}
          emptyLabel={t('myWork.empty')}
          flatNested={display.showSubIssues && display.nestedSubIssues}
          flatSections={flatSections}
          groupBy={data?.data.groupBy}
          groups={displayGroups}
          hiddenRowProperties={hiddenRowProperties}
          isFollowed={(taskId) => isTaskFollowed(taskId, mode, subscribedTaskIds)}
          layout={layout}
          loadMoreError={loadMoreError}
          loadMoreGroupErrors={loadMoreGroupErrors}
          loadMoreLabel={t('myWork.loadMore')}
          loading={isLoading}
          loadingLabel={t('myWork.loading')}
          milestoneFor={milestoneFor}
          peekOnSelect={peekOnSelect}
          rowExtras={rowExtras}
          selectedTaskId={selected?.identifier}
          subGroupBy={boardLane}
          subSectionsFor={subSectionsFor}
          tasks={displayTasks}
          total={data?.data.total}
          createContext={
            workspaceId && joinedTeamOptions.length > 0
              ? { teamOptions: joinedTeamOptions }
              : undefined
          }
          onBulkSelectTask={bulkEnabled ? handleBulkSelect : undefined}
          onCollapsedColumnsChange={(keys) => setDisplay({ collapsedColumns: keys })}
          onCreateInFlatSection={display.grouping === 'project' ? createInFlatSection : undefined}
          onCreateInGroup={createInGroup}
          onLoadMore={groups.length === 0 ? () => runLoadMore(loadMore) : undefined}
          onLoadMoreGroup={(key) => runLoadMoreGroup(key, () => loadMoreGroup(key))}
          onMoved={() => void refresh()}
          onOpenTask={openTaskPage}
          onRetryLoadMore={retryLoadMore}
          onRetryLoadMoreGroup={retryLoadMoreGroup}
          onToggleFollow={(taskId, followed) => void toggleFollow(taskId, followed)}
          onSelectTask={(task) => {
            // A plain click picks one issue for the peek — the multi-select
            // set is a bulk-action target, so it releases here.
            setSelected(task);
            clearBulk();
          }}
        />
      </>
    );

  return (
    <WorkSurface>
      <NavHeader
        left={
          <span className="text-sm font-medium" style={{ paddingInlineStart: 4 }}>
            {t('tab.myWork')}
          </span>
        }
      />
      <WorkSurfaceCollection
        style={boardActive || detailVisible ? boundedBodyStyle : listBodyStyle}
        toolbar={
          <WorkSurfaceToolbar
            asideLabel={t('members.filter')}
            aside={
              <MyWorkControls
                activeFilterCount={activeFilterCount}
                boardGrouping={display.boardGrouping}
                builder={builder}
                canBoard={canBoard}
                canSaveAs={canSaveAs}
                delegated={delegated}
                detailsDisabled={boardActive}
                detailsExpanded={detailVisible}
                detailsOpen={detailsOpen}
                display={display}
                filterSupported={filterSupported}
                groupingOptions={myWorkListGroupingOptions(mode)}
                layout={layout}
                mode={mode}
                noProject={noProject}
                orderingOptions={myWorkOrderingOptions(mode)}
                projects={projectFilterOptions}
                teamOptions={joinedTeamOptions}
                onBuilderChange={setBuilder}
                onDelegatedChange={(checked) => writeParams({ delegated: checked })}
                onDisplayChange={setDisplay}
                onLayoutChange={(next) => writeParams({ layout: next })}
                onNoProjectChange={(checked) => writeParams({ noProject: checked })}
                onResetFilters={() => setBuilder(EMPTY_FILTER_BUILDER)}
                onSaveAs={() => void saveCopy()}
                onToggleDetails={() => setDetailsOpen((open) => !open)}
              />
            }
          >
            <TabsRoot
              value={mode}
              onValueChange={(value) => {
                if (typeof value === 'string') writeParams({ tab: value });
              }}
            >
              <TabsList>
                {tabs.map((item) => (
                  <TabsTab key={item.key} value={item.key}>
                    {item.label}
                  </TabsTab>
                ))}
              </TabsList>
            </TabsRoot>
          </WorkSurfaceToolbar>
        }
      >
        {detailVisible ? (
          <div className={styles.detailLayout}>
            <div className={styles.resultsScroll}>
              <div className={styles.resultsBody}>
                {chipsRow}
                {results}
                {bulkBar}
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
            {bulkBar}
          </>
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

MyWorkPage.displayName = 'MyWorkPage';

export default MyWorkPage;
