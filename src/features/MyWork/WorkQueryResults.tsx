'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Button, Text } from '@lobehub/ui/base-ui';
import type { WorkQueryExternalReview, WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { BellOffIcon, BellPlusIcon, GitPullRequestIcon, ListTodoIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import KanbanBoard from '@/features/AgentTasks/AgentTaskList/KanbanBoard';
import {
  KANBAN_STATUS_COLUMN_KEY,
  STATUS_KANBAN_COLUMNS,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
} from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { DEFAULT_TASK_LIST_VIEW_OPTIONS } from '@/features/AgentTasks/AgentTaskList/listViewOptions';
import AgentTaskItem from '@/features/AgentTasks/features/AgentTaskItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import { externalReviewIdentifier, externalReviewOpenHref } from './externalReviewOpen';
import { workQueryBoardGroups } from './workQueryBoard';
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
  groupHeader: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 4px;
    border: none;
    border-radius: ${cssVar.borderRadiusLG};

    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  row: css`
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
  tasks: WorkQueryResultTask[];
  total?: number;
}

const WorkQueryTaskRow = memo(
  ({
    followed,
    onToggleFollow,
    task,
  }: {
    followed?: boolean;
    onToggleFollow?: (taskId: string, followed: boolean) => void;
    task: WorkQueryResultTask;
  }) => {
    const { t } = useTranslation('common');
    // The same rich row /tasks renders — identifier, status glyph, title,
    // chips, assignee, date — instead of a second, thinner task row.
    return (
      <Flexbox horizontal align={'center'} className={styles.row}>
        <Flexbox flex={1} style={{ minWidth: 0 }}>
          <AgentTaskItem
            routeScope={'global'}
            task={{ ...task, participants: task.participants ?? [] }}
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
    );
  },
);

WorkQueryTaskRow.displayName = 'WorkQueryTaskRow';

/**
 * Linear's default list is status-grouped with collapsible headers. Bucket the
 * flat result set into board column order so a view reads the same whether it
 * renders as a list or a board.
 */
const WorkQueryStatusGroup = memo<{
  columnKey: string;
  isFollowed?: (taskId: string) => boolean;
  onToggleFollow?: (taskId: string, followed: boolean) => void;
  tasks: WorkQueryResultTask[];
}>(({ columnKey, isFollowed, onToggleFollow, tasks }) => {
  const { t } = useTranslation('chat');
  const [collapsed, setCollapsed] = useState(false);
  const visual = COLUMN_STATUS_VISUAL[columnKey];
  const labelKey = COLUMN_I18N_KEYS[columnKey];

  return (
    <Flexbox>
      <button
        aria-expanded={!collapsed}
        className={styles.groupHeader}
        type="button"
        onClick={() => setCollapsed((current) => !current)}
      >
        {visual ? <Icon color={visual.color} icon={visual.icon} size={14} /> : null}
        <Text fontSize={12} weight={500}>
          {labelKey ? t(labelKey as never) : columnKey}
        </Text>
        <Text fontSize={12} type={'secondary'}>
          {tasks.length}
        </Text>
      </button>
      {collapsed ? null : (
        <Flexbox>
          {tasks.map((task) => (
            <WorkQueryTaskRow
              followed={isFollowed?.(task.id)}
              key={task.id}
              task={task}
              onToggleFollow={onToggleFollow}
            />
          ))}
        </Flexbox>
      )}
    </Flexbox>
  );
});

WorkQueryStatusGroup.displayName = 'WorkQueryStatusGroup';

const groupTasksByStatusColumn = (
  tasks: WorkQueryResultTask[],
): { key: string; tasks: WorkQueryResultTask[] }[] => {
  const buckets = new Map<string, WorkQueryResultTask[]>();
  for (const task of tasks) {
    const key = KANBAN_STATUS_COLUMN_KEY[task.status ?? ''] ?? 'backlog';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }
  return STATUS_KANBAN_COLUMNS.map((col) => ({
    key: col.key,
    tasks: buckets.get(col.key) ?? [],
  })).filter((group) => group.tasks.length > 0);
};

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
    tasks,
    total,
  }) => {
    const { t } = useTranslation(['common', 'chat']);
    const boardGroupBy = groupBy === 'status' ? 'status' : 'workflowCategory';

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
            emptyDescription={emptyLabel}
            options={WORK_QUERY_BOARD_OPTIONS}
            routeScope={'global'}
            external={{
              groups: workQueryBoardGroups(groups, boardGroupBy),
              movable,
              onLoadMoreGroup,
              onRefresh: onMoved,
              settled: true,
            }}
          />
        </Flexbox>
      );
    }

    return (
      <Flexbox gap={16}>
        {reviewBlock}
        {tasks.length === 0 ? (
          <Center flex={1} padding={48}>
            <Empty description={emptyLabel} icon={ListTodoIcon} />
          </Center>
        ) : (
          <Flexbox gap={8}>
            {groupTasksByStatusColumn(tasks).map((group) => (
              <WorkQueryStatusGroup
                columnKey={group.key}
                isFollowed={isFollowed}
                key={group.key}
                tasks={group.tasks}
                onToggleFollow={onToggleFollow}
              />
            ))}
          </Flexbox>
        )}
        {onLoadMore && workQueryHasMore(tasks.length, total) ? (
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
