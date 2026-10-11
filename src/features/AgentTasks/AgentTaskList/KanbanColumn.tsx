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

const cardStyles = {
  dragging: 'opacity-30',
};

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
      ref={setNodeRef}
      className={cx(
        'rounded-(--radius-card) outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50',
        isDragging && cardStyles.dragging,
      )}
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

const stylesRetained = createStaticStyles(({ css, cssVar }) => ({
  columnDropActive: css`
    border-color: ${cssVar.colorPrimaryBorderHover};
    box-shadow: inset 0 0 0 1px ${cssVar.colorPrimaryBorderHover};
  `,
}));

const styles = {
  collapsed:
    'flex flex-col shrink-0 w-10 max-h-full border border-divider rounded-(--radius-card) bg-card',
  collapsedButton:
    'cursor-pointer flex flex-1 flex-col gap-2 items-center justify-start py-2.5 px-0 border-0 rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 text-foreground bg-transparent transition-[background-color] duration-(--orvilo-motion-mid) hover:bg-accent motion-reduce:transition-none',
  collapsedCount: 'text-xs leading-5 tabular-nums',
  collapsedDropOver: 'border-primary bg-primary-wash ring-1 ring-primary',
  collapsedLabel: '[writing-mode:vertical-rl] text-xs leading-5 font-medium',
  collapsedLabelRotated: 'rotate-180',
  addPill:
    'cursor-pointer flex gap-1.5 items-center justify-center min-h-9 border border-dashed border-border rounded-(--radius-button) text-foreground-tertiary transition-[border-color,color,background-color] duration-(--orvilo-motion-mid) hover:border-primary-border hover:text-primary-text hover:bg-card motion-reduce:transition-none',
  body: 'overflow-y-auto flex flex-1 flex-col gap-2 min-h-30 pbs-1 pbe-3 px-2 rounded-es-(--radius-card) rounded-ee-(--radius-card) transition-[background-color] duration-(--orvilo-motion-mid) motion-reduce:transition-none',
  bodyDropActive: 'bg-selected',
  column:
    'flex flex-col shrink-0 w-80 max-h-full border border-divider rounded-(--radius-card) bg-card transition-[box-shadow,border-color] duration-(--orvilo-motion-mid) [&_.kanban-col-action]:opacity-0 [&_.kanban-col-action]:transition-opacity [&_.kanban-col-action]:duration-(--orvilo-motion-mid) hover:[&_.kanban-col-action]:opacity-100 focus-within:[&_.kanban-col-action]:opacity-100 has-[[data-open]]:[&_.kanban-col-action]:opacity-100 coarse:[&_.kanban-col-action]:opacity-100 motion-reduce:transition-none motion-reduce:[&_.kanban-col-action]:transition-none',
  columnDropActive: stylesRetained.columnDropActive,
  count: 'flex-none text-xs leading-5 tabular-nums',
  header: 'flex gap-2 items-center justify-between min-h-10 py-2.5 ps-3 pe-2',
  headerActions: 'flex gap-0.5 items-center',
  headerTitle: 'flex gap-1.5 items-center min-w-0',
  notDroppable: 'opacity-45',
};

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
            className={cx(
              'flex-1 min-h-0',
              styles.collapsedLabel,
              !upright && styles.collapsedLabelRotated,
            )}
          >
            {label}
          </span>
          <span className={cn('text-muted-foreground', styles.collapsedCount)}>{total}</span>
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
                <Skeleton className="flex-none size-4 rounded-(--radius-chip)" />
                <Skeleton className="min-w-16 w-16 h-5.5" />
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
            {headerVariant !== 'loading' && (
              <span className={cn('text-muted-foreground', styles.count)}>{total}</span>
            )}
          </div>
          <div className={cx(styles.headerActions, 'kanban-col-action')}>
            {onHide && (
              <span className="inline-flex flex-none coarse:p-1.5">
                <ActionIcon
                  className="relative coarse:after:absolute coarse:after:-inset-[calc(var(--spacing)*1.75)] coarse:after:content-['']"
                  icon={ChevronLeft}
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                  title={t('taskList.kanban.hideColumn')}
                  onClick={onHide}
                />
              </span>
            )}
            {onCreate && (
              <span className="inline-flex flex-none coarse:p-1.5">
                <ActionIcon
                  className="relative coarse:after:absolute coarse:after:-inset-[calc(var(--spacing)*1.75)] coarse:after:content-['']"
                  icon={Plus}
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                  title={t('taskList.kanban.addTask')}
                  onClick={onCreate}
                />
              </span>
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
