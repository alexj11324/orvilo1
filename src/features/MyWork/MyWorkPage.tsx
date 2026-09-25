'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import {
  confirmModal,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Tag,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { type MyWorkMode, type TaskStatus, type WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import AsyncError from '@/components/AsyncError';
import { PriorityIcon } from '@/components/PriorityIcon';
import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
} from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import AssigneeUserAvatar from '@/features/AgentTasks/features/AssigneeUserAvatar';
import { useTaskStatusChange } from '@/features/AgentTasks/features/useTaskStatusChange';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import { builderToFilter, stableStringify } from '@/features/SavedViews/workQueryBuilder';
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
  activityDayTitle,
  filterMyWorkTaskRows,
  isMyWorkClientGrouping,
  MY_WORK_PRIORITY_LABEL_KEYS,
  MY_WORK_ROW_PROPERTIES,
  type MyWorkDisplay,
  myWorkDisplayFiltersRows,
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
  myWorkActiveFilterCount,
  myWorkComposedQuery,
  workQueryFilterHasPredicates,
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

  // Filter-builder rows, also per tab. Only the saveable modes can actually
  // compose them into a work query — the other tabs' membership rules live in
  // mode-injected SQL the generic query endpoint cannot express.
  const [builderByMode, setBuilderByMode] = useState<Partial<Record<MyWorkMode, BuilderState>>>({});
  const builder = builderByMode[mode] ?? EMPTY_FILTER_BUILDER;
  const setBuilder = useCallback(
    (next: BuilderState) => setBuilderByMode((current) => ({ ...current, [mode]: next })),
    [mode],
  );
  const filterSupported = isMyWorkSaveableMode(mode);
  const builderFilter = filterSupported ? builderToFilter('task', builder) : undefined;
  const hasCustomFilters = workQueryFilterHasPredicates(builderFilter);
  const activeFilterCount = myWorkActiveFilterCount(builder);

  const serverGroupBy = myWorkServerGroupBy(display, layout);
  // Extra filters or a non-default ordering reroute the feed through the
  // generic work-query endpoint — `myWork` keeps the mode's fixed sort and
  // only knows the noProject/delegated chips.
  const composedQuery = useMemo(
    () =>
      hasCustomFilters || display.ordering !== 'default'
        ? myWorkComposedQuery({
            delegated,
            filter: builderFilter,
            groupBy: serverGroupBy,
            layout,
            mode,
            noProject,
            ordering: display.ordering,
          })
        : null,
    [
      builderFilter,
      delegated,
      display.ordering,
      hasCustomFilters,
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
  const swrKey = useMemo(
    () => [
      'workAttention:myWork',
      workspaceId,
      mode,
      layout,
      noProject,
      delegated,
      serverGroupBy,
      composedQuery ? stableStringify(composedQuery) : '',
    ],
    [workspaceId, mode, layout, noProject, delegated, serverGroupBy, composedQuery],
  );
  const { data, error, isLoading } = useClientDataSWR(swrKey, () =>
    composedQuery
      ? workAttentionService.query({ query: composedQuery })
      : workAttentionService.myWork({
          delegated,
          groupBy: serverGroupBy,
          layout,
          mode,
          noProject,
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
    delegated,
    layout,
    mode,
    noProject,
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
            query: composedQuery,
            queryHash,
          })
        : workAttentionService.myWork({
            afterId: input.afterId,
            delegated,
            groupBy: serverGroupBy,
            groupKey: input.groupKey,
            layout,
            mode,
            noProject,
            queryHash,
          }),
    [composedQuery, delegated, layout, mode, noProject, queryHash, serverGroupBy],
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
  const displayFiltersRows = myWorkDisplayFiltersRows(display);
  const displayTasks = useMemo(() => {
    const filtered = filterMyWorkTaskRows(tasks, display);
    return importanceOrdered ? sortTasksByImportance(filtered) : filtered;
  }, [display, importanceOrdered, tasks]);
  const displayGroups = useMemo(
    () =>
      groups.map((group) => {
        const filteredTasks = filterMyWorkTaskRows(group.tasks, display);
        return {
          ...group,
          tasks: importanceOrdered ? sortTasksByImportance(filteredTasks) : filteredTasks,
          // A display-filtered group counts what it actually shows.
          total: displayFiltersRows ? filteredTasks.length : group.total,
        };
      }),
    [display, displayFiltersRows, groups, importanceOrdered],
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
        (task) => taskService.update(task.id, { assigneeUserId: userId }),
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
          title: activityDayTitle(section.key, { labels, locale: i18n.language }),
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
          icon: (
            <Icon
              color={section.key === 'none' ? cssVar.colorTextQuaternary : undefined}
              icon={PROJECT_ENTITY_ICON}
              size={14}
            />
          ),
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
          return visual ? <Icon color={visual.color} icon={visual.icon} size={14} /> : undefined;
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
        <Flexbox flex="none">
          <Tag icon={<Icon icon={PROJECT_ENTITY_ICON} size={12} />} size="small" variant="outlined">
            {name}
          </Tag>
        </Flexbox>
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
      delegated,
      filter: builderFilter,
      groupBy: serverGroupBy,
      layout,
      mode,
      noProject,
      ordering: display.ordering,
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
    builderFilter,
    canBoard,
    delegated,
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
    setSearchParams(
      {
        tab: nextTab,
        ...(isMyWorkBoardMode(nextTab as MyWorkMode) && nextLayout === 'board'
          ? { layout: 'board' }
          : {}),
        ...(nextNoProject ? { noProject: '1' } : {}),
        ...(nextDelegated ? { delegated: '1' } : {}),
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
      <Flexbox horizontal align="center" className={styles.filterChips} gap={8}>
        {noProject ? (
          <Tag closable size="small" onClose={() => writeParams({ noProject: false })}>
            {t('myWork.noProject')}
          </Tag>
        ) : null}
        {delegated ? (
          <Tag closable size="small" onClose={() => writeParams({ delegated: false })}>
            {t('myWork.delegated')}
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
          subSectionsFor={subSectionsFor}
          tasks={displayTasks}
          total={data?.data.total}
          createContext={
            workspaceId && joinedTeamOptions.length > 0
              ? { teamOptions: joinedTeamOptions }
              : undefined
          }
          onBulkSelectTask={bulkEnabled ? handleBulkSelect : undefined}
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
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.myWork')}
          </Text>
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
            <TabsRoot value={mode} onValueChange={(value) => writeParams({ tab: value })}>
              <TabsList>
                <TabsIndicator />
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
