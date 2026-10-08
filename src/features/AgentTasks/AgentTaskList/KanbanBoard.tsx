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
import type { WorkQuerySortMode } from '@orvilo/types';
import { workQueryBoardAxisOfKey } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { ClipboardCheckIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
import SimpleEmpty from '@/components/SimpleEmpty';
import { Button } from '@/components/ui/button';
import {
  applyWorkQueryStatusChoice,
  commitWorkQueryBoardMove,
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
import { taskDetailPath } from '../shared/taskDetailPath';
import {
  boardCellKey,
  buildKanbanColumnMap,
  buildKanbanColumns,
  buildKanbanGroupQuery,
  canDropTaskIntoExternalColumn,
  canDropTaskIntoKanbanColumn,
  COLUMN_I18N_KEYS,
  columnDefForBoardKey,
  computeKanbanPosition,
  effectiveTaskPosition,
  externalBoardColumns,
  externalBoardLanes,
  externalKanbanCellPatch,
  externalKanbanColumnMoveScope,
  externalKanbanTaskPatch,
  externalVisibleKanbanColumns,
  findKanbanColumn,
  getKanbanAssigneeUpdate,
  getKanbanMoveAnchors,
  getKanbanTaskPatch,
  kanbanBoardCapabilities,
  kanbanColumnAllowsCreate,
  kanbanColumnCreatePreset,
  type KanbanColumnDefinition,
  kanbanColumnMoveScope,
  kanbanColumnPagingAction,
  kanbanCreateTaskProjectId,
  makeKanbanCollision,
  normalizeKanbanGroupBy,
  parseBoardCellKey,
  placeKanbanCardInColumn,
  preserveKanbanColumnOrder,
  resolveKanbanDragTask,
  resolveKanbanDropColumn,
  taskMatchesExternalColumn,
  taskMatchesKanbanColumn,
  type TaskStatusChoice,
  type WorkQueryBoardGroupBy,
} from './kanbanBoardModel';
import KanbanColumn, {
  CollapsedKanbanColumn,
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
  /**
   * Work-query boards persist collapsed columns with the view. When set, the
   * global task-kanban store is left alone.
   */
  hiddenColumnKeys?: readonly string[];
  /** Display properties hidden on every card. Omitted shows the full card. */
  hiddenProperties?: ReadonlySet<string>;
  /**
   * Linear parity: hide a column whose group is empty instead of rendering
   * an empty drop area. Team-issues boards opt in; other callers keep every
   * column visible.
   */
  hideEmptyColumns?: boolean;
  isLoading?: boolean;
  /**
   * Swimlane axis. Group keys are `columnKey + separator + laneKey`. Absent
   * keeps the single row of columns.
   */
  laneAxis?: WorkQueryBoardGroupBy;
  /**
   * Tail-page rejection for one column (work-query group key resolved by the
   * caller) — the failed column's footer swaps its load-more button for an
   * inline retry instead of lifting the error to the whole board.
   */
  loadMoreGroupError?: (columnKey: string) => unknown;
  /** Whether cards may be dragged (default true, still gated by permission). */
  movable?: boolean;
  onHiddenColumnKeysChange?: (keys: string[]) => void;
  onLoadMoreGroup?: (columnKey: string) => void;
  onRefresh?: () => Promise<unknown> | void;
  /** Re-issues the failed page request shown by `loadMoreGroupError`. */
  onRetryLoadMoreGroup?: (columnKey: string) => void;
  /**
   * Work-query grouping the supplied `groups` were fetched with. Selects
   * both the column set (`wf:` / `st:`) and the `moveBoard` `targetKey`.
   */
  queryGroupBy?: WorkQueryBoardGroupBy;
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
  /** Clears `hideCompleted`; without it the board explains the hiding but cannot undo it. */
  onShowHiddenCompleted?: () => void;
  onViewAll?: () => void;
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
    onShowHiddenCompleted,
    onViewAll,
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
  const externalGroupBy: WorkQueryBoardGroupBy = external?.queryGroupBy ?? 'workflowCategory';

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
  const loadMoreTaskGroup = useTaskStore((s) => s.loadMoreTaskGroup);
  const boardGroupLimits = useTaskStore((s) => s.boardGroupLimits);
  const refreshTaskGroupList = useTaskStore((s) => s.refreshTaskGroupList);
  const storeHiddenColumns = useGlobalStore(systemStatusSelectors.taskKanbanHiddenColumns);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const hiddenColumns = useMemo(
    () =>
      external?.onHiddenColumnKeysChange
        ? [...(external.hiddenColumnKeys ?? [])]
        : storeHiddenColumns,
    [external, storeHiddenColumns],
  );

  const [activeTask, setActiveTask] = useState<TaskListItem | null>(null);
  /**
   * Optimistic field patches keyed by task identifier. The mirror (below)
   * only moves identifiers between columns; a status/assignee/priority drop
   * also needs the rendered card to show its TARGET values for the settle
   * window — `IssueStatusPicker`/`TaskPriorityTag`/assignee read the task object.
   * Cleared when the post-settle resync lands the server's truth.
   */
  const [cardOverrides, setCardOverrides] = useState<Record<string, Partial<TaskListItem>>>({});

  const allColumns = useMemo(() => {
    if (external) return externalBoardColumns(externalGroupBy, currentTaskGroups);
    return buildKanbanColumns(currentTaskGroups, groupBy);
  }, [currentTaskGroups, external, externalGroupBy, groupBy]);
  const lanes = useMemo(
    () => (external?.laneAxis ? externalBoardLanes(external.laneAxis, currentTaskGroups) : []),
    [currentTaskGroups, external?.laneAxis],
  );
  const hiddenColumnSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const dragColumns = useMemo(() => {
    if (lanes.length === 0) return allColumns;
    return lanes.flatMap((lane) =>
      allColumns
        .filter((column) => !hiddenColumnSet.has(column.key))
        .map((column) => ({ ...column, key: boardCellKey(column.key, lane.key) })),
    );
  }, [allColumns, hiddenColumnSet, lanes]);
  const columnDefMap = useMemo(
    () => new Map(dragColumns.map((column) => [column.key, column])),
    [dragColumns],
  );
  const columnKeys = useMemo(() => dragColumns.map((column) => column.key), [dragColumns]);
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
      if (external?.onHiddenColumnKeysChange) {
        external.onHiddenColumnKeysChange(next);
        return;
      }
      updateSystemStatus({ taskKanbanHiddenColumns: next }, 'hideKanbanColumn');
    },
    [external, hiddenColumns, updateSystemStatus],
  );

  const handleRestoreColumn = useCallback(
    (columnKey: string) => {
      const next = hiddenColumns.filter((key) => key !== columnKey);
      if (external?.onHiddenColumnKeysChange) {
        external.onHiddenColumnKeysChange(next);
        return;
      }
      updateSystemStatus({ taskKanbanHiddenColumns: next }, 'restoreKanbanColumn');
    },
    [external, hiddenColumns, updateSystemStatus],
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
        const parsed = parseBoardCellKey(column.key);
        const columnAxis = workQueryBoardAxisOfKey(parsed.columnKey) ?? externalGroupBy;
        const laneAxis = parsed.laneKey ? workQueryBoardAxisOfKey(parsed.laneKey) : undefined;
        const stateAxis = (axis: string | undefined): axis is 'status' | 'workflowCategory' =>
          axis === 'status' || axis === 'workflowCategory';
        const fieldPatch = {
          ...(stateAxis(columnAxis)
            ? {}
            : externalKanbanTaskPatch(columnAxis, columnDefForBoardKey(parsed.columnKey))),
          ...(laneAxis && !stateAxis(laneAxis) && parsed.laneKey
            ? externalKanbanTaskPatch(laneAxis, columnDefForBoardKey(parsed.laneKey))
            : {}),
        };
        const stateGroupBy = stateAxis(columnAxis)
          ? columnAxis
          : stateAxis(laneAxis)
            ? laneAxis
            : undefined;
        const stateKey = stateAxis(columnAxis)
          ? parsed.columnKey
          : stateAxis(laneAxis)
            ? parsed.laneKey
            : undefined;
        if (stateKey && stateGroupBy) {
          const moved = await commitWorkQueryBoardMove({
            column: columnDefForBoardKey(stateKey),
            groupBy: stateGroupBy,
            task,
          });
          if (!moved) return false;
          if (Object.keys(fieldPatch).length > 0) {
            await taskService.update(task.identifier, { ...fieldPatch, ...anchors });
          } else if (canReorderWithinGroup) {
            await taskService.update(task.identifier, anchors);
          }
          return true;
        }
        await taskService.update(task.identifier, { ...fieldPatch, ...anchors });
        return true;
      }

      if (groupBy === 'status') {
        // The Issue board writes the canonical Issue Status only: same-column
        // drops stay position reorders; every cross-column drop — linked or
        // not — commits through the shared workflow move (`moveBoard` CAS,
        // ambiguity picker and cascade modal included). Execution statuses
        // never appear as a column.
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
    [canMoveAcrossGroups, canReorderWithinGroup, external, externalGroupBy, groupBy, updateTask],
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
        ? externalKanbanCellPatch(finalDef.key)
        : (getKanbanTaskPatch(groupBy, finalDef) ?? {});
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
    async (task: TaskListItem, choice: TaskStatusChoice) => {
      // Issue-status choices are always a workflow move — the picker's rows
      // never carry a raw execution status.
      const applied = await applyWorkQueryStatusChoice({ choice, task });
      if (!applied) return;
      try {
        await refreshGroups();
      } catch (error) {
        console.error('[KanbanBoard] Failed to refresh after status change:', error);
      }
    },
    [refreshGroups],
  );

  const handleCreateTask = useCallback(
    (columnKey: string) => {
      if (!canEditTask) return;
      const preset = kanbanColumnCreatePreset(columnKey);
      createTaskModal({
        agentId,
        assigneeUserId: preset.assigneeUserId,
        lockAssignee: !!agentId,
        priority: preset.priority,
        projectId:
          preset.projectId === null
            ? undefined
            : kanbanCreateTaskProjectId(preset.projectId ?? projectId),
        status: preset.status,
        teamId: createContext?.teamId,
        teamOptions: createContext?.teamOptions,
        workflowCategory: preset.workflowCategory,
        onCreated: (task) => {
          navigate(taskDetailPath(task.identifier, agentId ? task.agentId : undefined, task.name));
        },
        showInlineToggle: false,
      });
    },
    [agentId, canEditTask, createContext, navigate, projectId],
  );

  // ── Derived layout ─────────────────────────────────────────────

  const columnTotals = useMemo(
    () =>
      lanes.length === 0
        ? currentTaskGroups
        : allColumns.map((column) => ({
            key: column.key,
            total: currentTaskGroups
              .filter((group) => parseBoardCellKey(group.key).columnKey === column.key)
              .reduce((sum, group) => sum + group.total, 0),
          })),
    [allColumns, currentTaskGroups, lanes.length],
  );

  const visibleColumns = useMemo(() => {
    const populated = external?.hideEmptyColumns
      ? externalVisibleKanbanColumns(allColumns, columnTotals)
      : allColumns;
    return groupBy === 'status' || external
      ? populated.filter((column) => !hiddenColumnSet.has(column.key))
      : populated;
  }, [allColumns, columnTotals, external, groupBy, hiddenColumnSet]);

  const hiddenColumnEntries = useMemo(
    () =>
      allColumns
        .filter((col) => hiddenColumnSet.has(col.key))
        .map((col) => ({
          columnKey: col.key,
          droppable: canEditTask && col.droppable,
          label: t(COLUMN_I18N_KEYS[col.key] as any),
          statusIcon: COLUMN_STATUS_VISUAL[col.key],
          total:
            columnTotals.find((group) => group.key === col.key)?.total ??
            currentTaskGroups.find((group) => group.key === col.key)?.total ??
            0,
        })),
    [allColumns, canEditTask, columnTotals, currentTaskGroups, hiddenColumnSet, t],
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
    <div className={styles.board}>
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
    </div>
  );

  const emptyState = (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <SimpleEmpty
        description={emptyDescription ?? t('taskList.empty')}
        icon={ClipboardCheckIcon}
      />
    </div>
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
        className={lanes.length > 0 ? 'flex min-h-0 flex-1 flex-col overflow-auto' : styles.board}
        ref={boardPan.ref}
        onLostPointerCapture={boardPan.onLostPointerCapture}
        onPointerCancel={boardPan.onPointerCancel}
        onPointerDown={boardPan.onPointerDown}
        onPointerMove={boardPan.onPointerMove}
        onPointerUp={boardPan.onPointerUp}
      >
        {(lanes.length > 0 ? lanes : [undefined]).map((lane) => (
          <div className={lane ? 'flex min-w-0 flex-col' : 'contents'} key={lane?.key ?? 'columns'}>
            {lane ? (
              <div className="px-3 pt-2 text-xs font-medium text-muted-foreground">
                {lane.groupMeta?.label || lane.key}
              </div>
            ) : null}
            <div className={lane ? styles.board : 'contents'}>
              {visibleColumns.map((col) => {
                const cellKey = lane ? boardCellKey(col.key, lane.key) : col.key;
                const group = currentTaskGroups.find((item) => item.key === cellKey);
                const columnTasks = resolveColumnTasks(cellKey);
                const droppable =
                  canEditTask &&
                  col.droppable &&
                  (!activeTask ||
                    (external
                      ? canDropTaskIntoExternalColumn(activeTask, col)
                      : canDropTaskIntoKanbanColumn(activeTask, groupBy, col)));
                const columnLoadError = external?.loadMoreGroupError?.(cellKey);
                const pagingAction = kanbanColumnPagingAction({
                  atLimit:
                    (boardGroupLimits[cellKey] ?? KANBAN_GROUP_PAGE_SIZE) >=
                    kanbanGroupLimitCap(groupBy),
                  external: Boolean(external),
                });
                return (
                  <KanbanColumn
                    columnKey={cellKey}
                    droppable={droppable}
                    groupBy={groupBy}
                    groupMeta={col.groupMeta}
                    hiddenProperties={external?.hiddenProperties}
                    key={cellKey}
                    routeScope={routeScope}
                    tasks={columnTasks}
                    total={group?.total ?? 0}
                    footer={
                      columnLoadError ? (
                        <AsyncError
                          error={columnLoadError}
                          variant={'inline'}
                          onRetry={
                            external?.onRetryLoadMoreGroup
                              ? () => external.onRetryLoadMoreGroup?.(cellKey)
                              : undefined
                          }
                        />
                      ) : group?.hasMore && (!external || external.onLoadMoreGroup) ? (
                        <button
                          data-no-board-pan
                          className={styles.loadMore}
                          disabled={pagingAction === 'viewAll' && !onViewAll}
                          type="button"
                          onClick={
                            pagingAction === 'viewAll' ? onViewAll : () => loadMoreGroup(cellKey)
                          }
                        >
                          {t(
                            pagingAction === 'viewAll'
                              ? 'taskList.kanban.viewAllInList'
                              : 'taskList.kanban.loadMore',
                            {
                              shown: columnTasks.length,
                              total: group.total,
                            },
                          )}
                        </button>
                      ) : undefined
                    }
                    onStatusChange={handleCardStatusChange}
                    onCreate={
                      kanbanColumnAllowsCreate({
                        columnKey: col.key,
                        createContext,
                        external: Boolean(external),
                        groupBy,
                        myTaskScope: Boolean(myTaskScope),
                      })
                        ? () => handleCreateTask(cellKey)
                        : undefined
                    }
                    onHide={
                      groupBy === 'status' || external
                        ? () => handleHideColumn(parseBoardCellKey(col.key).columnKey)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
        {(groupBy === 'status' || external) &&
          hiddenColumnEntries.map((entry) => (
            <CollapsedKanbanColumn
              columnKey={entry.columnKey}
              droppable={lanes.length === 0 && entry.droppable}
              key={entry.columnKey}
              label={entry.label || entry.columnKey}
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
            <TaskBoardCard
              overlay
              hiddenProperties={external?.hiddenProperties}
              routeScope={routeScope}
              task={activeTask}
            />
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
      <div className="flex min-h-0 flex-1 flex-col">
        {options.hideCompleted ? (
          <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
            <span>{t('taskList.hiddenCompleted.boardNotice')}</span>
            {onShowHiddenCompleted ? (
              <Button size="xs" variant="ghost" onClick={onShowHiddenCompleted}>
                {t('taskList.hiddenCompleted.show')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {board}
      </div>
    </AsyncBoundary>
  );
});

export default KanbanBoard;
