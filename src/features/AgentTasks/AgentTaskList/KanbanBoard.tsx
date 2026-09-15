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
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Center, Empty, Flexbox } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { ClipboardCheckIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { taskService } from '@/services/task';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useTaskStore } from '@/store/task';
import { taskListSelectors } from '@/store/task/selectors';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import { createTaskModal } from '../CreateTaskModal';
import type { TaskItemRouteScope } from '../features/AgentTaskItem';
import AgentTaskItem from '../features/AgentTaskItem';
import { createTaskStatusCascadeModal } from '../features/TaskStatusCascadeModal';
import { getOpenSubtasks } from '../features/useTaskStatusChange';
import { taskDetailPath } from '../shared/taskDetailPath';
import HiddenColumnsPanel from './HiddenColumnsPanel';
import {
  buildKanbanColumnMap,
  buildKanbanColumns,
  buildKanbanGroupQuery,
  canDropTaskIntoKanbanColumn,
  computeKanbanPosition,
  effectiveTaskPosition,
  findKanbanColumn,
  getKanbanAssigneeUpdate,
  getKanbanMoveAnchors,
  getKanbanTaskPatch,
  type KanbanColumnDefinition,
  kanbanStatusColumnsExcludedBy,
  makeKanbanCollision,
  normalizeKanbanGroupBy,
  preserveKanbanColumnOrder,
  taskMatchesKanbanColumn,
} from './kanbanBoardModel';
import KanbanColumn, { COLUMN_I18N_KEYS, COLUMN_STATUS_ICON, COLUMN_WIDTH } from './KanbanColumn';
import type { TaskListViewOptions } from './listViewOptions';
import { HIDDEN_WHEN_COMPLETED_STATUSES } from './listViewOptions';
import { useKanbanBoardPan } from './useKanbanBoardPan';
import { useKanbanDragSettle } from './useKanbanDragSettle';

const styles = createStaticStyles(({ css, cssVar }) => ({
  board: css`
    overflow-x: auto;
    display: flex;
    flex: 1;
    gap: 8px;

    padding-block: 0 16px;
    padding-inline: 12px;
  `,
  loadMore: css`
    cursor: pointer;

    margin-block-start: 2px;
    padding-block: 8px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: center;

    transition:
      color 0.2s,
      background 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface KanbanBoardProps {
  /** When set, scopes the board (and task creation) to a single agent. */
  agentId?: string;
  /** Overrides the generic "no tasks" copy with the collection's own line. */
  emptyDescription?: string;
  /**
   * "My tasks" board: narrows the server groups to the caller's own slice of
   * the workspace, matching what that tab's list view fetches — including its
   * lack of an automation filter.
   */
  myTaskScope?: 'assigned' | 'created';
  options: TaskListViewOptions;
  projectId?: string;
  routeScope?: TaskItemRouteScope;
}

const KanbanBoard = memo<KanbanBoardProps>((props) => {
  const { agentId, emptyDescription, myTaskScope, options, projectId, routeScope } = props;
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canEditTask } = usePermission('create_content');
  const groupBy = normalizeKanbanGroupBy(options.groupBy);
  const excludeStatuses = options.hideCompleted ? HIDDEN_WHEN_COMPLETED_STATUSES : undefined;

  const useFetchTaskGroupList = useTaskStore((s) => s.useFetchTaskGroupList);
  // Keep the SWR handle only for `error` + `mutate` (the error/Retry state).
  const { error, isLoading, isQueryScopeCurrent, mutate } = useFetchTaskGroupList(
    buildKanbanGroupQuery({ agentId, excludeStatuses, groupBy, myTaskScope, projectId }),
  );
  // Drive the loading/empty boundary off the store's own init flag, NOT SWR's
  // per-key `data`. On a scope or visibility switch the store resets
  // `taskGroups` + `isTaskGroupListInit` together (`scopeChangeResetState`)
  // while SWR still holds cached `data` for the target key — keying `hasSettled`
  // off SWR `data` flashed the "no tasks" empty board during the refetch.
  // `isTaskGroupListInit` resets in lockstep with `taskGroups`, so the settled
  // signal never disagrees with the emptiness signal.
  const isTaskGroupListInit = useTaskStore(taskListSelectors.isTaskGroupListInit);

  const taskGroups = useTaskStore(taskListSelectors.taskGroups);
  const currentTaskGroups = useMemo(
    () => (isQueryScopeCurrent ? taskGroups : []),
    [isQueryScopeCurrent, taskGroups],
  );
  const updateTask = useTaskStore((s) => s.updateTask);
  const loadMoreTaskGroup = useTaskStore((s) => s.loadMoreTaskGroup);
  const refreshTaskGroupList = useTaskStore((s) => s.refreshTaskGroupList);
  const internalRefreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);

  const hiddenColumns = useGlobalStore(systemStatusSelectors.taskKanbanHiddenColumns);
  const hiddenPanelCollapsed = useGlobalStore(systemStatusSelectors.taskKanbanHiddenPanelCollapsed);
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
    const filteredOut = kanbanStatusColumnsExcludedBy(
      groupBy === 'status' ? excludeStatuses : undefined,
    );
    return buildKanbanColumns(currentTaskGroups, groupBy).filter(
      (column) => !filteredOut.has(column.key),
    );
  }, [currentTaskGroups, excludeStatuses, groupBy]);
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
        buildKanbanColumnMap(columnKeys, useTaskStore.getState().taskGroups),
      ),
    );
  }, [columnKeys, columnsRef, setColumns]);

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

  const handleToggleHiddenPanel = useCallback(
    (collapsed: boolean) => {
      updateSystemStatus({ taskKanbanHiddenPanelCollapsed: collapsed }, 'toggleKanbanHiddenPanel');
    },
    [updateSystemStatus],
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
      const anchors = { afterId: move.afterId, beforeId: move.beforeId, position: move.position };
      const memberAlready = taskMatchesKanbanColumn(task, groupBy, column.key);

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
                  // The cascade endpoint owns the subtree transition; the
                  // board move only appends the position afterwards.
                  await taskService.updateStatusCascade(task.identifier, targetStatus);
                  await updateTask(task.identifier, anchors);
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
    [groupBy, internalRefreshTaskDetail, t, updateTask],
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
      const task = active.data.current?.task as TaskListItem | undefined;
      if (!task) return;

      setColumns((prev) => {
        const activeCol = findKanbanColumn(prev, activeId, columnKeySet);
        const overCol = findKanbanColumn(prev, overId, columnKeySet);
        if (!activeCol || !overCol || activeCol === overCol) return prev;
        const overDef = columnDefMap.get(overCol);
        if (!overDef?.droppable || !canDropTaskIntoKanbanColumn(task, groupBy, overDef)) {
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
    [columnDefMap, columnKeySet, groupBy, recentlyMovedRef, setColumns],
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
      const task = active.data.current?.task as TaskListItem | undefined;
      if (!task) {
        resetColumns();
        return;
      }

      const currentColumns = columnsRef.current;
      const activeCol = findKanbanColumn(currentColumns, activeId, columnKeySet);
      const overCol = findKanbanColumn(currentColumns, overId, columnKeySet);
      if (!activeCol || !overCol) {
        resetColumns();
        return;
      }

      // Same-column drop: the sortable transform only moved the card visually;
      // commit the reorder into the mirror before computing the position.
      let finalColumns = currentColumns;
      if (activeCol === overCol) {
        const ids = currentColumns[activeCol] ?? [];
        const oldIndex = ids.indexOf(activeId);
        const newIndex = ids.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          finalColumns = { ...currentColumns, [activeCol]: arrayMove(ids, oldIndex, newIndex) };
          setColumns(finalColumns);
        }
      }

      const finalCol = findKanbanColumn(finalColumns, activeId, columnKeySet) ?? overCol;
      const finalDef = columnDefMap.get(finalCol);
      // Membership + neighbour positions read the pre-drag task snapshot.
      const frozenTask = taskMapRef.current.get(activeId) ?? task;
      if (
        !finalDef ||
        !finalDef.droppable ||
        !canDropTaskIntoKanbanColumn(frozenTask, groupBy, finalDef)
      ) {
        resetColumns();
        return;
      }

      const finalIds = finalColumns[finalCol] ?? [];
      const position = computeKanbanPosition(finalIds, activeId, taskMapRef.current);
      const anchors = getKanbanMoveAnchors(finalIds, activeId);
      if (
        taskMatchesKanbanColumn(frozenTask, groupBy, finalCol) &&
        effectiveTaskPosition(frozenTask) === position
      ) {
        // Nothing moved: same column, same effective slot.
        resetColumns();
        return;
      }

      const patch = getKanbanTaskPatch(groupBy, finalDef) ?? {};
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
      const wasHidden = hiddenColumns.includes(finalCol);
      if (wasHidden) handleRestoreColumn(finalCol);

      const release = beginSettle();
      try {
        const applied = await commitMove(frozenTask, finalDef, { ...anchors, position });
        if (!applied) {
          setCardOverrides((prev) => {
            const next = { ...prev };
            delete next[activeId];
            return next;
          });
          if (wasHidden) handleHideColumn(finalCol);
          resetColumns();
          return;
        }
        // Land the reconciled order before releasing the lock so the resync
        // renders server truth, not a stale intermediate page.
        await refreshTaskGroupList();
      } catch {
        setCardOverrides((prev) => {
          const next = { ...prev };
          delete next[activeId];
          return next;
        });
        if (wasHidden) handleHideColumn(finalCol);
        resetColumns();
      } finally {
        release();
      }
    },
    [
      beginSettle,
      canEditTask,
      columnDefMap,
      columnKeySet,
      columnsRef,
      commitMove,
      groupBy,
      handleHideColumn,
      handleRestoreColumn,
      hiddenColumns,
      isDraggingRef,
      refreshTaskGroupList,
      resetColumns,
      setColumns,
    ],
  );

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveTask(null);
    resetColumns();
  }, [isDraggingRef, resetColumns]);

  const handleCreateTask = useCallback(() => {
    if (!canEditTask) return;
    createTaskModal({
      agentId,
      lockAssignee: !!agentId,
      projectId,
      onCreated: (task) => {
        navigate(taskDetailPath(task.identifier, agentId ? task.agentId : undefined, task.name));
      },
      showInlineToggle: false,
    });
  }, [agentId, canEditTask, navigate, projectId]);

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
          statusIcon: COLUMN_STATUS_ICON[col.key],
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
                group?.hasMore ? (
                  <div
                    data-no-board-pan
                    className={styles.loadMore}
                    onClick={() => loadMoreTaskGroup(col.key)}
                  >
                    {t('taskList.kanban.loadMore', {
                      shown: columnTasks.length,
                      total: group.total,
                    })}
                  </div>
                ) : undefined
              }
              onHide={groupBy === 'status' ? () => handleHideColumn(col.key) : undefined}
              onCreate={
                // "My tasks" offers no create entry (its list view has none
                // either): a task created here carries neither the member
                // assignment nor — under `created` — any guarantee it lands
                // in the column it was started from.
                groupBy === 'status' && col.key === 'backlog' && !myTaskScope
                  ? handleCreateTask
                  : undefined
              }
            />
          );
        })}
        {groupBy === 'status' && (
          <HiddenColumnsPanel
            // A drag force-expands the rail so its hidden-column rows mount
            // and register as drop targets; collapsed keeps them unmounted.
            collapsed={hiddenPanelCollapsed && !activeTask}
            columns={hiddenColumnEntries}
            onRestore={handleRestoreColumn}
            onToggleCollapsed={handleToggleHiddenPanel}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div
            style={{
              background: 'var(--lobe-color-bg-container, #fff)',
              border: '1px solid var(--lobe-color-border-secondary, #f0f0f0)',
              borderRadius: 8,
              boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12)',
              cursor: 'grabbing',
              width: COLUMN_WIDTH - 8,
            }}
          >
            <AgentTaskItem routeScope={routeScope} task={activeTask} variant="compact" />
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
      isEmpty={totalTasks === 0}
      isLoading={isLoading || (!isQueryScopeCurrent && !error) || (!isTaskGroupListInit && !error)}
      loading={skeletonBoard}
      onRetry={() => mutate()}
    >
      {board}
    </AsyncBoundary>
  );
});

export default KanbanBoard;
