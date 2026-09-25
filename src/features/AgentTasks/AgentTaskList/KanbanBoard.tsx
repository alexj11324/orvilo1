import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Center, Empty, Flexbox } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import type { TaskStatus, WorkQuerySortMode } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { ClipboardCheckIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import {
  applyWorkQueryStatusChange,
  commitWorkQueryBoardMove,
  kanbanStatusMoveGroupBy,
  storeKanbanUsesWorkflowMove,
} from '@/features/MyWork/workQueryBoardMove';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { taskService } from '@/services/task';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useTaskStore } from '@/store/task';
import { taskListSelectors } from '@/store/task/selectors';
import { KANBAN_GROUP_PAGE_SIZE, kanbanGroupLimitCap } from '@/store/task/slices/list/action';
import type { TaskGroupItem, TaskListItem } from '@/store/task/slices/list/initialState';

import { createTaskModal } from '../CreateTaskModal';
import type { TaskItemRouteScope } from '../features/AgentTaskItem';
import { createTaskStatusCascadeModal } from '../features/TaskStatusCascadeModal';
import { getOpenSubtasks, useTaskStatusChange } from '../features/useTaskStatusChange';
import { taskDetailPath } from '../shared/taskDetailPath';
import {
  buildKanbanColumnMap,
  buildKanbanColumns,
  buildKanbanGroupQuery,
  canDropTaskIntoExternalColumn,
  canDropTaskIntoKanbanColumn,
  computeKanbanPosition,
  effectiveTaskPosition,
  externalKanbanColumnMoveScope,
  externalKanbanColumns,
  externalKanbanTaskPatch,
  findKanbanColumn,
  getKanbanAssigneeUpdate,
  getKanbanMoveAnchors,
  getKanbanTaskPatch,
  kanbanBoardCapabilities,
  type KanbanColumnDefinition,
  kanbanColumnMoveScope,
  kanbanCreateTaskProjectId,
  kanbanStatusColumnsExcludedBy,
  makeKanbanCollision,
  normalizeKanbanGroupBy,
  placeKanbanCardInColumn,
  preserveKanbanColumnOrder,
  resolveKanbanDragTask,
  resolveKanbanDropColumn,
  taskMatchesExternalColumn,
  taskMatchesKanbanColumn,
  type WorkQueryBoardGroupBy,
} from './kanbanBoardModel';
import KanbanColumn, {
  CollapsedKanbanColumn,
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
  COLUMN_WIDTH,
} from './KanbanColumn';
import type { TaskListViewOptions } from './listViewOptions';
import { HIDDEN_WHEN_COMPLETED_STATUSES } from './listViewOptions';
import TaskBoardCard from './TaskBoardCard';
import { useKanbanBoardPan } from './useKanbanBoardPan';
import { useKanbanDragSettle } from './useKanbanDragSettle';

const styles = createStaticStyles(({ css, cssVar }) => ({
  board: css`
    overflow-x: auto;
    display: flex;
    flex: 1;
    gap: 12px;
    align-items: stretch;

    padding-block: 4px 16px;
    padding-inline: 12px;
  `,
  loadMore: css`
    cursor: pointer;

    width: 100%;
    margin-block-start: 2px;
    padding-block: 8px;
    padding-inline: 8px;
    border: none;
    border-radius: ${cssVar.borderRadius};

    font-family: inherit;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: center;

    background: transparent;

    transition:
      color 0.2s,
      background 0.2s;

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -2px;
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }

    &:hover:not(:disabled) {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

/**
 * Externally-sourced board data for surfaces whose queries can't map to the
 * task store's groupList scopes (saved views, team boards — arbitrary
 * work-query ASTs). `groups` must already be bucketed under the board's
 * column keys (`wf:<category>` / `st:<status>` — one column per raw
 * dimension member, no folding). Cross-column drops commit through
 * `workAttention.moveBoard` (VIEW08 CAS + exact-state picker); same-column
 * reorders persist through the task position anchors. `onRefresh` is the
 * caller's refetch so the settled write can resync the columns.
 */
export interface KanbanExternalGroups {
  error?: unknown;
  groups: TaskGroupItem[];
  isLoading?: boolean;
  /** Whether cards may be dragged (default true, still gated by permission). */
  movable?: boolean;
  onLoadMoreGroup?: (columnKey: string) => void;
  onRefresh?: () => Promise<unknown> | void;
  /**
   * Work-query grouping the supplied `groups` were fetched with. Selects
   * both the column set (`wf:` / `st:`) and the `moveBoard` `targetKey`.
   */
  queryGroupBy?: 'status' | 'workflowCategory';
  /** AsyncBoundary settle flag — defaults to `groups` being defined. */
  settled?: boolean;
  /**
   * The view's sort mode. `manual` (default) boards persist same-column
   * reorders via position anchors; `field`-sorted views must never write
   * manual position — same-column drops are refused there.
   */
  sortMode?: WorkQuerySortMode;
}

interface KanbanBoardProps {
  /** When set, scopes the board (and task creation) to a single agent. */
  agentId?: string;
  /**
   * Where a task created from this board should land. Team boards pass their
   * teamId so a card made on the team's board is owned by that team; without
   * it an external board keeps the create entry hidden (an ambiguous
   * multi-team view must not silently pick one).
   */
  createContext?: { teamId?: string; teamOptions?: { id: string; name: string }[] };
  /** Overrides the generic "no tasks" copy with the collection's own line. */
  emptyDescription?: string;
  /** Externally-supplied groups — bypasses the task-store fetch entirely. */
  external?: KanbanExternalGroups;
  /**
   * "My tasks" board: narrows the server groups to the caller's own slice of
   * the workspace, matching what that tab's list view fetches — including its
   * lack of an automation filter. 'delegated' covers tasks the caller handed
   * to agents (active execution grant) — My Work's Delegated tab.
   */
  myTaskScope?: 'assigned' | 'created' | 'delegated';
  options: TaskListViewOptions;
  /** `null` narrows to tasks with no project — My Work's "No project" chip. */
  projectId?: string | null;
  routeScope?: TaskItemRouteScope;
}

const KanbanBoard = memo<KanbanBoardProps>((props) => {
  const {
    agentId,
    createContext,
    emptyDescription,
    external,
    myTaskScope,
    options,
    projectId,
    routeScope,
  } = props;
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canEditTaskPerm } = usePermission('create_content');
  const { canMoveAcrossGroups, canReorderWithinGroup } = kanbanBoardCapabilities({
    movable: external?.movable,
    sortMode: external?.sortMode,
  });
  const canEditTask =
    canEditTaskPerm && (!external || canMoveAcrossGroups || canReorderWithinGroup);
  const groupBy = normalizeKanbanGroupBy(options.groupBy);
  const excludeStatuses = options.hideCompleted ? HIDDEN_WHEN_COMPLETED_STATUSES : undefined;
  /** External (work-query) boards render the query's own dimension —
   * `wf:` business categories or `st:` raw execution statuses. */
  const externalGroupBy: WorkQueryBoardGroupBy =
    external?.queryGroupBy === 'status' ? 'status' : 'workflowCategory';

  const useFetchTaskGroupList = useTaskStore((s) => s.useFetchTaskGroupList);
  // Keep the SWR handle only for `error` + `mutate` (the error/Retry state).
  // An external board disables the store query entirely (no effective key →
  // the scope sync never scribbles the shared list state).
  const swr = useFetchTaskGroupList(
    external
      ? { enabled: false }
      : buildKanbanGroupQuery({ agentId, excludeStatuses, groupBy, myTaskScope, projectId }),
  );
  const error = external?.error ?? swr.error;
  const isLoading = external ? (external.isLoading ?? false) : swr.isLoading;
  const isQueryScopeCurrent = external ? true : swr.isQueryScopeCurrent;
  const mutate = external
    ? async () => {
        await external.onRefresh?.();
      }
    : swr.mutate;
  // Drive the loading/empty boundary off the store's own init flag, NOT SWR's
  // per-key `data`. On a scope or visibility switch the store resets
  // `taskGroups` + `isTaskGroupListInit` together (`scopeChangeResetState`)
  // while SWR still holds cached `data` for the target key — keying `hasSettled`
  // off SWR `data` flashed the "no tasks" empty board during the refetch.
  // `isTaskGroupListInit` resets in lockstep with `taskGroups`, so the settled
  // signal never disagrees with the emptiness signal.
  const storeGroupListInit = useTaskStore(taskListSelectors.isTaskGroupListInit);
  const isTaskGroupListInit = external
    ? (external.settled ?? external.groups !== undefined)
    : storeGroupListInit;

  const storeTaskGroups = useTaskStore(taskListSelectors.taskGroups);
  const currentTaskGroups = useMemo(
    () => (external ? external.groups : isQueryScopeCurrent ? storeTaskGroups : []),
    [external, isQueryScopeCurrent, storeTaskGroups],
  );
  const updateTask = useTaskStore((s) => s.updateTask);
  const changeTaskStatus = useTaskStatusChange();
  const loadMoreTaskGroup = useTaskStore((s) => s.loadMoreTaskGroup);
  const boardGroupLimits = useTaskStore((s) => s.boardGroupLimits);
  const refreshTaskGroupList = useTaskStore((s) => s.refreshTaskGroupList);
  const internalRefreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);

  const hiddenColumns = useGlobalStore(systemStatusSelectors.taskKanbanHiddenColumns);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const [activeTask, setActiveTask] = useState<TaskListItem | null>(null);
  /**
   * Optimistic field patches keyed by task identifier. The mirror (below)
   * only moves identifiers between columns; a status/assignee/priority drop
   * also needs the rendered card to show its TARGET values for the settle
   * window — `TaskStatusTag`/`TaskPriorityTag`/assignee read the task object.
   * Cleared when the post-settle resync lands the server's truth.
   */
  const [cardOverrides, setCardOverrides] = useState<Record<string, Partial<TaskListItem>>>({});

  const allColumns = useMemo(() => {
    if (external) {
      const fixed = externalKanbanColumns(externalGroupBy);
      const covered = new Set(fixed.map((column) => column.key));
      const extras = currentTaskGroups
        .filter((group) => !covered.has(group.key))
        .map((group) => ({
          droppable: false,
          groupMeta: undefined,
          key: group.key,
          targetStatus: null,
        }));
      return [...fixed, ...extras];
    }
    const filteredOut = kanbanStatusColumnsExcludedBy(
      groupBy === 'status' ? excludeStatuses : undefined,
    );
    return buildKanbanColumns(currentTaskGroups, groupBy).filter(
      (column) => !filteredOut.has(column.key),
    );
  }, [currentTaskGroups, excludeStatuses, external, externalGroupBy, groupBy]);
  const columnDefMap = useMemo(
    () => new Map(allColumns.map((column) => [column.key, column])),
    [allColumns],
  );
  const columnKeys = useMemo(() => allColumns.map((column) => column.key), [allColumns]);
  const columnKeySet = useMemo(() => new Set(columnKeys), [columnKeys]);
  const collisionDetection = useMemo(() => makeKanbanCollision(columnKeySet), [columnKeySet]);

  // ── Drag mirror ────────────────────────────────────────────────
  // Local `columnKey -> ordered task ids` map. Between drags it follows the
  // store's taskGroups; while a pointer is down (or a move is settling) it is
  // frozen so a mid-flight refetch cannot clobber the optimistic placement.
  const {
    beginSettle,
    columns,
    columnsRef,
    isDraggingRef,
    isSettlingRef,
    recentlyMovedRef,
    setColumns,
    settleVersion,
  } = useKanbanDragSettle(() => buildKanbanColumnMap(columnKeys, currentTaskGroups));

  const taskMap = useMemo(() => {
    const map = new Map<string, TaskListItem>();
    for (const group of currentTaskGroups) {
      for (const task of group.tasks as TaskListItem[]) map.set(task.identifier, task);
    }
    return map;
  }, [currentTaskGroups]);

  // The drag reads task fields (membership, neighbour positions) from the
  // PRE-DRAG snapshot — the mirror moves ids, but the task objects must keep
  // saying where each card started until the drop commits.
  const taskMapRef = useRef(taskMap);
  if (!isDraggingRef.current && !isSettlingRef.current) taskMapRef.current = taskMap;

  const resetColumns = useCallback(() => {
    setColumns(
      preserveKanbanColumnOrder(
        columnsRef.current,
        buildKanbanColumnMap(
          columnKeys,
          external ? external.groups : useTaskStore.getState().taskGroups,
        ),
      ),
    );
  }, [columnKeys, columnsRef, external, setColumns]);

  /** Store boards resync via the store; external boards via the caller's refetch. */
  const refreshGroups = useCallback(
    () => (external?.onRefresh ? external.onRefresh() : refreshTaskGroupList()),
    [external, refreshTaskGroupList],
  );
  const loadMoreGroup = useCallback(
    (columnKey: string) => {
      if (external) return external.onLoadMoreGroup?.(columnKey);
      return loadMoreTaskGroup(columnKey);
    },
    [external, loadMoreTaskGroup],
  );

  // Resync the mirror whenever store truth lands outside a drag/settle.
  useEffect(() => {
    if (isDraggingRef.current || isSettlingRef.current) return;
    resetColumns();
    setCardOverrides((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    // `settleVersion` forces one resync after the settle lock releases even
    // when taskGroups itself did not change in the meantime.
  }, [currentTaskGroups, isDraggingRef, isSettlingRef, resetColumns, settleVersion]);

  const handleHideColumn = useCallback(
    (columnKey: string) => {
      const next = Array.from(new Set([...hiddenColumns, columnKey]));
      updateSystemStatus({ taskKanbanHiddenColumns: next }, 'hideKanbanColumn');
    },
    [hiddenColumns, updateSystemStatus],
  );

  const handleRestoreColumn = useCallback(
    (columnKey: string) => {
      const next = hiddenColumns.filter((key) => key !== columnKey);
      updateSystemStatus({ taskKanbanHiddenColumns: next }, 'restoreKanbanColumn');
    },
    [hiddenColumns, updateSystemStatus],
  );

  // ── Drop commit ────────────────────────────────────────────────

  /**
   * Persist one drop. Returns false when the user cancelled a confirmation
   * (the completed/canceled cascade modal) so the caller reverts the mirror.
   * Everything else resolves true or throws — the caller owns rollback.
   */
  const commitMove = useCallback(
    async (
      task: TaskListItem,
      column: KanbanColumnDefinition,
      move: { afterId: string | null; beforeId: string | null; position: number },
    ): Promise<boolean> => {
      // The column's membership fields ride with the anchors so the server can
      // find the true neighbour past the loaded page and respace the column
      // when fractional positions collapse.
      const moveScope = external
        ? externalKanbanColumnMoveScope(externalGroupBy, column)
        : kanbanColumnMoveScope(groupBy, column);
      const anchors = {
        afterId: move.afterId,
        beforeId: move.beforeId,
        moveScope,
        position: move.position,
      };
      const memberAlready = external
        ? taskMatchesExternalColumn(task, externalGroupBy, column.key)
        : taskMatchesKanbanColumn(task, groupBy, column.key);

      if (external) {
        if (memberAlready) {
          // A field-sorted view never writes manual position — the drop
          // reverts instead of silently redefining the saved sort.
          if (!canReorderWithinGroup) return false;
          // Same-column reorder persists through the position anchors —
          // `task.update` resolves them server-side, so a refresh or another
          // client sees the same manual order.
          await taskService.update(task.identifier, anchors);
          return true;
        }
        if (!canMoveAcrossGroups) return false;
        return commitWorkQueryBoardMove({
          column,
          groupBy: external.queryGroupBy ?? 'workflowCategory',
          task,
        });
      }

      if (storeKanbanUsesWorkflowMove(groupBy, task)) {
        // Same-column reorder still writes position through the store.
        // Cross-column Linear drops need VIEW08's exact-state picker.
        if (memberAlready) {
          await updateTask(task.identifier, anchors);
          return true;
        }
        return commitWorkQueryBoardMove({
          column,
          groupBy: 'workflowCategory',
          task,
        });
      }

      if (groupBy === 'status') {
        const targetStatus = column.targetStatus;
        // The column writes no status (running), or the task already buckets
        // inside it (a `failed` card in `needsInput`) → pure reorder.
        if (!targetStatus || memberAlready) {
          await updateTask(task.identifier, anchors);
          return true;
        }
        if (targetStatus === 'completed' || targetStatus === 'canceled') {
          // Same contract as the detail header: completing/canceling a parent
          // with open subtasks asks whether to cascade first.
          let openSubtasks;
          try {
            const result = await taskService.getSubtasks(task.identifier);
            openSubtasks = getOpenSubtasks(result.data);
          } catch (loadError) {
            console.error('[KanbanBoard] Failed to inspect subtasks:', loadError);
            toast.error(t('taskDetail.statusCascade.loadFailed'));
            throw loadError;
          }
          if (openSubtasks.length > 0) {
            return createTaskStatusCascadeModal({
              subtasks: openSubtasks,
              targetStatus,
              onApply: async (includeSubtasks) => {
                if (includeSubtasks) {
                  // The cascade endpoint owns the subtree transition AND stamps
                  // the drop position in the same transaction — the move can
                  // never persist its status without its slot.
                  await taskService.updateStatusCascade(task.identifier, targetStatus, anchors);
                  await internalRefreshTaskDetail(task.identifier).catch(() => {});
                  return;
                }
                await updateTask(task.identifier, { ...anchors, status: targetStatus });
              },
            });
          }
        }
        await updateTask(task.identifier, { ...anchors, status: targetStatus });
        return true;
      }

      if (groupBy === 'assignee' || groupBy === 'member') {
        const patch = getKanbanTaskPatch(groupBy, column) ?? {};
        const assigneeUpdate = getKanbanAssigneeUpdate(task, patch);
        // `undefined` means the task already carries the target assignee —
        // the drop is a position-only move inside that column.
        await updateTask(task.identifier, { ...assigneeUpdate, ...anchors });
        return true;
      }

      const patch = getKanbanTaskPatch(groupBy, column);
      await updateTask(task.identifier, { ...anchors, priority: patch?.priority ?? 0 });
      return true;
    },
    [
      canMoveAcrossGroups,
      canReorderWithinGroup,
      external,
      externalGroupBy,
      groupBy,
      internalRefreshTaskDetail,
      t,
      updateTask,
    ],
  );

  // ── Drag handlers ──────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!canEditTask) return;
      isDraggingRef.current = true;
      const task = event.active.data.current?.task as TaskListItem | undefined;
      setActiveTask(task ?? null);
    },
    [canEditTask, isDraggingRef],
  );

  // Cross-column preview: moving a card over another column relocates its id
  // in the mirror immediately, so sortable insertion feedback shows the slot
  // it would take. Same-column reordering is left to the sortable transform.
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || recentlyMovedRef.current) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (columnKeySet.has(activeId) || activeId === overId) return;
      const task = resolveKanbanDragTask(active, taskMapRef.current);
      if (!task) return;

      setColumns((prev) => {
        const activeCol = findKanbanColumn(prev, activeId, columnKeySet);
        const overCol = findKanbanColumn(prev, overId, columnKeySet);
        if (!activeCol || !overCol || activeCol === overCol) return prev;
        const overDef = columnDefMap.get(overCol);
        const canDrop = external
          ? canDropTaskIntoExternalColumn(
              task,
              overDef ?? { droppable: false, key: '', targetStatus: null },
            )
          : overDef
            ? canDropTaskIntoKanbanColumn(task, groupBy, overDef)
            : false;
        if (!overDef || !canDrop) {
          return prev;
        }
        recentlyMovedRef.current = true;
        const nextSource = (prev[activeCol] ?? []).filter((id) => id !== activeId);
        const nextTarget = [...(prev[overCol] ?? [])];
        const overIndex = nextTarget.indexOf(overId);
        nextTarget.splice(overIndex >= 0 ? overIndex : nextTarget.length, 0, activeId);
        return { ...prev, [activeCol]: nextSource, [overCol]: nextTarget };
      });
    },
    [columnDefMap, columnKeySet, external, groupBy, recentlyMovedRef, setColumns],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      isDraggingRef.current = false;
      setActiveTask(null);
      if (!canEditTask) return;

      const activeId = String(active.id);
      if (!over || columnKeySet.has(activeId)) {
        resetColumns();
        return;
      }
      const overId = String(over.id);
      const task = resolveKanbanDragTask(active, taskMapRef.current);
      if (!task) {
        resetColumns();
        return;
      }

      const currentColumns = columnsRef.current;
      // Membership + neighbour positions read the pre-drag task snapshot.
      const frozenTask = taskMapRef.current.get(activeId) ?? task;

      // The RELEASE column decides the target, not the mirror's parked slot —
      // a rejected drag-over can leave the card previewed onto an earlier
      // valid column, so committing the preview would write the wrong column.
      // `droppable: false` only bars cross-column entry: a same-column reorder
      // inside `running` stays legal (it writes position, not status).
      const overCol = resolveKanbanDropColumn(
        frozenTask,
        groupBy,
        currentColumns,
        overId,
        columnKeySet,
        columnDefMap,
        external ? externalGroupBy : undefined,
      );
      if (!overCol) {
        resetColumns();
        return;
      }
      const finalDef = columnDefMap.get(overCol)!;
      const sameColumn = external
        ? taskMatchesExternalColumn(frozenTask, externalGroupBy, overCol)
        : taskMatchesKanbanColumn(frozenTask, groupBy, overCol);

      // Order the release column the way the pointer left it: a same-column
      // sort sits at its old index until moved to the released-on card, and a
      // cross-column preview may have parked at an earlier slot than the
      // pointer's final position. `placeKanbanCardInColumn` also strips the id
      // from any stale preview column so the card cannot render twice.
      const finalColumns = placeKanbanCardInColumn(currentColumns, overCol, activeId, overId);
      setColumns(finalColumns);

      const finalIds = finalColumns[overCol] ?? [];
      const position = computeKanbanPosition(finalIds, activeId, taskMapRef.current);
      const anchors = getKanbanMoveAnchors(finalIds, activeId);
      if (sameColumn && effectiveTaskPosition(frozenTask) === position) {
        // Nothing moved: same column, same effective slot.
        resetColumns();
        return;
      }

      const patch = external
        ? (externalKanbanTaskPatch(externalGroupBy, finalDef) ?? {})
        : (getKanbanTaskPatch(groupBy, finalDef, frozenTask) ?? {});
      const assigneeUpdate =
        groupBy === 'assignee' || groupBy === 'member'
          ? getKanbanAssigneeUpdate(frozenTask, patch)
          : undefined;
      setCardOverrides((prev) => ({
        ...prev,
        [activeId]: { ...patch, ...assigneeUpdate, position },
      }));

      // Dropping onto a hidden column reveals it — the user just put a card
      // there; hiding it now would make the drop look like a delete. Re-hide
      // if the write fails or is cancelled.
      const wasHidden = hiddenColumns.includes(overCol);
      if (wasHidden) handleRestoreColumn(overCol);

      const revert = () => {
        setCardOverrides((prev) => {
          const next = { ...prev };
          delete next[activeId];
          return next;
        });
        if (wasHidden) handleHideColumn(overCol);
        resetColumns();
      };

      const release = beginSettle();
      let applied: boolean;
      try {
        applied = await commitMove(frozenTask, finalDef, { ...anchors, position });
      } catch {
        // The write may have half-landed (e.g. a cascade's position step after
        // the status commit): reconcile from the server before rolling the
        // mirror back so a persisted move is never displayed as reverted.
        revert();
        release();
        await refreshGroups()?.catch(() => {});
        return;
      }
      if (!applied) {
        revert();
        release();
        return;
      }
      try {
        // Land the reconciled order before releasing the lock so the resync
        // renders server truth, not a stale intermediate page.
        await refreshGroups();
        release();
      } catch {
        // The move persisted but the reconcile failed — keep the optimistic
        // placement (reverting would lie about a write the server accepted)
        // and retry the refetch in the background.
        release({ resync: false });
        void refreshGroups()?.catch(() => {});
      }
    },
    [
      beginSettle,
      canEditTask,
      columnDefMap,
      columnKeySet,
      columnsRef,
      commitMove,
      external,
      externalGroupBy,
      groupBy,
      handleHideColumn,
      handleRestoreColumn,
      hiddenColumns,
      isDraggingRef,
      refreshGroups,
      resetColumns,
      setColumns,
    ],
  );

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveTask(null);
    resetColumns();
  }, [isDraggingRef, resetColumns]);

  const handleCardStatusChange = useCallback(
    async (task: TaskListItem, status: TaskStatus) => {
      const applied = await applyWorkQueryStatusChange({
        changeLocal: changeTaskStatus,
        groupBy: kanbanStatusMoveGroupBy(external?.queryGroupBy),
        status,
        task,
      });
      if (!applied) return;
      try {
        await refreshGroups();
      } catch (error) {
        console.error('[KanbanBoard] Failed to refresh after status change:', error);
      }
    },
    [changeTaskStatus, external?.queryGroupBy, refreshGroups],
  );

  const handleCreateTask = useCallback(() => {
    if (!canEditTask) return;
    createTaskModal({
      agentId,
      lockAssignee: !!agentId,
      projectId: kanbanCreateTaskProjectId(projectId),
      teamId: createContext?.teamId,
      teamOptions: createContext?.teamOptions,
      onCreated: (task) => {
        navigate(taskDetailPath(task.identifier, agentId ? task.agentId : undefined, task.name));
      },
      showInlineToggle: false,
    });
  }, [agentId, canEditTask, createContext, navigate, projectId]);

  // ── Derived layout ─────────────────────────────────────────────

  const hiddenColumnSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);

  const visibleColumns = useMemo(
    () =>
      groupBy === 'status'
        ? allColumns.filter((column) => !hiddenColumnSet.has(column.key))
        : allColumns,
    [allColumns, groupBy, hiddenColumnSet],
  );

  const hiddenColumnEntries = useMemo(
    () =>
      allColumns
        .filter((col) => hiddenColumnSet.has(col.key))
        .map((col) => ({
          columnKey: col.key,
          droppable: canEditTask && col.droppable,
          label: t(COLUMN_I18N_KEYS[col.key] as any),
          statusIcon: COLUMN_STATUS_VISUAL[col.key],
          total: currentTaskGroups.find((group) => group.key === col.key)?.total ?? 0,
        })),
    [allColumns, canEditTask, currentTaskGroups, hiddenColumnSet, t],
  );

  const resolveColumnTasks = useCallback(
    (columnKey: string): TaskListItem[] =>
      (columns[columnKey] ?? [])
        .map((id) => {
          const task = taskMap.get(id);
          if (!task) return undefined;
          const override = cardOverrides[id];
          return override ? ({ ...task, ...override } as TaskListItem) : task;
        })
        .filter((task): task is TaskListItem => !!task),
    [cardOverrides, columns, taskMap],
  );

  const boardPan = useKanbanBoardPan<HTMLDivElement>();

  const totalTasks = currentTaskGroups.reduce((sum, group) => sum + group.total, 0);
  const skeletonColumns =
    visibleColumns.length > 0
      ? visibleColumns
      : Array.from({ length: 3 }, (_, index) => ({
          droppable: false,
          groupMeta: undefined,
          key: `skeleton-${index}`,
          targetStatus: null,
        }));

  const skeletonBoard = (
    <Flexbox horizontal className={styles.board}>
      {skeletonColumns.map((col) => (
        <KanbanColumn
          loading
          columnKey={col.key}
          droppable={false}
          groupBy={groupBy}
          groupMeta={col.groupMeta}
          key={col.key}
          tasks={[]}
          total={0}
        />
      ))}
    </Flexbox>
  );

  const emptyState = (
    <Center height={'80vh'} width={'100%'}>
      <Empty description={emptyDescription ?? t('taskList.empty')} icon={ClipboardCheckIcon} />
    </Center>
  );

  const board = (
    <DndContext
      collisionDetection={collisionDetection}
      sensors={canEditTask ? sensors : []}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      <div
        className={styles.board}
        ref={boardPan.ref}
        onLostPointerCapture={boardPan.onLostPointerCapture}
        onPointerCancel={boardPan.onPointerCancel}
        onPointerDown={boardPan.onPointerDown}
        onPointerMove={boardPan.onPointerMove}
        onPointerUp={boardPan.onPointerUp}
      >
        {visibleColumns.map((col) => {
          const group = currentTaskGroups.find((item) => item.key === col.key);
          const columnTasks = resolveColumnTasks(col.key);
          const droppable =
            canEditTask &&
            col.droppable &&
            (!activeTask || canDropTaskIntoKanbanColumn(activeTask, groupBy, col));
          return (
            <KanbanColumn
              columnKey={col.key}
              droppable={droppable}
              groupBy={groupBy}
              groupMeta={col.groupMeta}
              key={col.key}
              routeScope={routeScope}
              tasks={columnTasks}
              total={group?.total ?? 0}
              footer={
                group?.hasMore && (!external || external.onLoadMoreGroup) ? (
                  <button
                    data-no-board-pan
                    className={styles.loadMore}
                    type="button"
                    disabled={
                      !external &&
                      (boardGroupLimits[col.key] ?? KANBAN_GROUP_PAGE_SIZE) >=
                        kanbanGroupLimitCap(groupBy)
                    }
                    onClick={() => loadMoreGroup(col.key)}
                  >
                    {t('taskList.kanban.loadMore', {
                      shown: columnTasks.length,
                      total: group.total,
                    })}
                  </button>
                ) : undefined
              }
              onHide={groupBy === 'status' ? () => handleHideColumn(col.key) : undefined}
              onStatusChange={handleCardStatusChange}
              onCreate={
                // "My tasks" offers no create entry (its list view has none
                // either): a task created here carries neither the member
                // assignment nor — under `created` — any guarantee it lands
                // in the column it was started from. An external board only
                // shows it when the caller declared where the card belongs.
                groupBy === 'status' &&
                col.key === 'backlog' &&
                !myTaskScope &&
                (!external ||
                  Boolean(createContext?.teamId) ||
                  (createContext?.teamOptions?.length ?? 0) > 0)
                  ? handleCreateTask
                  : undefined
              }
            />
          );
        })}
        {/* Hidden columns fold into Cordy's in-flow rails at the board's end:
            always mounted, each stays a live drop target, click restores. */}
        {groupBy === 'status' &&
          hiddenColumnEntries.map((entry) => (
            <CollapsedKanbanColumn
              columnKey={entry.columnKey}
              droppable={entry.droppable}
              key={entry.columnKey}
              label={entry.label}
              statusIcon={entry.statusIcon}
              total={entry.total}
              onExpand={() => handleRestoreColumn(entry.columnKey)}
            />
          ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div
            style={{
              boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12)',
              cursor: 'grabbing',
              width: COLUMN_WIDTH - 16,
            }}
          >
            <TaskBoardCard overlay routeScope={routeScope} task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  // Error gated ahead of empty by AsyncBoundary so a failed fetch shows Retry
  // instead of the "no tasks" empty. `data` is the SWR result —
  // undefined until the first fetch settles.
  return (
    <AsyncBoundary
      data={(isQueryScopeCurrent && isTaskGroupListInit) || undefined}
      empty={emptyState}
      error={error}
      errorVariant={'block'}
      // Status boards always have their columns — an empty workspace still
      // renders the empty board (Cordy's behavior), not a centered empty state.
      // Only dynamic groupings with zero groups fall back to `empty`.
      isEmpty={totalTasks === 0 && groupBy !== 'status'}
      isLoading={isLoading || (!isQueryScopeCurrent && !error) || (!isTaskGroupListInit && !error)}
      loading={skeletonBoard}
      onRetry={() => mutate()}
    >
      {board}
    </AsyncBoundary>
  );
});

export default KanbanBoard;
