'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Button, Text } from '@lobehub/ui/base-ui';
import type {
  TaskStatus,
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

import KanbanBoard from '@/features/AgentTasks/AgentTaskList/KanbanBoard';
import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
} from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { DEFAULT_TASK_LIST_VIEW_OPTIONS } from '@/features/AgentTasks/AgentTaskList/listViewOptions';
import TaskRowIndent from '@/features/AgentTasks/AgentTaskList/TaskRowIndent';
import AgentTaskItem from '@/features/AgentTasks/features/AgentTaskItem';
import { useTaskStatusChange } from '@/features/AgentTasks/features/useTaskStatusChange';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import { externalReviewIdentifier, externalReviewOpenHref } from './externalReviewOpen';
import { isInteractiveRowClick } from './myWorkDisplay';
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
    min-height: 44px;
    padding-inline-end: 8px;
    border-radius: ${cssVar.borderRadiusLG};
    color: inherit;

    &:hover .work-query-row-actions,
    &:focus-within .work-query-row-actions {
      opacity: 1;
    }
  `,
  rowSelected: css`
    background: ${cssVar.colorFillTertiary};
  `,
}));

interface WorkQueryResultsProps {
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
   * is `none` — My issues uses it for the client-side activity-date buckets
   * the work-query groupBy enum cannot express.
   */
  flatSections?: { key: string; tasks: WorkQueryResultTask[]; title: string }[];
  groupBy?: WorkQueryGroupBy;
  groups?: WorkQueryGroupPage<WorkQueryResultTask>[];
  isFollowed?: (taskId: string) => boolean;
  layout?: WorkQueryLayout;
  loading: boolean;
  loadingLabel: string;
  loadMoreLabel: string;
  movable?: boolean;
  /** Group-header hover `+` — the handler owns the actual create flow. */
  onCreateInGroup?: (groupKey: string) => void;
  onLoadMore?: () => void;
  onLoadMoreGroup?: (key: string) => void;
  onMoved?: () => void;
  /** Full-page escape for peek mode — the row's double-click. */
  onOpenTask?: (task: WorkQueryResultTask) => void;
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
  tasks: WorkQueryResultTask[];
  total?: number;
}

const WorkQueryTaskRow = memo(
  ({
    followed,
    depth = 0,
    groupBy,
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
     * Peek mode: a plain row click selects the issue for the detail pane and
     * suppresses the row's built-in navigation. The capture phase is the only
     * point before `AgentTaskItem`'s own click fires — interactive children
     * (menus, popovers, buttons) are detected and left alone.
     */
    const handleClickCapture = useCallback(
      (event: ReactMouseEvent) => {
        if (!peekOnSelect || !onSelectTask) return;
        if (isInteractiveRowClick(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        onSelectTask(task);
      },
      [onSelectTask, peekOnSelect, task],
    );

    // The same rich row /tasks renders — identifier, status glyph, title,
    // chips, assignee, date — instead of a second, thinner task row.
    return (
      <TaskRowIndent depth={depth} muted={muted}>
        <Flexbox
          horizontal
          align={'center'}
          aria-current={selected ? 'true' : undefined}
          className={cx(styles.row, selected && styles.rowSelected)}
          onClickCapture={peekOnSelect && onSelectTask ? handleClickCapture : undefined}
          onDoubleClick={peekOnSelect && onOpenTask ? () => onOpenTask(task) : undefined}
        >
          <Flexbox flex={1} style={{ minWidth: 0 }}>
            <AgentTaskItem
              routeScope={'global'}
              task={{ ...task, participants: task.participants ?? [] }}
              onStatusChange={handleStatusChange}
            />
          </Flexbox>
          {rowExtras?.(task)}
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
  createLabel?: string;
  hasMore?: boolean;
  isFollowed?: (taskId: string) => boolean;
  /** Explicit header text — date buckets etc. that are not status keys. */
  label?: string;
  loadMoreLabel?: string;
  nested?: boolean;
  onCreateInGroup?: (groupKey: string) => void;
  onLoadMore?: () => void;
  onMoved?: () => void;
  onOpenTask?: (task: WorkQueryResultTask) => void;
  onSelectTask?: (task: WorkQueryResultTask) => void;
  onToggleFollow?: (taskId: string, followed: boolean) => void;
  peekOnSelect?: boolean;
  rowExtras?: (task: WorkQueryResultTask) => ReactNode;
  selectedTaskId?: string;
  tasks: WorkQueryResultTask[];
  total?: number;
}>(
  ({
    columnKey,
    attention,
    allTasks,
    createLabel,
    groupBy,
    hasMore,
    isFollowed,
    label,
    loadMoreLabel,
    nested,
    onCreateInGroup,
    onLoadMore,
    onMoved,
    onOpenTask,
    onSelectTask,
    onToggleFollow,
    peekOnSelect,
    rowExtras,
    selectedTaskId,
    tasks,
    total,
  }) => {
    const { t } = useTranslation('chat');
    const [collapsed, setCollapsed] = useState(false);
    const visual = COLUMN_STATUS_VISUAL[columnKey];
    const labelKey = COLUMN_I18N_KEYS[columnKey];
    const hierarchyRows = nested
      ? workQueryHierarchyRows(tasks, allTasks)
      : tasks.map((task) => ({ depth: 0, isParentContext: false, task }));

    return (
      <Flexbox>
        <div className={cx(styles.groupHeaderRow, attention && styles.attentionGroupHeaderRow)}>
          <button
            aria-expanded={!collapsed}
            className={cx(styles.groupHeader, attention && styles.attentionGroupHeader)}
            type="button"
            onClick={() => setCollapsed((current) => !current)}
          >
            <ChevronDownIcon
              className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
              size={14}
            />
            {visual && !attention && !label ? (
              <Icon color={visual.color} icon={visual.icon} size={14} />
            ) : null}
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
            {hierarchyRows.map((row) => (
              <WorkQueryTaskRow
                depth={row.depth}
                followed={isFollowed?.(row.task.id)}
                groupBy={groupBy}
                key={`${row.isParentContext ? 'context:' : ''}${row.task.id}`}
                muted={row.isParentContext}
                peekOnSelect={peekOnSelect}
                rowExtras={rowExtras}
                selected={selectedTaskId !== undefined && row.task.identifier === selectedTaskId}
                task={row.task}
                onMoved={onMoved}
                onOpenTask={onOpenTask}
                onSelectTask={onSelectTask}
                onToggleFollow={onToggleFollow}
              />
            ))}
            {hasMore && onLoadMore && loadMoreLabel ? (
              <Flexbox horizontal justify={'center'}>
                <Button size="small" onClick={() => void onLoadMore()}>
                  {loadMoreLabel}
                </Button>
              </Flexbox>
            ) : null}
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
    createContext,
    flatNested,
    flatSections,
    groupBy,
    groups,
    isFollowed,
    layout = 'list',
    loading,
    loadingLabel,
    loadMoreLabel,
    movable,
    onCreateInGroup,
    onLoadMore,
    onLoadMoreGroup,
    onMoved,
    onOpenTask,
    onSelectTask,
    onToggleFollow,
    peekOnSelect,
    rowExtras,
    selectedTaskId,
    sortMode,
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

    const rowProps = {
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
              movable,
              sortMode,
              onLoadMoreGroup: onLoadMoreGroup
                ? (columnKey) => {
                    for (const key of workQuerySourceKeysForKanbanColumn(boardGroupBy, columnKey)) {
                      onLoadMoreGroup(key);
                    }
                  }
                : undefined,
              onRefresh: onMoved,
              queryGroupBy: boardGroupBy,
              settled: true,
            }}
          />
        </Flexbox>
      );
    }

    return (
      <Flexbox gap={16}>
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
                /* Date buckets borrow the banner header (`attention`) — the
                   filled status pill would be wrong chrome for a day label. */
                <WorkQueryStatusGroup
                  attention
                  allTasks={allTasks}
                  columnKey={section.key}
                  groupBy={'status'}
                  isFollowed={isFollowed}
                  key={section.key}
                  label={section.title}
                  nested={flatNested}
                  selectedTaskId={selectedTaskId}
                  tasks={section.tasks}
                  total={section.tasks.length}
                  onCreateInGroup={onCreateInGroup}
                  {...rowProps}
                />
              ))}
            </Flexbox>
          ) : (
            <Flexbox gap={2}>
              {flatRows.map((row) => (
                <WorkQueryTaskRow
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
                columnKey={group.key}
                groupBy={listGroupBy === 'attention' ? 'status' : listGroupBy}
                // Attention buckets aren't a writable status dimension — a
                // status change inside them still writes `status`.
                hasMore={pageGroupPaging ? group.hasMore : false}
                isFollowed={isFollowed}
                key={group.key}
                loadMoreLabel={loadMoreLabel}
                nested={listGroupBy === 'attention' && flatNested !== false}
                selectedTaskId={selectedTaskId}
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
                {...rowProps}
              />
            ))}
          </Flexbox>
        )}
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
