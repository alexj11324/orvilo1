'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Button, Text } from '@lobehub/ui/base-ui';
import type { WorkQueryExternalReview, WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { BellOffIcon, BellPlusIcon, GitPullRequestIcon, ListTodoIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveTaskStatus } from '@/components/ExecutionStatus';
import KanbanBoard from '@/features/AgentTasks/AgentTaskList/KanbanBoard';
import { DEFAULT_TASK_LIST_VIEW_OPTIONS } from '@/features/AgentTasks/AgentTaskList/listViewOptions';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

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
  row: css`
    padding-block: 7px;
    padding-inline: 4px 12px;
    border-radius: ${cssVar.borderRadiusLG};
    color: inherit;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

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
    return (
      <Flexbox horizontal align="center" className={styles.row}>
        <WorkspaceLink
          className={styles.link}
          to={taskDetailPath(task.id, task.assigneeAgentId ?? undefined, task.name)}
        >
          <TaskStatusIcon size={16} status={resolveTaskStatus(task.status)} />
          <Flexbox flex={1} style={{ minWidth: 0 }}>
            <Text ellipsis weight={500}>
              {task.name ?? task.instruction}
            </Text>
          </Flexbox>
          {task.identifier ? (
            <Text className={styles.identifier} fontSize={12}>
              {task.identifier}
            </Text>
          ) : null}
        </WorkspaceLink>
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
          <Flexbox gap={2}>
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
