'use client';

import {
  normalizeWorkQuerySubGroupBy,
  type TaskWorkflowCategory,
  type WorkQuery,
  type WorkQueryExternalReview,
  type WorkQueryGroupBy,
  type WorkQueryLayout,
  type WorkQuerySortMode,
} from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import {
  BellOffIcon,
  BellPlusIcon,
  ChevronDownIcon,
  GitPullRequestIcon,
  ListTodoIcon,
  PlusIcon,
} from 'lucide-react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createElement, memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import KanbanBoard from '@/features/AgentTasks/AgentTaskList/KanbanBoard';
import {
  COLUMN_I18N_KEYS,
  type TaskStatusChoice,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { COLUMN_STATUS_VISUAL } from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { DEFAULT_TASK_LIST_VIEW_OPTIONS } from '@/features/AgentTasks/AgentTaskList/listViewOptions';
import TaskRowIndent from '@/features/AgentTasks/AgentTaskList/TaskRowIndent';
import AgentTaskItem from '@/features/AgentTasks/features/AgentTaskItem';
import { issueIdColumnStyle } from '@/features/AgentTasks/shared/issueIdColumn';
import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';

import {
  bulkGestureFromModifiers,
  bulkOrderedRowIds,
  type BulkSelectGesture,
} from './bulkSelection';
import { externalReviewIdentifier, externalReviewOpenHref } from './externalReviewOpen';
import {
  activityBucketRank,
  isInteractiveRowClick,
  myWorkPriorityGroupRank,
  type MyWorkRowProperty,
} from './myWorkDisplay';
import {
  workQueryBoardGroups,
  workQueryListGroupBy,
  workQuerySourceKeysForKanbanColumn,
} from './workQueryBoard';
import { applyWorkQueryStatusChoice } from './workQueryBoardMove';
import { workQueryHierarchyRows } from './workQueryHierarchy';
import {
  type WorkQueryGroupPage,
  workQueryHasMore,
  type WorkQueryResultTask,
} from './workQueryPaging';
import WorkQueryVirtualList from './WorkQueryVirtualList';

export type { WorkQueryResultTask } from './workQueryPaging';

const styles = createStaticStyles(({ css }) => ({
  rowHideAssignee: css`
    & [data-collab-id$=':assignee'] {
      display: none;
    }
  `,
  rowHideLabels: css`
    & [data-task-labels] {
      display: none;
    }
  `,
  rowHidePriority: css`
    & div:has(> [data-collab-id$=':status']) > :first-child {
      display: none;
    }
  `,
  rowHideStatus: css`
    & [data-collab-id$=':status'] {
      display: none;
    }
  `,
  rowHideUpdated: css`
    & div:has(> [data-collab-id$=':assignee']) > :last-child:not([data-collab-id$=':assignee']) {
      display: none;
    }
  `,
}));

/** Property → row modifier class, in one place so a hidden chip is one lookup. */
const ROW_PROPERTY_HIDE_CLASS: Record<MyWorkRowProperty, string | undefined> = {
  assignee: styles.rowHideAssignee,
  labels: styles.rowHideLabels,
  // project + milestone chips are caller-supplied (rowExtras / milestone
  // prop) — the page drops them upstream instead of hiding DOM.
  milestone: undefined,
  priority: styles.rowHidePriority,
  project: undefined,
  status: styles.rowHideStatus,
  updated: styles.rowHideUpdated,
};

const rowPropertyClassNames = (hidden?: ReadonlySet<MyWorkRowProperty>): string[] => {
  if (!hidden || hidden.size === 0) return [];
  const classes: string[] = [];
  for (const property of hidden) {
    const className = ROW_PROPERTY_HIDE_CLASS[property];
    if (className) classes.push(className);
  }
  return classes;
};

/** Second-level section inside a list group — Linear's nested sub-headers. */
export interface WorkQuerySubSection {
  icon?: ReactNode;
  key: string;
  tasks: WorkQueryResultTask[];
  title: string;
}

interface WorkQueryResultsProps {
  /**
   * Override the default rank for one axis. Milestone lists pass catalog
   * order; other axes keep their built-in rank.
   */
  axisKeyRank?: (axis: string, key: string) => number | undefined;
  /**
   * Multi-selected task ids — rows paint checked + highlight and reveal
   * their checkbox without waiting for hover. Absent = no bulk affordance.
   */
  bulkSelectedIds?: ReadonlySet<string>;
  /** Work-query board columns the user collapsed. Persisted by the caller. */
  collapsedColumns?: readonly string[];
  /**
   * List groups the user collapsed. When `onCollapsedGroupsChange` is set the
   * list is controlled; otherwise collapse lasts for the session.
   */
  collapsedGroups?: readonly string[];
  /**
   * Where the board's create entry should file a new card. `teamId` files it
   * directly; `teamOptions` makes the create modal ask the one ambiguous
   * choice (a cross-team view). Neither means create stays hidden.
   */
  createContext?: { teamId?: string; teamOptions?: { id: string; name: string }[] };
  emptyLabel: string;
  externalReviews?: WorkQueryExternalReview[];
  /** Filters narrowed the set to nothing: say so instead of "nothing here yet". */
  filtered?: boolean;
  /**
   * Nest children under parents already in the set. On My Work this is the
   * flat list and the attention groups. `nestInGroups` also nests inside a
   * server group, which the project issue list does.
   */
  flatNested?: boolean;
  /**
   * Sections rendered in place of the flat list when the effective grouping
   * is `none` — My issues uses it for the client-side day/field buckets the
   * work-query groupBy enum cannot express. `icon` is the optional group
   * header glyph (priority icon, assignee avatar, …).
   */
  flatSections?: { icon?: ReactNode; key: string; tasks: WorkQueryResultTask[]; title: string }[];
  groupBy?: WorkQueryGroupBy;
  /** Optional header glyph for a server group (assignee avatar, priority icon). */
  groupIcon?: (axis: string, key: string) => ReactNode;
  /** Primary-group order. Activity date uses its own recency rank. */
  groupRank?: (key: string) => number;
  groups?: WorkQueryGroupPage<WorkQueryResultTask>[];
  /** Header label for a server group. Status and workflow fall back to their marks. */
  groupTitle?: (axis: string, key: string) => string | undefined;
  /**
   * Display-property toggles — the set of row chips to hide. Project and
   * milestone chips are caller-supplied (`rowExtras`/`milestoneFor`), so the
   * page simply stops supplying them; the rest hide inside the shared row.
   */
  hiddenRowProperties?: ReadonlySet<MyWorkRowProperty>;
  /**
   * Board chrome: hide columns whose group is empty (Linear's team-issues
   * board default). Off unless the caller's reference hides empty columns.
   */
  hideEmptyColumns?: boolean;
  isFollowed?: (taskId: string) => boolean;
  layout?: WorkQueryLayout;
  loading: boolean;
  loadingLabel: string;
  /**
   * Rejection from a tail-page fetch (`onLoadMore` / `onLoadMoreGroup`) —
   * rendered inline under the results so the failed page offers a retry
   * instead of dying as an unhandled rejection.
   */
  loadMoreError?: unknown;
  /**
   * Per-group tail-page failures keyed by work-query group key — the failed
   * group's own footer (list header row / board column) swaps its load-more
   * button for an inline retry instead of one surface-level error.
   */
  loadMoreGroupErrors?: Record<string, unknown>;
  loadMoreLabel: string;
  /**
   * Resolve a row's milestone for the `◆ name · date` badge — the page owns
   * the project-milestone catalog; `undefined` renders no badge.
   */
  milestoneFor?: (task: WorkQueryResultTask) => TaskMilestoneRef | undefined;
  movable?: boolean;
  nestInGroups?: boolean;
  /**
   * Multi-select row gesture: cmd/ctrl-click `toggle`, shift-click `range`.
   * The row passes the rendered `data-bulk-row-id` order so ranges follow
   * what's on screen (collapsed groups never join a range).
   */
  onBulkSelectTask?: (
    task: WorkQueryResultTask,
    gesture: BulkSelectGesture,
    orderedRowIds: string[],
  ) => void;
  onClearFilters?: () => void;
  onCollapsedColumnsChange?: (keys: string[]) => void;
  onCollapsedGroupsChange?: (keys: string[]) => void;
  /**
   * Hover `+` on caller-computed (`flatSections`) headers. Only supplied when
   * the bucket key is a real create preset (e.g. a project id) — day/priority
   * buckets have nothing honest to preset, so they keep the header bare.
   */
  onCreateInFlatSection?: (sectionKey: string) => void;
  /** Group-header hover `+` — the handler owns the actual create flow. */
  onCreateInGroup?: (groupKey: string) => void;
  onLoadMore?: () => void;
  onLoadMoreGroup?: (key: string) => void;
  onMoved?: () => void;
  /** Full-page escape for peek mode — the row's double-click. */
  onOpenTask?: (task: WorkQueryResultTask) => void;
  /** Re-issues the failed tail-page request shown by `loadMoreError`. */
  onRetryLoadMore?: () => void;
  /** Re-issues the failed page request for one group key (`loadMoreGroupErrors`). */
  onRetryLoadMoreGroup?: (key: string) => void;
  /** Row click in peek mode: select the task instead of navigating away. */
  onSelectTask?: (task: WorkQueryResultTask) => void;
  onToggleFollow?: (taskId: string, followed: boolean) => void;
  /**
   * Non-interactive row clicks call `onSelectTask` and suppress the row's
   * built-in navigation — the details-peek contract. Off by default.
   */
  peekOnSelect?: boolean;
  /** Trailing row chips (e.g. the project tag) — rendered before the actions. */
  rowExtras?: (task: WorkQueryResultTask) => ReactNode;
  /** Identifier of the peek-selected row — paints the selected background. */
  selectedTaskId?: string;
  /** Saved-view sort mode — `field` boards refuse same-column position writes. */
  sortMode?: WorkQuerySortMode;
  /** Second axis. A board draws it as swimlanes; a list draws it as nested headers. */
  subGroupBy?: WorkQuery['subGroupBy'];
  /**
   * Second-level grouping inside each list section — Linear's "Sub-grouping"
   * nested headers. Called with a section's tasks; `undefined` renders the
   * flat body. Sub-sections never nest further (Linear stops at two levels).
   */
  subSectionsFor?: (tasks: WorkQueryResultTask[]) => WorkQuerySubSection[] | undefined;
  tasks: WorkQueryResultTask[];
  total?: number;
}

export const WorkQueryTaskRow = memo(
  ({
    followed,
    depth = 0,
    bulkSelected,
    bulkSelectionActive,
    hiddenProperties,
    milestoneFor,
    onBulkSelectTask,
    onMoved,
    onOpenTask,
    onSelectTask,
    onToggleFollow,
    peekOnSelect,
    rangeIds,
    rowExtras,
    selected,
    task,
    muted,
  }: {
    followed?: boolean;
    depth?: number;
    bulkSelected?: boolean;
    /** Any selection — every row's checkbox stays revealed (Linear). */
    bulkSelectionActive?: boolean;
    /** Display properties the user switched off — hide their chips in place. */
    hiddenProperties?: ReadonlySet<MyWorkRowProperty>;
    /** Resolves the row's milestone for the `◆` badge — `undefined` renders nothing. */
    milestoneFor?: (task: WorkQueryResultTask) => TaskMilestoneRef | undefined;
    onBulkSelectTask?: (
      task: WorkQueryResultTask,
      gesture: BulkSelectGesture,
      orderedRowIds: string[],
    ) => void;
    onMoved?: () => void;
    onOpenTask?: (task: WorkQueryResultTask) => void;
    onSelectTask?: (task: WorkQueryResultTask) => void;
    onToggleFollow?: (taskId: string, followed: boolean) => void;
    peekOnSelect?: boolean;
    /** In-memory row order for shift-range. Windowed lists pass this because off-screen rows are not in the DOM. */
    rangeIds?: readonly string[];
    rowExtras?: (task: WorkQueryResultTask) => ReactNode;
    selected?: boolean;
    task: WorkQueryResultTask;
    muted?: boolean;
  }) => {
    const { t } = useTranslation('common');
    const handleStatusChange = useCallback(
      async (choice: TaskStatusChoice) => {
        const applied = await applyWorkQueryStatusChoice({ choice, task });
        if (applied) onMoved?.();
      },
      [onMoved, task],
    );

    /**
     * Capture-phase row clicks: modifier gestures are multi-select ops and
     * never navigate; plain clicks keep their peek contract. The capture
     * phase is the only point before `AgentTaskItem`'s own click fires —
     * interactive children (menus, popovers, buttons, the bulk checkbox)
     * are detected and left alone.
     */
    const handleClickCapture = useCallback(
      (event: ReactMouseEvent) => {
        if (isInteractiveRowClick(event.target)) return;
        const gesture = bulkGestureFromModifiers(event);
        if (gesture && onBulkSelectTask) {
          event.preventDefault();
          event.stopPropagation();
          // Ranges follow the rendered order — read the rows' DOM order at
          // click time so collapsed groups never join the slice.
          const list = (event.currentTarget as HTMLElement).closest('[data-bulk-list]');
          onBulkSelectTask(
            task,
            gesture,
            gesture === 'range'
              ? [...(rangeIds ?? (list ? bulkOrderedRowIds(list) : [task.id]))]
              : [task.id],
          );
          return;
        }
        if (!peekOnSelect || !onSelectTask) return;
        event.preventDefault();
        event.stopPropagation();
        onSelectTask(task);
      },
      [onBulkSelectTask, onSelectTask, peekOnSelect, rangeIds, task],
    );

    const handleDoubleClick = useCallback(
      (event: ReactMouseEvent) => {
        // Double-click is the full-page escape — but not on interactive
        // chrome (menus, subtask tag, links) that owns its own gesture.
        if (isInteractiveRowClick(event.target)) return;
        onOpenTask?.(task);
      },
      [onOpenTask, task],
    );

    // The same rich row /tasks renders — identifier, status glyph, title,
    // chips, assignee, date — instead of a second, thinner task row.
    // The default checkbox's 40px hit area stays inside the 48px gutter,
    // leaving 8px before the task background and its own interactive controls.
    return (
      <div
        aria-current={selected ? 'true' : undefined}
        aria-selected={bulkSelected ? 'true' : undefined}
        data-bulk-row-id={onBulkSelectTask ? task.id : undefined}
        data-bulk-selected={bulkSelected || undefined}
        className={cn(
          'group/work-row relative flex items-center rounded-lg pe-2',
          selected && 'bg-accent',
          bulkSelected && 'bg-primary/10',
          ...rowPropertyClassNames(hiddenProperties),
        )}
        onDoubleClick={peekOnSelect && onOpenTask ? handleDoubleClick : undefined}
        onClickCapture={
          (peekOnSelect && onSelectTask) || onBulkSelectTask ? handleClickCapture : undefined
        }
      >
        {onBulkSelectTask ? (
          <span data-row-interactive className="flex w-12 shrink-0 items-center ps-3">
            <span
              data-row-control={'select'}
              className={cn(
                'work-query-bulk-check flex items-center opacity-0 transition-opacity group-hover/work-row:opacity-100 group-focus-within/work-row:opacity-100 [@media(hover:none)]:opacity-100',
                (bulkSelected || bulkSelectionActive) && 'opacity-100',
              )}
            >
              <Checkbox
                aria-label={t('myWork.bulk.selectRow')}
                checked={Boolean(bulkSelected)}
                className="data-unchecked:border-muted-foreground data-unchecked:hover:border-foreground"
                onCheckedChange={() => onBulkSelectTask(task, 'toggle', [task.id])}
              />
            </span>
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <TaskRowIndent depth={depth} muted={muted}>
            <AgentTaskItem
              milestone={milestoneFor?.(task)}
              routeScope={'global'}
              showParent={depth === 0}
              task={{ ...task, participants: task.participants ?? [] }}
              trailingChips={rowExtras?.(task)}
              onStatusChange={handleStatusChange}
            />
          </TaskRowIndent>
        </div>
        {onToggleFollow ? (
          <span className="work-query-row-actions shrink-0 opacity-0 transition-opacity group-hover/work-row:opacity-100 group-focus-within/work-row:opacity-100 [@media(hover:none)]:opacity-100">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={followed ? t('myWork.unsubscribe') : t('myWork.subscribe')}
                    size="icon"
                    variant="ghost"
                    onClick={() => onToggleFollow(task.id, Boolean(followed))}
                  />
                }
              >
                {followed ? <BellOffIcon /> : <BellPlusIcon />}
              </TooltipTrigger>
              <TooltipContent>
                {followed ? t('myWork.unsubscribe') : t('myWork.subscribe')}
              </TooltipContent>
            </Tooltip>
          </span>
        ) : null}
      </div>
    );
  },
);

WorkQueryTaskRow.displayName = 'WorkQueryTaskRow';

/**
 * Collapsible status headers in Linear's list order. Membership uses the
 * same Cordy column keys as the board (`workQueryListGroups`) so a Linear
 * In-review card does not sit under Running in the list and Needs input
 * on the board.
 */
const WorkQueryStatusGroup = memo<{
  columnKey: string;
  groupBy: 'status' | 'workflowCategory';
  attention?: boolean;
  allTasks: WorkQueryResultTask[];
  bulkSelectedIds?: ReadonlySet<string>;
  bulkSelectionActive?: boolean;
  createLabel?: string;
  hasMore?: boolean;
  hiddenProperties?: ReadonlySet<MyWorkRowProperty>;
  /** Optional header glyph — field-bucket sections (priority icon, avatar). */
  icon?: ReactNode;
  isFollowed?: (taskId: string) => boolean;
  /**
   * Which axis the group key names, when it differs from `groupBy` (the axis a
   * row's status change writes). Attention tail buckets are workflow states
   * while their rows still edit the run status.
   */
  keyAxis?: 'status' | 'workflowCategory';
  /** Explicit header text — date buckets etc. that are not status keys. */
  label?: string;
  /**
   * Rejection from this group's own tail-page fetch — swaps the load-more
   * button for an inline retry scoped to this group.
   */
  loadMoreError?: unknown;
  loadMoreLabel?: string;
  milestoneFor?: (task: WorkQueryResultTask) => TaskMilestoneRef | undefined;
  nested?: boolean;
  onBulkSelectTask?: (
    task: WorkQueryResultTask,
    gesture: BulkSelectGesture,
    orderedRowIds: string[],
  ) => void;
  onCreateInGroup?: (groupKey: string) => void;
  onLoadMore?: () => void;
  onMoved?: () => void;
  onOpenTask?: (task: WorkQueryResultTask) => void;
  /** Re-issues this group's failed tail-page request (`loadMoreError`). */
  onRetryLoadMore?: () => void;
  onSelectTask?: (task: WorkQueryResultTask) => void;
  onToggleFollow?: (taskId: string, followed: boolean) => void;
  peekOnSelect?: boolean;
  rowExtras?: (task: WorkQueryResultTask) => ReactNode;
  selectedTaskId?: string;
  /** Rendered as the nested second-level header, not a top-level group. */
  subGroup?: boolean;
  /**
   * Nested second-level sections (Linear's Sub-grouping) — when present they
   * replace the flat row body; the group's own load-more footer stays.
   */
  subSections?: WorkQuerySubSection[];
  tasks: WorkQueryResultTask[];
  total?: number;
}>(
  ({
    columnKey,
    attention,
    allTasks,
    bulkSelectedIds,
    bulkSelectionActive,
    createLabel,
    groupBy,
    hasMore,
    hiddenProperties,
    icon,
    isFollowed,
    keyAxis,
    label,
    loadMoreError,
    loadMoreLabel,
    milestoneFor,
    nested,
    onBulkSelectTask,
    onCreateInGroup,
    onLoadMore,
    onMoved,
    onOpenTask,
    onRetryLoadMore,
    onSelectTask,
    onToggleFollow,
    peekOnSelect,
    rowExtras,
    selectedTaskId,
    subGroup,
    subSections,
    tasks,
    total,
  }) => {
    const { t } = useTranslation('chat');
    const [collapsed, setCollapsed] = useState(false);
    // Group keys are raw dimension members: a `backlog`/`canceled` header in a
    // workflow-grouped list is a business category (workflow map), while the
    // same key in a status-grouped list is a run state (`st:` execution
    // visual). Attention buckets (`urgent`/`blocking`) have no `st:` entry and
    // fall through to their flat key.
    const visual =
      (keyAxis ?? groupBy) === 'workflowCategory'
        ? (WORKFLOW_CATEGORY_VISUALS[columnKey as TaskWorkflowCategory] ??
          COLUMN_STATUS_VISUAL[columnKey])
        : (COLUMN_STATUS_VISUAL[`st:${columnKey}`] ?? COLUMN_STATUS_VISUAL[columnKey]);
    const labelKey = COLUMN_I18N_KEYS[columnKey];
    const hierarchyRows = nested
      ? workQueryHierarchyRows(tasks, allTasks)
      : tasks.map((task) => ({ depth: 0, isParentContext: false, task }));

    return (
      <div className="flex flex-col">
        <div
          className={cn(
            'group/work-group sticky top-0 z-2 flex items-center gap-1 bg-background pe-1',
            subGroup && 'static ps-4',
          )}
        >
          <Button
            aria-expanded={!collapsed}
            className="min-w-0 flex-1 justify-start"
            variant="ghost"
            onClick={() => setCollapsed((current) => !current)}
          >
            <ChevronDownIcon
              className={cn(
                'shrink-0 text-muted-foreground transition-transform',
                collapsed && '-rotate-90',
              )}
            />
            {visual && !attention && !label && !icon
              ? createElement(visual.icon, { className: 'size-4 shrink-0', color: visual.color })
              : null}
            {icon}
            <span className="truncate">
              {label ?? (labelKey ? t(labelKey as never) : columnKey)}
            </span>
            <span className="text-muted-foreground">{total ?? tasks.length}</span>
          </Button>
          {onCreateInGroup ? (
            <span className="work-query-group-actions shrink-0 opacity-0 transition-opacity group-hover/work-group:opacity-100 group-focus-within/work-group:opacity-100 [@media(hover:none)]:opacity-100">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={createLabel ?? t('taskList.kanban.addTask')}
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateInGroup(columnKey);
                      }}
                    />
                  }
                >
                  <PlusIcon />
                </TooltipTrigger>
                <TooltipContent>{createLabel ?? t('taskList.kanban.addTask')}</TooltipContent>
              </Tooltip>
            </span>
          ) : null}
        </div>
        {collapsed ? null : (
          <div className="flex flex-col">
            {subSections && subSections.length > 0 ? (
              /* Linear's nested sub-headers: the second level groups the
                 section's rows under its own collapsible headers. Sub-groups
                 never nest further, and the primary group keeps its create
                 `+` and load-more footer. */
              <div className="flex flex-col gap-1">
                {subSections.map((section) => (
                  <WorkQueryStatusGroup
                    subGroup
                    allTasks={allTasks}
                    bulkSelectedIds={bulkSelectedIds}
                    bulkSelectionActive={bulkSelectionActive}
                    columnKey={section.key}
                    groupBy={groupBy}
                    hiddenProperties={hiddenProperties}
                    icon={section.icon}
                    isFollowed={isFollowed}
                    key={section.key}
                    label={section.title}
                    milestoneFor={milestoneFor}
                    nested={nested}
                    peekOnSelect={peekOnSelect}
                    rowExtras={rowExtras}
                    selectedTaskId={selectedTaskId}
                    tasks={section.tasks}
                    total={section.tasks.length}
                    onBulkSelectTask={onBulkSelectTask}
                    onMoved={onMoved}
                    onOpenTask={onOpenTask}
                    onSelectTask={onSelectTask}
                    onToggleFollow={onToggleFollow}
                  />
                ))}
                {/* A failed tail page swaps the button for an inline retry —
                    the error is scoped to this group, not the whole list. */}
                {loadMoreError ? (
                  <AsyncError error={loadMoreError} variant={'inline'} onRetry={onRetryLoadMore} />
                ) : hasMore && onLoadMore && loadMoreLabel ? (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => void onLoadMore()}>
                      {loadMoreLabel}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {hierarchyRows.map((row) => (
                  <WorkQueryTaskRow
                    bulkSelected={bulkSelectedIds?.has(row.task.id)}
                    bulkSelectionActive={bulkSelectionActive}
                    depth={row.depth}
                    followed={isFollowed?.(row.task.id)}
                    hiddenProperties={hiddenProperties}
                    key={`${row.isParentContext ? 'context:' : ''}${row.task.id}`}
                    milestoneFor={milestoneFor}
                    muted={row.isParentContext}
                    peekOnSelect={peekOnSelect}
                    rowExtras={rowExtras}
                    task={row.task}
                    selected={
                      selectedTaskId !== undefined && row.task.identifier === selectedTaskId
                    }
                    onBulkSelectTask={onBulkSelectTask}
                    onMoved={onMoved}
                    onOpenTask={onOpenTask}
                    onSelectTask={onSelectTask}
                    onToggleFollow={onToggleFollow}
                  />
                ))}
                {/* A failed tail page swaps the button for an inline retry —
                    the error is scoped to this group, not the whole list. */}
                {loadMoreError ? (
                  <AsyncError error={loadMoreError} variant={'inline'} onRetry={onRetryLoadMore} />
                ) : hasMore && onLoadMore && loadMoreLabel ? (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => void onLoadMore()}>
                      {loadMoreLabel}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    );
  },
);

WorkQueryStatusGroup.displayName = 'WorkQueryStatusGroup';

const WorkQueryExternalReviewRow = memo<{ review: WorkQueryExternalReview }>(({ review }) => {
  const href = externalReviewOpenHref(review.openUrl);
  const identifier = externalReviewIdentifier(href);
  const body = (
    <>
      {/* Every queued review is an open PR — Linear draws open PRs green. */}
      <GitPullRequestIcon className="size-4 shrink-0 text-green-600 dark:text-green-500" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{review.title}</span>
      </div>
      {identifier ? (
        <span className="min-w-16 shrink-0 text-end text-sm text-muted-foreground">
          {identifier}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="flex items-center rounded-lg">
      {href ? (
        <a
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-inherit no-underline"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {body}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">{body}</div>
      )}
    </div>
  );
});

WorkQueryExternalReviewRow.displayName = 'WorkQueryExternalReviewRow';

/**
 * Board options for the shared kanban: the work query already encodes the
 * view's own filters, so the board shows every status column it gets groups
 * for — no hide-completed narrowing layered on top.
 */
const WORK_QUERY_BOARD_OPTIONS = {
  ...DEFAULT_TASK_LIST_VIEW_OPTIONS,
  hideCompleted: false,
};

const WorkQueryResults = memo<WorkQueryResultsProps>(
  ({
    emptyLabel: baseEmptyLabel,
    filtered,
    onClearFilters,
    collapsedColumns,
    collapsedGroups,
    axisKeyRank,
    groupIcon,
    groupRank,
    groupTitle,
    externalReviews,
    bulkSelectedIds,
    createContext,
    flatNested,
    nestInGroups,
    flatSections,
    groupBy,
    groups,
    hiddenRowProperties,
    hideEmptyColumns,
    isFollowed,
    layout = 'list',
    loading,
    loadingLabel,
    loadMoreLabel,
    loadMoreError,
    loadMoreGroupErrors,
    milestoneFor,
    movable,
    onBulkSelectTask,
    onCreateInFlatSection,
    onCreateInGroup,
    onLoadMore,
    onLoadMoreGroup,
    onMoved,
    onCollapsedColumnsChange,
    onCollapsedGroupsChange,
    onRetryLoadMore,
    onRetryLoadMoreGroup,
    onOpenTask,
    onSelectTask,
    onToggleFollow,
    peekOnSelect,
    rowExtras,
    selectedTaskId,
    sortMode,
    subGroupBy,
    subSectionsFor,
    tasks,
    total,
  }) => {
    const { t } = useTranslation(['common', 'chat']);
    const emptyLabel = filtered ? t('myWork.emptyFiltered') : baseEmptyLabel;
    const boardGroupBy =
      groupBy === 'status' || groupBy === 'priority' || groupBy === 'assignee'
        ? groupBy
        : 'workflowCategory';
    const requestedLane =
      layout === 'board' ? normalizeWorkQuerySubGroupBy(boardGroupBy, subGroupBy) : undefined;
    // Milestone groups a list. A board lane has no milestone columns.
    const laneAxis = requestedLane === 'milestone' ? undefined : requestedLane;
    const listGroupBy = workQueryListGroupBy(groupBy);
    const listLane =
      layout === 'list' ? normalizeWorkQuerySubGroupBy(listGroupBy, subGroupBy) : undefined;
    const pageGroupPaging = Boolean(groups?.length && onLoadMoreGroup && listGroupBy !== 'none');
    const allTasks = groups?.flatMap((group) => group.tasks) ?? tasks;
    const nestRows =
      Boolean(flatNested) &&
      (Boolean(nestInGroups) || listGroupBy === 'none' || listGroupBy === 'attention');
    const axisRank = (axis: string | undefined): ((key: string) => number) | undefined => {
      if (!axis) return undefined;
      const builtin = (): ((key: string) => number) | undefined => {
        if (axis === 'activityDate') return activityBucketRank;
        if (axis === 'priority') return (key) => myWorkPriorityGroupRank(key);
        if (axis === 'agent' || axis === 'assignee' || axis === 'milestone' || axis === 'project') {
          return (key) => (key === 'none' ? Number.MAX_SAFE_INTEGER : 0);
        }
        if (axis === 'cycle' && groupRank) return groupRank;
        return undefined;
      };
      const base = builtin();
      if (!axisKeyRank) return base;
      return (key) => axisKeyRank(axis, key) ?? base?.(key) ?? 0;
    };
    const serverGroupKey = (columnKey: string) =>
      workQuerySourceKeysForKanbanColumn(boardGroupBy, columnKey)[0];

    // While any selection exists every row keeps its checkbox revealed —
    // Linear's signal that multi-select is armed.
    const bulkSelectionActive = Boolean(bulkSelectedIds?.size);
    const rowProps = {
      bulkSelectionActive,
      hiddenProperties: hiddenRowProperties,
      milestoneFor,
      onBulkSelectTask,
      onMoved,
      onOpenTask,
      onSelectTask,
      onToggleFollow,
      peekOnSelect,
      rowExtras,
    };
    const rowSelected = (task: WorkQueryResultTask) =>
      selectedTaskId !== undefined && task.identifier === selectedTaskId;

    const reviewBlock = externalReviews ? (
      <div className="flex flex-col gap-2">
        <span className="px-3 text-sm font-medium text-muted-foreground">
          {t('myWork.externalReviews')}
        </span>
        {externalReviews.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
            <GitPullRequestIcon aria-hidden className="size-8" />
            <p>{t('myWork.externalReviewsEmpty')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {externalReviews.map((review) => (
              <WorkQueryExternalReviewRow key={review.id} review={review} />
            ))}
          </div>
        )}
      </div>
    ) : null;

    if (loading) {
      return (
        <div aria-busy aria-label={loadingLabel} className="flex flex-col gap-2" role="status">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton className="h-10 w-full" key={index} />
          ))}
        </div>
      );
    }

    if (layout === 'board') {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {reviewBlock}
          {/* One board component everywhere — this surface only supplies
              groups it already fetched through the work query. */}
          <KanbanBoard
            createContext={createContext}
            emptyDescription={emptyLabel}
            options={WORK_QUERY_BOARD_OPTIONS}
            routeScope={'global'}
            external={{
              groups: workQueryBoardGroups(groups, boardGroupBy, laneAxis),
              hiddenColumnKeys: collapsedColumns,
              hiddenProperties: hiddenRowProperties,
              hideEmptyColumns,
              laneAxis,
              movable,
              sortMode,
              loadMoreGroupError: loadMoreGroupErrors
                ? (columnKey) => {
                    const key = serverGroupKey(columnKey);
                    return key ? loadMoreGroupErrors[key] : undefined;
                  }
                : undefined,
              onLoadMoreGroup: onLoadMoreGroup
                ? (columnKey) => {
                    for (const key of workQuerySourceKeysForKanbanColumn(boardGroupBy, columnKey)) {
                      onLoadMoreGroup(key);
                    }
                  }
                : undefined,
              onHiddenColumnKeysChange: onCollapsedColumnsChange,
              onRefresh: onMoved,
              onRetryLoadMoreGroup: onRetryLoadMoreGroup
                ? (columnKey) => {
                    const key = serverGroupKey(columnKey);
                    if (key) onRetryLoadMoreGroup(key);
                  }
                : undefined,
              queryGroupBy: boardGroupBy,
              settled: true,
            }}
          />
          {loadMoreError ? (
            <AsyncError error={loadMoreError} variant={'inline'} onRetry={onRetryLoadMore} />
          ) : null}
        </div>
      );
    }

    return (
      // `data-bulk-list` scopes the rendered-order read shift-range
      // selection makes at click time.
      <TooltipProvider>
        <div
          className="flex flex-col gap-4"
          data-bulk-list={onBulkSelectTask ? '' : undefined}
          style={issueIdColumnStyle(allTasks.map((task) => task.identifier))}
        >
          {reviewBlock}
          {flatSections && flatSections.length > 0 ? (
            <div className="flex flex-col gap-2">
              {flatSections.map((section) => (
                <WorkQueryStatusGroup
                  attention
                  allTasks={allTasks}
                  bulkSelectedIds={bulkSelectedIds}
                  columnKey={section.key}
                  groupBy={'status'}
                  icon={section.icon}
                  isFollowed={isFollowed}
                  key={section.key}
                  label={section.title}
                  nested={flatNested}
                  selectedTaskId={selectedTaskId}
                  subSections={subSectionsFor?.(section.tasks)}
                  tasks={section.tasks}
                  total={section.tasks.length}
                  onCreateInGroup={onCreateInFlatSection}
                  {...rowProps}
                />
              ))}
            </div>
          ) : allTasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
              <ListTodoIcon aria-hidden className="size-8" />
              <p>{emptyLabel}</p>
              {filtered && onClearFilters ? (
                <Button variant="outline" onClick={onClearFilters}>
                  {t('myWork.clearFilters')}
                </Button>
              ) : null}
            </div>
          ) : (
            <WorkQueryVirtualList
              allTasks={allTasks}
              collapsedGroups={collapsedGroups}
              createLabel={t('chat:taskList.kanban.addTask')}
              groupIcon={groupIcon}
              groupTitle={groupTitle}
              groups={groups}
              laneAxis={listLane}
              laneRankOf={axisRank(listLane)}
              listGroupBy={listGroupBy}
              loadMoreGroupErrors={loadMoreGroupErrors}
              loadMoreLabel={loadMoreLabel}
              nestRows={nestRows}
              primaryAxis={listGroupBy}
              rankOf={axisRank(listGroupBy)}
              tasks={tasks}
              renderRow={(task, item, orderedIds) => (
                <WorkQueryTaskRow
                  bulkSelected={bulkSelectedIds?.has(task.id)}
                  depth={item.rowDepth}
                  followed={isFollowed?.(task.id)}
                  muted={item.parentContext}
                  rangeIds={orderedIds}
                  selected={rowSelected(task)}
                  task={task}
                  {...rowProps}
                />
              )}
              onCollapsedGroupsChange={onCollapsedGroupsChange}
              onCreateInGroup={onCreateInGroup}
              onRetryLoadMoreGroup={onRetryLoadMoreGroup}
              onLoadMoreGroup={
                pageGroupPaging && onLoadMoreGroup ? (key) => onLoadMoreGroup(key) : undefined
              }
            />
          )}
          {/* A failed tail page keeps the loaded rows — the retry sits under
            the list where the load-more footer lives (flat or grouped). */}
          {loadMoreError ? (
            <AsyncError error={loadMoreError} variant={'inline'} onRetry={onRetryLoadMore} />
          ) : null}
          {onLoadMore && !pageGroupPaging && workQueryHasMore(tasks.length, total) ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void onLoadMore()}>
                {loadMoreLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </TooltipProvider>
    );
  },
);

WorkQueryResults.displayName = 'WorkQueryResults';

export default WorkQueryResults;
