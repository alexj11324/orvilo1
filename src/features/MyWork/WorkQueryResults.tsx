'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Button, Checkbox, Text } from '@lobehub/ui/base-ui';
import type {
  TaskStatus,
  TaskWorkflowCategory,
  WorkQueryExternalReview,
  WorkQueryGroupBy,
  WorkQueryLayout,
  WorkQuerySortMode,
} from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  BellOffIcon,
  BellPlusIcon,
  ChevronDownIcon,
  GitPullRequestIcon,
  ListTodoIcon,
  PlusIcon,
} from 'lucide-react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import KanbanBoard from '@/features/AgentTasks/AgentTaskList/KanbanBoard';
import { workQueryKeyForKanbanColumn } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
} from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { DEFAULT_TASK_LIST_VIEW_OPTIONS } from '@/features/AgentTasks/AgentTaskList/listViewOptions';
import TaskRowIndent from '@/features/AgentTasks/AgentTaskList/TaskRowIndent';
import AgentTaskItem from '@/features/AgentTasks/features/AgentTaskItem';
import { useTaskStatusChange } from '@/features/AgentTasks/features/useTaskStatusChange';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';

import {
  bulkGestureFromModifiers,
  bulkOrderedRowIds,
  type BulkSelectGesture,
} from './bulkSelection';
import { externalReviewIdentifier, externalReviewOpenHref } from './externalReviewOpen';
import { isInteractiveRowClick, type MyWorkRowProperty } from './myWorkDisplay';
import {
  workQueryBoardGroups,
  workQueryListGroupBy,
  workQueryListSections,
  workQuerySourceKeysForKanbanColumn,
} from './workQueryBoard';
import { applyWorkQueryStatusChange } from './workQueryBoardMove';
import { workQueryHierarchyRows } from './workQueryHierarchy';
import {
  type WorkQueryGroupPage,
  workQueryHasMore,
  type WorkQueryResultTask,
} from './workQueryPaging';

export type { WorkQueryResultTask } from './workQueryPaging';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    flex: none;
    opacity: 0;
    transition: opacity ${cssVar.motionDurationFast};

    @media (hover: none) {
      opacity: 1;
    }
  `,
  identifier: css`
    flex: none;

    min-width: 64px;

    font-family: ${cssVar.fontFamilyCode};
    color: ${cssVar.colorTextTertiary};
    text-align: end;
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;

    color: inherit;
    text-decoration: none;
  `,
  chevron: css`
    flex: none;
    color: ${cssVar.colorTextTertiary};
    transition: transform ${cssVar.motionDurationFast};
  `,
  chevronCollapsed: css`
    transform: rotate(-90deg);
  `,
  /**
   * The header is a row wrapper (background + hover reveal for the create
   * `+`) around a real `<button>` — nesting an ActionIcon inside the toggle
   * button would be invalid HTML and would swallow its click.
   */
  groupHeaderRow: css`
    display: flex;
    gap: 4px;
    align-items: center;

    padding-inline-end: 4px;
    border-radius: ${cssVar.borderRadiusSM};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};

    &:hover .work-query-group-actions,
    &:focus-within .work-query-group-actions {
      opacity: 1;
    }
  `,
  attentionGroupHeaderRow: css`
    padding-inline-end: 8px;
    border-radius: 0;
    background: transparent;
  `,
  groupHeader: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;
    min-height: 32px;
    padding-block: 4px;
    padding-inline: 12px;
    border: none;

    color: inherit;
    text-align: start;

    background: transparent;
  `,
  attentionGroupHeader: css`
    padding-inline: 16px;
  `,
  row: css`
    position: relative;

    min-height: 44px;
    padding-inline-end: 8px;
    border-radius: ${cssVar.borderRadiusLG};

    color: inherit;

    &:hover .work-query-row-actions,
    &:focus-within .work-query-row-actions,
    &:hover .work-query-bulk-check,
    &:focus-within .work-query-bulk-check {
      opacity: 1;
    }
  `,
  rowSelected: css`
    background: ${cssVar.colorFillTertiary};
  `,
  rowBulkSelected: css`
    background: ${cssVar.colorPrimaryBg};
  `,
  /**
   * Linear's hover checkbox: an overlay at the row's leading edge so rows
   * keep their geometry whether or not multi-select is armed. Solid chip —
   * it slides over whatever sits in the row's left padding.
   */
  bulkCheck: css`
    position: absolute;
    z-index: 1;
    inset-block-start: 50%;
    inset-inline-start: 4px;
    transform: translateY(-50%);

    display: flex;
    align-items: center;

    border-radius: ${cssVar.borderRadiusSM};

    opacity: 0;
    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowSecondary};

    transition: opacity ${cssVar.motionDurationFast};

    @media (hover: none) {
      opacity: 1;
    }
  `,
  bulkCheckActive: css`
    opacity: 1;
  `,
  /**
   * Second-level group header (Linear's Sub-grouping) — transparent chrome,
   * indented under its primary group instead of repeating the filled pill.
   */
  subGroupHeaderRow: css`
    padding-inline-end: 8px;
    border-radius: 0;
    background: transparent;
  `,
  subGroupHeader: css`
    min-height: 28px;
    padding-inline: 28px 16px;
  `,
  /**
   * Display-property toggles hide their chip inside the shared task row.
   * `AgentTaskItem` owns the chip DOM, so hiding rides on its stable collab
   * hooks (`data-collab-id` slots) and data attributes rather than forking
   * the component. The trailing date is the trailing
   * flex's last child when it renders; the `:not` guard keeps the assignee
   * slot alive if the date ever comes back empty.
   */
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
   * Multi-selected task ids — rows paint checked + highlight and reveal
   * their checkbox without waiting for hover. Absent = no bulk affordance.
   */
  bulkSelectedIds?: ReadonlySet<string>;
  /**
   * Where the board's create entry should file a new card. `teamId` files it
   * directly; `teamOptions` makes the create modal ask the one ambiguous
   * choice (a cross-team view). Neither means create stays hidden.
   */
  createContext?: { teamId?: string; teamOptions?: { id: string; name: string }[] };
  emptyLabel: string;
  externalReviews?: WorkQueryExternalReview[];
  /**
   * Flat lists nest children under parents already in the set — Linear's
   * "nested sub-issues: Show matching" for Created/Subscribed/Activity.
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
  groups?: WorkQueryGroupPage<WorkQueryResultTask>[];
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
  /**
   * Second-level grouping inside each list section — Linear's "Sub-grouping"
   * nested headers. Called with a section's tasks; `undefined` renders the
   * flat body. Sub-sections never nest further (Linear stops at two levels).
   */
  subSectionsFor?: (tasks: WorkQueryResultTask[]) => WorkQuerySubSection[] | undefined;
  tasks: WorkQueryResultTask[];
  total?: number;
}

const WorkQueryTaskRow = memo(
  ({
    followed,
    depth = 0,
    groupBy,
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
    rowExtras,
    selected,
    task,
    muted,
  }: {
    followed?: boolean;
    depth?: number;
    groupBy: 'status' | 'workflowCategory';
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
    rowExtras?: (task: WorkQueryResultTask) => ReactNode;
    selected?: boolean;
    task: WorkQueryResultTask;
    muted?: boolean;
  }) => {
    const { t } = useTranslation('common');
    const changeTaskStatus = useTaskStatusChange();
    const handleStatusChange = useCallback(
      async (status: TaskStatus) => {
        const applied = await applyWorkQueryStatusChange({
          changeLocal: changeTaskStatus,
          groupBy,
          status,
          task,
        });
        if (applied) onMoved?.();
      },
      [changeTaskStatus, groupBy, onMoved, task],
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
            gesture === 'range' && list ? bulkOrderedRowIds(list) : [task.id],
          );
          return;
        }
        if (!peekOnSelect || !onSelectTask) return;
        event.preventDefault();
        event.stopPropagation();
        onSelectTask(task);
      },
      [onBulkSelectTask, onSelectTask, peekOnSelect, task],
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
    return (
      <TaskRowIndent depth={depth} muted={muted}>
        <Flexbox
          horizontal
          align={'center'}
          aria-current={selected ? 'true' : undefined}
          aria-selected={bulkSelected ? 'true' : undefined}
          data-bulk-row-id={onBulkSelectTask ? task.id : undefined}
          data-bulk-selected={bulkSelected || undefined}
          className={cx(
            styles.row,
            selected && styles.rowSelected,
            bulkSelected && styles.rowBulkSelected,
            ...rowPropertyClassNames(hiddenProperties),
          )}
          onDoubleClick={peekOnSelect && onOpenTask ? handleDoubleClick : undefined}
          onClickCapture={
            (peekOnSelect && onSelectTask) || onBulkSelectTask ? handleClickCapture : undefined
          }
        >
          {onBulkSelectTask ? (
            <span
              data-row-interactive
              className={cx(
                styles.bulkCheck,
                'work-query-bulk-check',
                (bulkSelected || bulkSelectionActive) && styles.bulkCheckActive,
              )}
            >
              <Checkbox
                aria-label={t('myWork.bulk.selectRow')}
                checked={Boolean(bulkSelected)}
                onChange={() => onBulkSelectTask(task, 'toggle', [task.id])}
              />
            </span>
          ) : null}
          <Flexbox flex={1} style={{ minWidth: 0 }}>
            <AgentTaskItem
              milestone={milestoneFor?.(task)}
              routeScope={'global'}
              task={{ ...task, participants: task.participants ?? [] }}
              trailingChips={rowExtras?.(task)}
              onStatusChange={handleStatusChange}
            />
          </Flexbox>
          {onToggleFollow ? (
            <span className={`${styles.actions} work-query-row-actions`}>
              <ActionIcon
                icon={followed ? BellOffIcon : BellPlusIcon}
                size={'small'}
                title={followed ? t('myWork.unsubscribe') : t('myWork.subscribe')}
                onClick={() => onToggleFollow(task.id, Boolean(followed))}
              />
            </span>
          ) : null}
        </Flexbox>
      </TaskRowIndent>
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
      <Flexbox>
        <div
          className={cx(
            styles.groupHeaderRow,
            (attention || subGroup) && styles.attentionGroupHeaderRow,
            subGroup && styles.subGroupHeaderRow,
          )}
        >
          <button
            aria-expanded={!collapsed}
            type="button"
            className={cx(
              styles.groupHeader,
              attention && styles.attentionGroupHeader,
              subGroup && styles.subGroupHeader,
            )}
            onClick={() => setCollapsed((current) => !current)}
          >
            <ChevronDownIcon
              className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
              size={14}
            />
            {visual && !attention && !label && !icon ? (
              <Icon color={visual.color} icon={visual.icon} size={14} />
            ) : null}
            {icon}
            <Text ellipsis fontSize={attention ? 13 : 12} weight={500}>
              {label ?? (labelKey ? t(labelKey as never) : columnKey)}
            </Text>
            <Text fontSize={attention ? 13 : 12} type={'secondary'}>
              {total ?? tasks.length}
            </Text>
          </button>
          {onCreateInGroup ? (
            <span className={`${styles.actions} work-query-group-actions`}>
              <ActionIcon
                icon={PlusIcon}
                size={'small'}
                title={createLabel ?? t('taskList.kanban.addTask')}
                onClick={(event) => {
                  event.stopPropagation();
                  onCreateInGroup(columnKey);
                }}
              />
            </span>
          ) : null}
        </div>
        {collapsed ? null : (
          <Flexbox>
            {subSections && subSections.length > 0 ? (
              /* Linear's nested sub-headers: the second level groups the
                 section's rows under its own collapsible headers. Sub-groups
                 never nest further, and the primary group keeps its create
                 `+` and load-more footer. */
              <Flexbox gap={4}>
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
                  <Flexbox horizontal justify={'center'}>
                    <Button size="small" onClick={() => void onLoadMore()}>
                      {loadMoreLabel}
                    </Button>
                  </Flexbox>
                ) : null}
              </Flexbox>
            ) : (
              <>
                {hierarchyRows.map((row) => (
                  <WorkQueryTaskRow
                    bulkSelected={bulkSelectedIds?.has(row.task.id)}
                    bulkSelectionActive={bulkSelectionActive}
                    depth={row.depth}
                    followed={isFollowed?.(row.task.id)}
                    groupBy={groupBy}
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
                  <Flexbox horizontal justify={'center'}>
                    <Button size="small" onClick={() => void onLoadMore()}>
                      {loadMoreLabel}
                    </Button>
                  </Flexbox>
                ) : null}
              </>
            )}
          </Flexbox>
        )}
      </Flexbox>
    );
  },
);

WorkQueryStatusGroup.displayName = 'WorkQueryStatusGroup';

const WorkQueryExternalReviewRow = memo<{ review: WorkQueryExternalReview }>(({ review }) => {
  const href = externalReviewOpenHref(review.openUrl);
  const identifier = externalReviewIdentifier(href);
  const body = (
    <>
      <Icon color={cssVar.colorTextSecondary} icon={GitPullRequestIcon} size={16} />
      <Flexbox flex={1} style={{ minWidth: 0 }}>
        <Text ellipsis weight={500}>
          {review.title}
        </Text>
      </Flexbox>
      {identifier ? (
        <Text className={styles.identifier} fontSize={12}>
          {identifier}
        </Text>
      ) : null}
    </>
  );

  return (
    <Flexbox horizontal align="center" className={styles.row}>
      {href ? (
        <a className={styles.link} href={href} rel="noopener noreferrer" target="_blank">
          {body}
        </a>
      ) : (
        <div className={styles.link}>{body}</div>
      )}
    </Flexbox>
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
    emptyLabel,
    externalReviews,
    bulkSelectedIds,
    createContext,
    flatNested,
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
    onRetryLoadMore,
    onRetryLoadMoreGroup,
    onOpenTask,
    onSelectTask,
    onToggleFollow,
    peekOnSelect,
    rowExtras,
    selectedTaskId,
    sortMode,
    subSectionsFor,
    tasks,
    total,
  }) => {
    const { t } = useTranslation(['common', 'chat']);
    const boardGroupBy = groupBy === 'status' ? 'status' : 'workflowCategory';
    const listGroupBy = workQueryListGroupBy(groupBy);
    const listSections =
      listGroupBy === 'none' ? [] : workQueryListSections(groups, tasks, listGroupBy);
    const pageGroupPaging = Boolean(groups?.length && onLoadMoreGroup);
    const allTasks = groups?.flatMap((group) => group.tasks) ?? tasks;
    // Flat lists nest children under in-list parents only when the caller opts
    // in — Linear's "nested sub-issues: Show matching" vs "Hide" per tab.
    const flatRows = flatNested
      ? workQueryHierarchyRows(tasks, tasks)
      : tasks.map((task) => ({ depth: 0, isParentContext: false, task }));

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
      <Flexbox gap={8}>
        <Text weight={500}>{t('myWork.externalReviews')}</Text>
        {externalReviews.length === 0 ? (
          <Center flex={1} padding={48}>
            <Empty description={t('myWork.externalReviewsEmpty')} icon={GitPullRequestIcon} />
          </Center>
        ) : (
          <Flexbox gap={2}>
            {externalReviews.map((review) => (
              <WorkQueryExternalReviewRow key={review.id} review={review} />
            ))}
          </Flexbox>
        )}
      </Flexbox>
    ) : null;

    if (loading) {
      return <SkeletonList aria-label={loadingLabel} rows={8} />;
    }

    if (layout === 'board') {
      return (
        <Flexbox gap={16} style={{ flex: 1, minHeight: 0 }}>
          {reviewBlock}
          {/* One board component everywhere — this surface only supplies
              groups it already fetched through the work query. */}
          <KanbanBoard
            createContext={createContext}
            emptyDescription={emptyLabel}
            options={WORK_QUERY_BOARD_OPTIONS}
            routeScope={'global'}
            external={{
              groups: workQueryBoardGroups(groups, boardGroupBy),
              hideEmptyColumns,
              movable,
              sortMode,
              loadMoreGroupError: loadMoreGroupErrors
                ? (columnKey) => loadMoreGroupErrors[workQueryKeyForKanbanColumn(columnKey)]
                : undefined,
              onLoadMoreGroup: onLoadMoreGroup
                ? (columnKey) => {
                    for (const key of workQuerySourceKeysForKanbanColumn(boardGroupBy, columnKey)) {
                      onLoadMoreGroup(key);
                    }
                  }
                : undefined,
              onRefresh: onMoved,
              onRetryLoadMoreGroup: onRetryLoadMoreGroup
                ? (columnKey) => onRetryLoadMoreGroup(workQueryKeyForKanbanColumn(columnKey))
                : undefined,
              queryGroupBy: boardGroupBy,
              settled: true,
            }}
          />
          {loadMoreError ? (
            <AsyncError error={loadMoreError} variant={'inline'} onRetry={onRetryLoadMore} />
          ) : null}
        </Flexbox>
      );
    }

    return (
      // `data-bulk-list` scopes the rendered-order read shift-range
      // selection makes at click time.
      <Flexbox data-bulk-list={onBulkSelectTask ? '' : undefined} gap={16}>
        {reviewBlock}
        {listGroupBy === 'none' ? (
          /* `none` grouping stays a flat list in the query's own sort order —
             no status headers are re-imposed. `flatSections` overlays caller-
             computed groupings (activity day buckets) without re-bucketing. */
          tasks.length === 0 ? (
            <Center flex={1} padding={48}>
              <Empty description={emptyLabel} icon={ListTodoIcon} />
            </Center>
          ) : flatSections && flatSections.length > 0 ? (
            <Flexbox gap={8}>
              {flatSections.map((section) => (
                /* Client-bucketed sections borrow the banner header
                   (`attention`) — the filled status pill would be wrong chrome
                   for a field label. `+` only appears when the caller's
                   `onCreateInFlatSection` says the key presets a real field
                   (a day or a priority rank presets nothing). */
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
            </Flexbox>
          ) : (
            <Flexbox gap={2}>
              {flatRows.map((row) => (
                <WorkQueryTaskRow
                  bulkSelected={bulkSelectedIds?.has(row.task.id)}
                  depth={row.depth}
                  followed={isFollowed?.(row.task.id)}
                  groupBy={'status'}
                  key={`${row.isParentContext ? 'context:' : ''}${row.task.id}`}
                  muted={row.isParentContext}
                  selected={rowSelected(row.task)}
                  task={row.task}
                  {...rowProps}
                />
              ))}
            </Flexbox>
          )
        ) : listSections.length === 0 ? (
          <Center flex={1} padding={48}>
            <Empty description={emptyLabel} icon={ListTodoIcon} />
          </Center>
        ) : (
          <Flexbox gap={8}>
            {listSections.map((group) => (
              // `nested` honours the caller's sub-issues toggle — `flatNested`
              // === false disables attention nesting too (Linear's option is
              // list-wide).
              <WorkQueryStatusGroup
                allTasks={allTasks}
                bulkSelectedIds={bulkSelectedIds}
                columnKey={group.key}
                groupBy={listGroupBy === 'attention' ? 'status' : listGroupBy}
                // Attention buckets aren't a writable status dimension — a
                // status change inside them still writes `status` — but the
                // tail keys are workflow states and take that axis's marks.
                hasMore={pageGroupPaging ? group.hasMore : false}
                isFollowed={isFollowed}
                key={group.key}
                keyAxis={listGroupBy === 'attention' ? 'workflowCategory' : undefined}
                loadMoreError={loadMoreGroupErrors?.[group.key]}
                loadMoreLabel={loadMoreLabel}
                nested={listGroupBy === 'attention' && flatNested !== false}
                selectedTaskId={selectedTaskId}
                subSections={subSectionsFor?.(group.tasks)}
                tasks={group.tasks}
                total={group.total}
                attention={
                  listGroupBy === 'attention' &&
                  (group.key === 'urgent' || group.key === 'blocking')
                }
                onCreateInGroup={onCreateInGroup}
                onLoadMore={
                  pageGroupPaging && onLoadMoreGroup ? () => onLoadMoreGroup(group.key) : undefined
                }
                onRetryLoadMore={
                  onRetryLoadMoreGroup ? () => onRetryLoadMoreGroup(group.key) : undefined
                }
                {...rowProps}
              />
            ))}
          </Flexbox>
        )}
        {/* A failed tail page keeps the loaded rows — the retry sits under
            the list where the load-more footer lives (flat or grouped). */}
        {loadMoreError ? (
          <AsyncError error={loadMoreError} variant={'inline'} onRetry={onRetryLoadMore} />
        ) : null}
        {onLoadMore && !pageGroupPaging && workQueryHasMore(tasks.length, total) ? (
          <Flexbox horizontal justify={'center'}>
            <Button size="small" onClick={() => void onLoadMore()}>
              {loadMoreLabel}
            </Button>
          </Flexbox>
        ) : null}
      </Flexbox>
    );
  },
);

WorkQueryResults.displayName = 'WorkQueryResults';

export default WorkQueryResults;
