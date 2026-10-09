import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronLeft, Plus } from 'lucide-react';
import { createElement, memo, type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import type { StatusVisual } from '@/components/ExecutionStatus';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskKanbanGroupBy, TaskListItem } from '@/store/task/slices/list/initialState';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import type { TaskItemRouteScope } from '../features/AgentTaskItem';
import { shouldOpenCardOnKey } from './boardKeyboard';
import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
  getKanbanColumnHeaderVariant,
  type TaskStatusChoice,
} from './kanbanBoardModel';
import type { TaskGroupMeta } from './listViewOptions';
import TaskBoardCard from './TaskBoardCard';
import TaskGroupLabel from './TaskGroupLabel';
import TaskItemSkeleton from './TaskItemSkeleton';

export const COLUMN_WIDTH = 320;

const cardStyles = createStaticStyles(({ css }) => ({
  dragging: css`
    opacity: 0.3;
  `,
}));

const SortableTaskCard = memo<{
  hiddenProperties?: ReadonlySet<string>;
  onStatusChange?: (task: TaskListItem, choice: TaskStatusChoice) => void | Promise<void>;
  routeScope?: TaskItemRouteScope;
  task: TaskListItem;
}>(({ hiddenProperties, onStatusChange, routeScope, task }) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { task },
    id: task.identifier,
  });
  const handleStatusChange = useCallback(
    (choice: TaskStatusChoice) => onStatusChange?.(task, choice),
    [onStatusChange, task],
  );

  return (
    <div
      data-board-card
      className={cx(isDragging && cardStyles.dragging)}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
      }}
      {...listeners}
      {...attributes}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        if (
          shouldOpenCardOnKey({
            isDragging,
            key: event.key,
            targetIsCard: event.target === event.currentTarget,
          })
        ) {
          event.currentTarget.querySelector<HTMLElement>('[data-task-board-card]')?.click();
        }
      }}
    >
      <TaskBoardCard
        hiddenProperties={hiddenProperties}
        routeScope={routeScope}
        task={task}
        onStatusChange={onStatusChange ? handleStatusChange : undefined}
      />
    </div>
  );
});

const styles = createStaticStyles(({ css, cssVar }) => ({
  /**
   * Cordy rail: a collapsed column folds into a 40px vertical card at the
   * board's end — icon, rotated title, count — and stays a live drop target.
   */
  collapsed: css`
    display: flex;
    flex-direction: column;
    flex-shrink: 0;

    width: 40px;
    max-height: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  collapsedButton: css`
    cursor: pointer;

    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: flex-start;

    padding-block: 10px;
    padding-inline: 0;
    border: none;
    border-radius: ${cssVar.borderRadiusLG};

    color: ${cssVar.colorText};

    background: transparent;

    transition: background 0.2s;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  collapsedCount: css`
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: ${cssVar.colorTextTertiary};
  `,
  collapsedDropOver: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
    box-shadow: 0 0 0 1px ${cssVar.colorPrimary};
  `,
  collapsedLabel: css`
    writing-mode: vertical-rl;
    font-size: 12px;
    font-weight: 500;
  `,
  /* Same flip as Cordy: LTR rails read bottom-to-top, upright scripts don't. */
  collapsedLabelRotated: css`
    transform: rotate(180deg);
  `,
  addPill: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: center;

    height: 36px;
    border: 1px dashed ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadiusLG};

    color: ${cssVar.colorTextTertiary};

    transition:
      border-color 0.2s,
      color 0.2s,
      background 0.2s;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
      color: ${cssVar.colorPrimary};
      background: ${cssVar.colorBgContainer};
    }
  `,
  body: css`
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;

    min-height: 120px;
    padding-block: 4px 12px;
    padding-inline: 8px;
    border-radius: 0 0 ${cssVar.borderRadiusLG} ${cssVar.borderRadiusLG};

    transition: background 0.2s;
  `,
  bodyDropActive: css`
    background: ${cssVar.colorFillSecondary};
  `,
  column: css`
    display: flex;
    flex-direction: column;
    flex-shrink: 0;

    width: ${COLUMN_WIDTH}px;
    max-height: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};

    transition:
      box-shadow 0.2s,
      border-color 0.2s;

    .kanban-col-action {
      opacity: 0;
      transition: opacity 0.2s;
    }

    &:hover .kanban-col-action,
    &:focus-within .kanban-col-action,
    &:has([data-open]) .kanban-col-action {
      opacity: 1;
    }
  `,
  columnDropActive: css`
    border-color: ${cssVar.colorPrimaryBorderHover};
    box-shadow: inset 0 0 0 1px ${cssVar.colorPrimaryBorderHover};
  `,
  count: css`
    flex: none;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: ${cssVar.colorTextDescription};
  `,
  header: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    min-height: 40px;
    padding-block: 10px;
    padding-inline: 12px 8px;
  `,
  headerActions: css`
    display: flex;
    gap: 2px;
    align-items: center;
  `,
  headerTitle: css`
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  `,
  notDroppable: css`
    opacity: 0.45;
  `,
}));

// The column presentation maps moved to the board model — every surface
// that mirrors a column (headers, collapsed rails, status pickers, view
// chips) reads the same source.
export { COLUMN_I18N_KEYS, COLUMN_STATUS_VISUAL };

interface CollapsedKanbanColumnProps {
  columnKey: string;
  /** Rails stay live drop targets unless the view filtered the column out. */
  droppable: boolean;
  label: string;
  onExpand: () => void;
  statusIcon?: StatusVisual;
  total: number;
}

/**
 * The Cordy collapsed rail — a hidden column folded into a slim vertical card
 * at the board's end. Click restores it; dropping a card on it lands the drop
 * in that column (the board reveals it on a successful drop).
 */
export const CollapsedKanbanColumn = memo<CollapsedKanbanColumnProps>(
  ({ columnKey, droppable, label, onExpand, statusIcon, total }) => {
    const { t, i18n } = useTranslation('chat');
    const { isOver, setNodeRef } = useDroppable({ disabled: !droppable, id: columnKey });
    const upright = /^(?:zh|ja|ko)/.test(i18n.language);

    return (
      <div
        data-no-board-pan
        className={cx(styles.collapsed, isOver && styles.collapsedDropOver)}
        data-board-collapsed-column={columnKey}
        data-hidden-column-drop-target={columnKey}
        ref={setNodeRef}
      >
        <button
          aria-expanded={false}
          aria-label={t('taskList.kanban.showColumn')}
          className={styles.collapsedButton}
          title={t('taskList.kanban.showColumn')}
          type="button"
          onClick={onExpand}
        >
          {statusIcon && createElement(statusIcon.icon, { color: statusIcon.color, size: 16 })}
          <span
            className={cx(styles.collapsedLabel, !upright && styles.collapsedLabelRotated)}
            style={{ flex: 1, minHeight: 0 }}
          >
            {label}
          </span>
          <span className={styles.collapsedCount}>{total}</span>
        </button>
      </div>
    );
  },
);

CollapsedKanbanColumn.displayName = 'CollapsedKanbanColumn';

interface KanbanColumnProps {
  columnKey: string;
  droppable: boolean;
  /** Optional footer slot — the per-column "load more" affordance. */
  footer?: ReactNode;
  groupBy: TaskKanbanGroupBy;
  groupMeta?: TaskGroupMeta;
  hiddenProperties?: ReadonlySet<string>;
  loading?: boolean;
  onCreate?: () => void;
  onHide?: () => void;
  onStatusChange?: (task: TaskListItem, choice: TaskStatusChoice) => void | Promise<void>;
  routeScope?: TaskItemRouteScope;
  tasks: TaskListItem[];
  total: number;
}

const KanbanColumn = memo<KanbanColumnProps>(
  ({
    columnKey,
    droppable,
    footer,
    groupBy,
    hiddenProperties,
    groupMeta,
    loading,
    onCreate,
    onHide,
    onStatusChange,
    routeScope,
    tasks,
    total,
  }) => {
    const { t } = useTranslation('chat');
    const { active } = useDndContext();
    const { isOver, setNodeRef } = useDroppable({
      disabled: !droppable,
      id: columnKey,
    });

    const statusIcon = COLUMN_STATUS_VISUAL[columnKey];
    const i18nKey = COLUMN_I18N_KEYS[columnKey];
    const label = i18nKey ? t(i18nKey as any) : t(`taskList.groupBy.${groupBy}` as any);
    const headerVariant = getKanbanColumnHeaderVariant({
      hasGroupMeta: !!groupMeta,
      loading,
    });
    const isDragActive = !!active;

    // Don't highlight if dragging a card that's already in this column
    const activeTask = active?.data.current?.task as TaskListItem | undefined;
    const isFromThisColumn =
      activeTask && tasks.some((task) => task.identifier === activeTask.identifier);
    const showDropHighlight = isOver && droppable && !isFromThisColumn;
    const showDisabled = isDragActive && !droppable;

    return (
      <div
        ref={setNodeRef}
        className={cx(
          styles.column,
          showDropHighlight && styles.columnDropActive,
          showDisabled && styles.notDroppable,
        )}
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            {headerVariant === 'loading' ? (
              <>
                <Skeleton
                  className="rounded-md shrink-0"
                  style={{ borderRadius: 4, flex: 'none', width: 16, height: 16 }}
                />
                <Skeleton style={{ minWidth: 64, height: 14, width: 64 }} />
              </>
            ) : headerVariant === 'group' && groupMeta ? (
              <TaskGroupLabel group={groupMeta} />
            ) : (
              <>
                {statusIcon &&
                  createElement(statusIcon.icon, { color: statusIcon.color, size: 16 })}
                <div className="text-sm font-medium">{label}</div>
              </>
            )}
            {headerVariant !== 'loading' && <span className={styles.count}>{total}</span>}
          </div>
          <div className={cx(styles.headerActions, 'kanban-col-action')}>
            {onHide && (
              <ActionIcon
                icon={ChevronLeft}
                size={'small'}
                title={t('taskList.kanban.hideColumn')}
                onClick={onHide}
              />
            )}
            {onCreate && (
              <ActionIcon
                icon={Plus}
                size={'small'}
                title={t('taskList.kanban.addTask')}
                onClick={onCreate}
              />
            )}
          </div>
        </div>
        <div className={cx(styles.body, showDropHighlight && styles.bodyDropActive)}>
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <TaskItemSkeleton key={`kanban-skeleton-${columnKey}-${index}`} variant={'compact'} />
            ))
          ) : tasks.length > 0 ? (
            <SortableContext
              items={tasks.map((task) => task.identifier)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map((task) => (
                <SortableTaskCard
                  hiddenProperties={hiddenProperties}
                  key={task.identifier}
                  routeScope={routeScope}
                  task={task}
                  onStatusChange={onStatusChange}
                />
              ))}
            </SortableContext>
          ) : onCreate ? (
            <div
              {...clickableProps()}
              aria-label={t('taskList.kanban.addTask')}
              className={cn(styles.addPill, CLICKABLE_FOCUS_RING)}
              title={t('taskList.kanban.addTask')}
              onClick={onCreate}
            >
              <Plus size={16} />
            </div>
          ) : null}
          {footer}
        </div>
      </div>
    );
  },
);

export default KanbanColumn;
