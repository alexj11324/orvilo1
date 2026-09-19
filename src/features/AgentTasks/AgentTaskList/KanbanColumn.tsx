import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@lobehub/ui';
import { ActionIcon, Skeleton, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { ChevronLeft, Circle, CircleDashed, Plus } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { type ExecutionStatusVisual, TASK_STATUS_VISUALS } from '@/components/ExecutionStatus';
import type { TaskKanbanGroupBy, TaskListItem } from '@/store/task/slices/list/initialState';

import type { TaskItemRouteScope } from '../features/AgentTaskItem';
import { getKanbanColumnHeaderVariant } from './kanbanBoardModel';
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

const SortableTaskCard = memo<{ routeScope?: TaskItemRouteScope; task: TaskListItem }>(
  ({ routeScope, task }) => {
    const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
      data: { task },
      id: task.identifier,
    });

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
      >
        <TaskBoardCard routeScope={routeScope} task={task} />
      </div>
    );
  },
);

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
    gap: 6px;

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

    padding-block: 1px;
    padding-inline: 6px;
    border-radius: 999px;

    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    color: ${cssVar.colorTextTertiary};

    /* Same subtle chip as Cordy's column count — bg slightly off the column
       card so the numeral reads as metadata, not a button. */
    background: ${cssVar.colorFillQuaternary};
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

export const COLUMN_I18N_KEYS: Record<string, string> = {
  backlog: 'taskList.kanban.backlog',
  canceled: 'taskList.kanban.canceled',
  done: 'taskList.kanban.done',
  needsInput: 'taskList.kanban.needsInput',
  running: 'taskList.kanban.running',
  todo: 'taskList.kanban.todo',
  triage: 'taskList.kanban.triage',
};

/**
 * Per-column header glyphs in the shared status-icon family (the same one
 * topic/task rows use): backlog→hollow dot gray, todo→hollow ring blue,
 * running→dot amber, needs-input→clock violet, done→check green,
 * canceled→pause orange. `triage` has no status analog — a dashed circle
 * reads "not yet categorized".
 */
export const COLUMN_STATUS_VISUAL: Record<string, ExecutionStatusVisual> = {
  backlog: TASK_STATUS_VISUALS.backlog,
  canceled: TASK_STATUS_VISUALS.canceled,
  done: TASK_STATUS_VISUALS.completed,
  needsInput: TASK_STATUS_VISUALS.paused,
  running: TASK_STATUS_VISUALS.running,
  todo: { color: cssVar.blue, icon: Circle },
  triage: { color: cssVar.colorTextQuaternary, icon: CircleDashed },
};

interface CollapsedKanbanColumnProps {
  columnKey: string;
  /** Rails stay live drop targets unless the view filtered the column out. */
  droppable: boolean;
  label: string;
  onExpand: () => void;
  statusIcon?: ExecutionStatusVisual;
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
          {statusIcon && <Icon color={statusIcon.color} icon={statusIcon.icon} size={16} />}
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
  loading?: boolean;
  onCreate?: () => void;
  onHide?: () => void;
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
    groupMeta,
    loading,
    onCreate,
    onHide,
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
                <Skeleton.Avatar
                  shape={'square'}
                  size={16}
                  style={{ borderRadius: 4, flex: 'none' }}
                />
                <Skeleton height={14} style={{ minWidth: 64 }} width={64} />
              </>
            ) : headerVariant === 'group' && groupMeta ? (
              <TaskGroupLabel group={groupMeta} />
            ) : (
              <>
                {statusIcon && <Icon color={statusIcon.color} icon={statusIcon.icon} size={16} />}
                <Text fontSize={13} weight={500}>
                  {label}
                </Text>
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
                <SortableTaskCard key={task.identifier} routeScope={routeScope} task={task} />
              ))}
            </SortableContext>
          ) : onCreate ? (
            <div className={styles.addPill} title={t('taskList.kanban.addTask')} onClick={onCreate}>
              <Icon icon={Plus} size={16} />
            </div>
          ) : null}
          {footer}
        </div>
      </div>
    );
  },
);

export default KanbanColumn;
