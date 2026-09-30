import { cssVar } from 'antd-style';
import { ClipboardCheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Components } from 'react-virtuoso';
import { Virtuoso } from 'react-virtuoso';

import AsyncBoundary from '@/components/AsyncBoundary';
import SimpleEmpty from '@/components/SimpleEmpty';
import { Accordion, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { isInteractiveRowClick } from '@/features/MyWork/myWorkDisplay';
import { taskMilestoneById, type TaskMilestoneRef } from '@/features/Projects/milestoneFilter';
import { useTaskStore } from '@/store/task';
import { taskListSelectors } from '@/store/task/selectors';
import { COMPLETE_TASK_LIST_MAX_ITEMS } from '@/store/task/slices/list/action';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import type { TaskItemRouteScope } from '../features/AgentTaskItem';
import AgentTaskItem from '../features/AgentTaskItem';
import { issueIdColumnStyle } from '../shared/issueIdColumn';
import type { TaskGroupBy, TaskGroupMeta, TaskListViewOptions } from './listViewOptions';
import {
  buildTaskRows,
  collapseSubTasks,
  compareTaskItems,
  groupTaskItems,
  HIDDEN_WHEN_COMPLETED_STATUSES,
} from './listViewOptions';
import TaskGroupLabel from './TaskGroupLabel';
import TaskItemSkeleton from './TaskItemSkeleton';
import type { TaskListGroupEntry, TaskListVirtualItem } from './taskListVirtualModel';
import { flattenTaskListEntries } from './taskListVirtualModel';
import TaskRowIndent from './TaskRowIndent';
import { useClosestScrollParent } from './useClosestScrollParent';

interface TaskListProps {
  /**
   * Settled signal — truthy once the current scope's list has loaded into the
   * store, `undefined` while unsettled. Derived from the store's
   * `isTaskListInit` (not raw SWR `data`) so it resets in lockstep with `tasks`
   * on a scope/visibility switch and never disagrees with the empty signal.
   */
  data?: unknown;
  emptyDescription?: string;
  /** Thrown error from the list SWR — surfaced as a failure state, not a skeleton. */
  error?: unknown;
  /** First-load / retry in flight (SWR `isLoading`). */
  isLoading?: boolean;
  /** Optional list source for alternate task collections such as scheduled tasks. */
  items?: TaskListItem[];
  /**
   * The scope's milestone catalog — resolves `projectMilestoneId` into a label
   * for milestone grouping and the row badge. Absent on scopes that have no
   * catalog; milestone grouping still buckets by id there, but nothing offers
   * that dimension, and badges stay off.
   */
  milestones?: readonly TaskMilestoneRef[];
  /** Double-click escape to the full task page while peek mode is armed. */
  onOpenTask?: (task: TaskListItem) => void;
  onRetry?: () => void;
  /**
   * Peek mode (the issues surface's "Open details"): with `peekOnSelect`,
   * plain row clicks select the row for the side pane instead of navigating —
   * the row's own click is stopped in the capture phase.
   */
  onSelectTask?: (task: TaskListItem) => void;
  onShowHiddenCompleted?: () => void;
  options: TaskListViewOptions;
  peekOnSelect?: boolean;
  routeScope?: TaskItemRouteScope;
  /** Identifier of the peek-selected row — paints the selected background. */
  selectedIdentifier?: string;
}

const HIDDEN_COMPLETED_STATUS_SET = new Set<string>(HIDDEN_WHEN_COMPLETED_STATUSES);

/** Row height the window sizes itself by before it has measured real rows. */
const DEFAULT_ROW_HEIGHT = 44;

const TASK_GROUP_BY_VALUES = new Set<TaskGroupBy>([
  'assignee',
  'automationMode',
  'member',
  'milestone',
  'none',
  'priority',
  'status',
]);

const normalizeGroupBy = (value: TaskGroupBy | string | undefined, fallback: TaskGroupBy) => {
  if (!value) return fallback;
  return TASK_GROUP_BY_VALUES.has(value as TaskGroupBy) ? (value as TaskGroupBy) : fallback;
};

const renderGroupTitle = (group: TaskGroupMeta, count: number, sub?: boolean) => (
  <div className="flex items-center justify-between gap-2">
    <TaskGroupLabel group={group} />
    <div className="text-[12px] text-muted-foreground">{count}</div>
    {sub ? (
      <Separator
        className="flex-1"
        style={{
          background: 'transparent',
          borderTop: `1px solid ${cssVar.colorBorder}`,
          height: 'auto',
          margin: 0,
        }}
      />
    ) : (
      <div className="flex-1" />
    )}
  </div>
);

/**
 * Group / sub-group header as a standalone (context-free) AccordionItem so the
 * virtual list keeps the Accordion look while owning the expand state itself.
 * It renders no content: the rows it opens are the sibling virtual items.
 */
const TaskGroupHeader = memo<{
  item: Extract<TaskListVirtualItem, { kind: 'group' | 'subGroup' }>;
  onToggle: (key: string) => void;
}>(({ item, onToggle }) => {
  const sub = item.kind === 'subGroup';
  return (
    <div style={{ paddingTop: item.first ? 0 : 8 }}>
      <Accordion
        multiple
        value={item.collapsed ? [] : [item.key]}
        onValueChange={() => onToggle(item.key)}
      >
        <AccordionItem className="border-b-0" value={item.key}>
          <div
            style={{
              paddingBlock: 4,
              paddingInline: 12,
              background: cssVar.colorFillQuaternary,
              borderRadius: 6,
            }}
          >
            <AccordionTrigger
              className="[&_[data-slot=accordion-trigger-icon]]:mr-2 [&_[data-slot=accordion-trigger-icon]]:ml-0 [&_[data-slot=accordion-trigger-icon]]:order-first"
              style={{ padding: 0, minHeight: 28 }}
            >
              {renderGroupTitle(item.meta, item.count, sub)}
            </AccordionTrigger>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
});

interface TaskListVirtualContext {
  footer: ReactNode;
}

const TaskListFooter = ({ context }: { context?: TaskListVirtualContext }) => (
  <>{context?.footer}</>
);

const VIRTUAL_LIST_COMPONENTS: Components<TaskListVirtualItem, TaskListVirtualContext> = {
  Footer: TaskListFooter,
};

const TaskList = memo<TaskListProps>((props) => {
  const {
    data,
    error,
    isLoading,
    items,
    milestones,
    onOpenTask,
    onRetry,
    onSelectTask,
    onShowHiddenCompleted,
    options,
    peekOnSelect,
    routeScope,
    selectedIdentifier,
  } = props;
  const { t } = useTranslation('chat');
  const storeTasks = useTaskStore(taskListSelectors.taskList);
  const storeTasksTotal = useTaskStore(taskListSelectors.taskListTotal);
  const tasks = items ?? storeTasks;
  const milestoneById = useMemo(() => taskMilestoneById(milestones), [milestones]);
  // The store list is fetched in full up to a ceiling; past it the server's
  // `total` still counts every task, so say the list is a subset rather than
  // let the missing rows vanish silently. Alternate collections (`items`)
  // paginate on their own.
  const isTruncated = !items && storeTasksTotal > COMPLETE_TASK_LIST_MAX_ITEMS;
  const groupBy = normalizeGroupBy(
    // Milestone grouping needs a catalog to name its buckets; a stored pick
    // traveling to a scope without one (the global/agent lists) degrades to
    // status rather than grouping on raw ids.
    options.groupBy === 'milestone' && !milestoneById ? 'status' : options.groupBy,
    'status',
  );
  const subGroupBy = normalizeGroupBy(
    // Same catalog check for the secondary dimension — without one a stored
    // 'milestone' pick would subgroup on raw ids, so it simply drops.
    options.subGroupBy === 'milestone' && !milestoneById ? 'none' : options.subGroupBy,
    'none',
  );
  const effectiveSubGroupBy = groupBy === 'none' ? 'none' : subGroupBy;
  const unfinishedTasks = useMemo(
    () =>
      options.hideCompleted
        ? tasks.filter((task) => !HIDDEN_COMPLETED_STATUS_SET.has(task.status))
        : tasks,
    [tasks, options.hideCompleted],
  );
  // Only the completed/canceled cut feeds the "hidden by display options"
  // footer — its "Show" action clears `hideCompleted`, so folding the sub-task
  // count in would promise a reveal that toggle doesn't deliver.
  const hiddenCount = tasks.length - unfinishedTasks.length;
  const visibleTasks = useMemo(
    () => (options.showSubTasks ? unfinishedTasks : collapseSubTasks(unfinishedTasks)),
    [options.showSubTasks, unfinishedTasks],
  );
  // Keyed off the full list, not the visible one: a nested child's parent may
  // sit in another group, or be hidden by the display options, and still has to
  // resolve into a context row.
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const nested = options.showSubTasks && options.nestedSubTasks;
  const groupedTaskEntries = useMemo((): TaskListGroupEntry[] => {
    const compare = (a: (typeof visibleTasks)[number], b: (typeof visibleTasks)[number]) =>
      compareTaskItems(a, b, options);
    const toRows = (items: typeof visibleTasks) =>
      buildTaskRows(items, { compare, nested, taskById });
    const sortedTasks = [...visibleTasks].sort(compare);
    const primaryGroupOrderDirection =
      options.orderBy === groupBy ? options.orderDirection : undefined;
    const subGroupOrderDirection =
      options.orderBy === effectiveSubGroupBy ? options.orderDirection : undefined;

    const primaryGroups = groupTaskItems(
      sortedTasks,
      groupBy,
      primaryGroupOrderDirection,
      milestoneById,
    );

    return primaryGroups.map(([meta, groupedTasks]) => {
      if (effectiveSubGroupBy === 'none') {
        return { count: groupedTasks.length, meta, rows: toRows(groupedTasks), subGroups: [] };
      }

      return {
        count: groupedTasks.length,
        meta,
        rows: toRows(groupedTasks),
        subGroups: groupTaskItems(
          groupedTasks,
          effectiveSubGroupBy,
          subGroupOrderDirection,
          milestoneById,
        ).map(([subMeta, subItems]) => ({
          count: subItems.length,
          meta: subMeta,
          rows: toRows(subItems),
        })),
      };
    });
  }, [effectiveSubGroupBy, groupBy, milestoneById, nested, options, taskById, visibleTasks]);

  // Collapse state lives here (not in the Accordion) because headers and rows
  // are flattened into one virtual list; a collapsed key simply drops its rows
  // from that list. Keys survive a re-group only when the group keys do.
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const virtualItems = useMemo(
    () =>
      flattenTaskListEntries(groupedTaskEntries, {
        collapsed: collapsedKeys,
        grouped: groupBy !== 'none',
      }),
    [collapsedKeys, groupBy, groupedTaskEntries],
  );

  // The page scrolls in an ancestor (`WideScreenContainer`'s wrapper), with the
  // inline composer above this list. Windowing against that ancestor keeps the
  // page layout intact instead of nesting a second scroller.
  const { ref: anchorRef, scrollParent } = useClosestScrollParent();

  const peekArmed = Boolean(peekOnSelect && onSelectTask);

  const renderItem = useCallback(
    (_index: number, item: TaskListVirtualItem) => {
      if (item.kind !== 'row') return <TaskGroupHeader item={item} onToggle={toggleCollapsed} />;
      // The chip only renders when the display property is on AND the catalog
      // names the link — an unresolved id would paint a raw id, which is
      // worse than no badge.
      const milestone =
        options.showMilestone && item.row.task.projectMilestoneId
          ? milestoneById?.get(item.row.task.projectMilestoneId)
          : undefined;
      const selected = peekArmed && item.row.task.identifier === selectedIdentifier;
      return (
        // Matches the 2px row gap the former Block wrapper gave the list.
        <div
          aria-current={selected ? 'true' : undefined}
          style={{
            borderRadius: 6,
            paddingBlock: 1,
            paddingInline: 2,
            ...(selected ? { background: cssVar.colorFillTertiary } : undefined),
          }}
          onClickCapture={
            // Peek mode intercepts plain clicks in the capture phase — before
            // the row's own navigate — while interactive children (menus,
            // popovers, links) keep theirs.
            peekArmed
              ? (event) => {
                  if (isInteractiveRowClick(event.target)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectTask?.(item.row.task);
                }
              : undefined
          }
          onDoubleClick={
            peekArmed && onOpenTask
              ? (event) => {
                  if (isInteractiveRowClick(event.target)) return;
                  onOpenTask(item.row.task);
                }
              : undefined
          }
        >
          <TaskRowIndent depth={item.row.depth} muted={item.row.isParentContext}>
            <AgentTaskItem milestone={milestone} routeScope={routeScope} task={item.row.task} />
          </TaskRowIndent>
        </div>
      );
    },
    [
      milestoneById,
      onOpenTask,
      onSelectTask,
      options.showMilestone,
      peekArmed,
      routeScope,
      selectedIdentifier,
      toggleCollapsed,
    ],
  );

  const skeleton = (
    <div className="flex flex-col gap-0.5 p-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={`task-skeleton-${index}`}>
          <TaskItemSkeleton />
          {index !== 4 && (
            <Separator
              style={{
                background: 'transparent',
                borderTop: `1px dashed ${cssVar.colorBorderSecondary}`,
                height: 'auto',
                margin: 0,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );

  const emptyState = (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <SimpleEmpty
        description={props.emptyDescription ?? t('taskList.empty')}
        icon={ClipboardCheckIcon}
      />
    </div>
  );

  const hiddenFooter = hiddenCount > 0 && (
    <div className="flex items-center justify-center gap-4 py-4" style={{ fontSize: 13 }}>
      <div className="flex items-center gap-1.5">
        <div className="font-medium">
          {t('taskList.hiddenCompleted.count', { count: hiddenCount })}
        </div>
        <div className="text-muted-foreground">{t('taskList.hiddenCompleted.suffix')}</div>
      </div>
      {onShowHiddenCompleted && (
        <div className="font-medium" style={{ cursor: 'pointer' }} onClick={onShowHiddenCompleted}>
          {t('taskList.hiddenCompleted.show')}
        </div>
      )}
    </div>
  );

  const truncatedFooter = isTruncated && (
    <div className="flex items-center justify-center py-4">
      <div className="text-[13px] text-muted-foreground">
        {t('taskList.truncated', { loaded: tasks.length, total: storeTasksTotal })}
      </div>
    </div>
  );

  // Error is gated ahead of empty by AsyncBoundary, so a failed fetch shows a
  // Retry block instead of the "no tasks" empty. `data` is the
  // store-derived settled signal — see the `data` prop doc above.
  return (
    <AsyncBoundary
      data={data}
      empty={emptyState}
      error={error}
      errorVariant={'block'}
      isEmpty={tasks.length === 0}
      isLoading={isLoading}
      loading={skeleton}
      onRetry={onRetry}
    >
      <div
        ref={anchorRef}
        style={{ width: '100%', ...issueIdColumnStyle(tasks.map((task) => task.identifier)) }}
      >
        {scrollParent && (
          <Virtuoso
            // Footer belongs to the window so it follows the last rendered row
            // rather than sitting under an unrendered tail.
            components={VIRTUAL_LIST_COMPONENTS}
            computeItemKey={(_index, item) => item.key}
            customScrollParent={scrollParent}
            data={virtualItems}
            defaultItemHeight={DEFAULT_ROW_HEIGHT}
            increaseViewportBy={{ bottom: 600, top: 600 }}
            itemContent={renderItem}
            context={{
              footer: (
                <>
                  {hiddenFooter}
                  {truncatedFooter}
                </>
              ),
            }}
          />
        )}
      </div>
    </AsyncBoundary>
  );
});

export default TaskList;
