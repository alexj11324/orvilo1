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
import { createStaticStyles, cssVar } from 'antd-style';
import {
  BellOffIcon,
  BellPlusIcon,
  ChevronDownIcon,
  GitPullRequestIcon,
  ListTodoIcon,
} from 'lucide-react';
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
  groupHeader: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    gap: 8px;
    align-items: center;

    min-height: 32px;
    padding-block: 4px;
    padding-inline: 12px;
    border: none;
    border-radius: ${cssVar.borderRadiusSM};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  attentionGroupHeader: css`
    padding-inline: 16px;
    border-radius: 0;
    background: transparent;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
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
  groupBy?: WorkQueryGroupBy;
  groups?: WorkQueryGroupPage<WorkQueryResultTask>[];
  isFollowed?: (taskId: string) => boolean;
  layout?: WorkQueryLayout;
  loading: boolean;
  loadingLabel: string;
  loadMoreLabel: string;
  movable?: boolean;
  onLoadMore?: () => void;
  onLoadMoreGroup?: (key: string) => void;
  onMoved?: () => void;
  onToggleFollow?: (taskId: string, followed: boolean) => void;
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
    onToggleFollow,
    task,
    muted,
  }: {
    followed?: boolean;
    depth?: number;
    groupBy: 'status' | 'workflowCategory';
    onMoved?: () => void;
    onToggleFollow?: (taskId: string, followed: boolean) => void;
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
    // The same rich row /tasks renders — identifier, status glyph, title,
    // chips, assignee, date — instead of a second, thinner task row.
    return (
      <TaskRowIndent depth={depth} muted={muted}>
        <Flexbox horizontal align={'center'} className={styles.row}>
          <Flexbox flex={1} style={{ minWidth: 0 }}>
            <AgentTaskItem
              routeScope={'global'}
              task={{ ...task, participants: task.participants ?? [] }}
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
  hasMore?: boolean;
  isFollowed?: (taskId: string) => boolean;
  loadMoreLabel?: string;
  nested?: boolean;
  onLoadMore?: () => void;
  onMoved?: () => void;
  onToggleFollow?: (taskId: string, followed: boolean) => void;
  tasks: WorkQueryResultTask[];
  total?: number;
}>(
  ({
    columnKey,
    attention,
    allTasks,
    groupBy,
    hasMore,
    isFollowed,
    loadMoreLabel,
    nested,
    onLoadMore,
    onMoved,
    onToggleFollow,
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
        <button
          aria-expanded={!collapsed}
          className={`${styles.groupHeader} ${attention ? styles.attentionGroupHeader : ''}`}
          type="button"
          onClick={() => setCollapsed((current) => !current)}
        >
          <ChevronDownIcon
            className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
            size={14}
          />
          {visual && !attention ? <Icon color={visual.color} icon={visual.icon} size={14} /> : null}
          <Text fontSize={attention ? 13 : 12} weight={500}>
            {labelKey ? t(labelKey as never) : columnKey}
          </Text>
          <Text fontSize={attention ? 13 : 12} type={'secondary'}>
            {total ?? tasks.length}
          </Text>
        </button>
        {collapsed ? null : (
          <Flexbox>
            {hierarchyRows.map((row) => (
              <WorkQueryTaskRow
                depth={row.depth}
                followed={isFollowed?.(row.task.id)}
                groupBy={groupBy}
                key={`${row.isParentContext ? 'context:' : ''}${row.task.id}`}
                muted={row.isParentContext}
                task={row.task}
                onMoved={onMoved}
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
    groupBy,
    groups,
    isFollowed,
    layout = 'list',
    loading,
    loadingLabel,
    loadMoreLabel,
    movable,
    onLoadMore,
    onLoadMoreGroup,
    onMoved,
    onToggleFollow,
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
             no status headers are re-imposed. */
          tasks.length === 0 ? (
            <Center flex={1} padding={48}>
              <Empty description={emptyLabel} icon={ListTodoIcon} />
            </Center>
          ) : (
            <Flexbox gap={2}>
              {tasks.map((task) => (
                <WorkQueryTaskRow
                  followed={isFollowed?.(task.id)}
                  groupBy={'status'}
                  key={task.id}
                  task={task}
                  onMoved={onMoved}
                  onToggleFollow={onToggleFollow}
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
                nested={listGroupBy === 'attention'}
                tasks={group.tasks}
                total={group.total}
                attention={
                  listGroupBy === 'attention' &&
                  (group.key === 'urgent' || group.key === 'blocking')
                }
                onMoved={onMoved}
                onToggleFollow={onToggleFollow}
                onLoadMore={
                  pageGroupPaging && onLoadMoreGroup ? () => onLoadMoreGroup(group.key) : undefined
                }
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
