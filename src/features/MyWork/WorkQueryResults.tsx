'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Button, Text, toast } from '@lobehub/ui/base-ui';
import type { WorkQueryExternalReview, WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { createTaskStatusCascadeModal } from '@/features/AgentTasks/features/TaskStatusCascadeModal';
import { getOpenSubtasks } from '@/features/AgentTasks/features/useTaskStatusChange';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { taskService } from '@/services/task';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import {
  parseWorkQueryBoardPayload,
  WORK_QUERY_BOARD_MIME,
  type WorkQueryBoardTask,
  workQueryColumnLabelKey,
  workQueryMovePlan,
} from './workQueryBoard';
import { type WorkQueryGroupPage, workQueryHasMore } from './workQueryPaging';

const styles = createStaticStyles(({ css }) => ({
  board: css`
    overflow: auto;
    display: flex;
    gap: 12px;
    align-items: stretch;

    min-height: 280px;
  `,
  column: css`
    display: flex;
    flex-direction: column;
    gap: 8px;

    min-width: 220px;
    max-width: 280px;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorFillQuaternary};
  `,
  card: css`
    cursor: grab;

    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorBgContainer};
  `,
}));

export interface WorkQueryResultTask extends WorkQueryBoardTask {
  assigneeAgentId?: string | null;
  instruction: string;
}

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

const asBoardTask = (task: WorkQueryResultTask): WorkQueryBoardTask => ({
  domainRevision: task.domainRevision,
  id: task.id,
  identifier: task.identifier,
  name: task.name,
  status: task.status,
  workflowCategory: task.workflowCategory,
  workflowStateId: task.workflowStateId,
});

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
      <Flexbox horizontal align="center" gap={8} wrap="wrap">
        <WorkspaceLink to={taskDetailPath(task.id, task.assigneeAgentId ?? undefined, task.name)}>
          <Text weight={500}>{task.name ?? task.instruction}</Text>
        </WorkspaceLink>
        {onToggleFollow ? (
          <Button size="small" onClick={() => onToggleFollow(task.id, Boolean(followed))}>
            {followed ? t('myWork.unsubscribe') : t('myWork.subscribe')}
          </Button>
        ) : null}
      </Flexbox>
    );
  },
);

WorkQueryTaskRow.displayName = 'WorkQueryTaskRow';

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

    const moveTask = useCallback(
      async (task: WorkQueryResultTask, targetKey: string) => {
        const plan = workQueryMovePlan({
          groupBy: boardGroupBy,
          targetKey,
          task: asBoardTask(task),
        });
        try {
          if (plan.type === 'noop') return;
          if (plan.type === 'linear-category') {
            await taskService.update(plan.task.id, { workflowCategory: plan.workflowCategory });
          } else if (plan.type === 'cascade') {
            const tree = await taskService.getTaskTree(plan.task.identifier);
            const root = tree.data.find(
              (item) => item.id === plan.task.id || item.identifier === plan.task.identifier,
            );
            if (!root) throw new Error('Task tree did not include its requested root');
            const openSubtasks = getOpenSubtasks(
              tree.data.filter(
                (item) => item.id !== root.id && item.identifier !== root.identifier,
              ),
            );
            const applyStatus = async (includeSubtasks: boolean) => {
              if (includeSubtasks && openSubtasks.length > 0) {
                const result = await taskService.updateStatusCascade(
                  plan.task.identifier,
                  plan.status,
                );
                const revision = result.data.task.domainRevision;
                if (boardGroupBy === 'workflowCategory') {
                  await workAttentionService.moveBoard({
                    expectedDomainRevision: revision,
                    groupBy: 'workflowCategory',
                    targetKey,
                    taskId: plan.task.id,
                  });
                }
                return;
              }
              await taskService.update(plan.task.id, { status: plan.status });
              if (boardGroupBy === 'workflowCategory') {
                const current = await taskService.find(plan.task.id);
                await workAttentionService.moveBoard({
                  expectedDomainRevision: current.data.domainRevision,
                  groupBy: 'workflowCategory',
                  targetKey,
                  taskId: plan.task.id,
                });
              }
            };
            if (openSubtasks.length > 0) {
              await createTaskStatusCascadeModal({
                onApply: applyStatus,
                subtasks: openSubtasks,
                targetStatus: plan.status,
              });
            } else {
              await applyStatus(false);
            }
          } else {
            await workAttentionService.moveBoard({
              expectedDomainRevision: plan.expectedDomainRevision,
              groupBy: plan.groupBy,
              targetKey: plan.targetKey,
              taskId: task.id,
            });
          }
          onMoved?.();
        } catch (error) {
          toast.error(
            isTrpcErrorCode(error, 'CONFLICT')
              ? t('myWork.moveConflict')
              : isTrpcErrorCode(error, 'PRECONDITION_FAILED')
                ? t('myWork.moveBlocked')
                : t('myWork.moveFailed'),
          );
        }
      },
      [boardGroupBy, onMoved, t],
    );

    if (loading) {
      return <Text type="secondary">{loadingLabel}</Text>;
    }

    const reviewBlock = externalReviews ? (
      <Flexbox gap={8}>
        <Text weight={500}>{t('myWork.externalReviews')}</Text>
        {externalReviews.length === 0 ? (
          <Empty description={t('myWork.externalReviewsEmpty')} />
        ) : (
          externalReviews.map((review) => (
            <Text key={review.id} weight={500}>
              {review.title}
            </Text>
          ))
        )}
      </Flexbox>
    ) : null;

    if (layout !== 'board') {
      return (
        <Flexbox gap={16}>
          {reviewBlock}
          {tasks.length === 0 ? (
            <Empty description={emptyLabel} />
          ) : (
            tasks.map((task) => (
              <WorkQueryTaskRow
                followed={isFollowed?.(task.id)}
                key={task.id}
                task={task}
                onToggleFollow={onToggleFollow}
              />
            ))
          )}
          {onLoadMore && workQueryHasMore(tasks.length, total) ? (
            <Button size="small" onClick={() => void onLoadMore()}>
              {loadMoreLabel}
            </Button>
          ) : null}
        </Flexbox>
      );
    }

    const columns = groups ?? [];
    if (total === 0) {
      return (
        <Flexbox gap={16}>
          {reviewBlock}
          <Empty description={emptyLabel} />
        </Flexbox>
      );
    }

    return (
      <Flexbox gap={16}>
        {reviewBlock}
        <div className={styles.board}>
          {columns.map((column) => (
            <div
              className={styles.column}
              key={column.key}
              onDragOver={(event) => {
                if (!movable) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!movable) return;
                event.preventDefault();
                const raw =
                  event.dataTransfer.getData(WORK_QUERY_BOARD_MIME) ||
                  event.dataTransfer.getData('text/plain');
                const payload = parseWorkQueryBoardPayload(raw);
                if (!payload) return;
                const task = columns
                  .flatMap((item) => item.tasks)
                  .find((item) => item.id === payload.task.id);
                if (!task) return;
                void moveTask(task, column.key);
              }}
            >
              <Flexbox horizontal align="center" gap={8}>
                <Text weight={500}>
                  {t(workQueryColumnLabelKey(boardGroupBy, column.key), {
                    defaultValue: column.key,
                    ns: 'chat',
                  })}
                </Text>
                <Text type="secondary">{column.total}</Text>
              </Flexbox>
              {column.tasks.map((task) => (
                <div
                  className={styles.card}
                  draggable={movable}
                  key={task.id}
                  onDragStart={(event) => {
                    if (!movable) return;
                    const payload = JSON.stringify({
                      groupKey: column.key,
                      task: asBoardTask(task),
                    });
                    event.dataTransfer.setData(WORK_QUERY_BOARD_MIME, payload);
                    event.dataTransfer.setData('text/plain', payload);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <WorkQueryTaskRow
                    followed={isFollowed?.(task.id)}
                    task={task}
                    onToggleFollow={onToggleFollow}
                  />
                </div>
              ))}
              {onLoadMoreGroup && workQueryHasMore(column.tasks.length, column.total) ? (
                <Button size="small" onClick={() => void onLoadMoreGroup(column.key)}>
                  {loadMoreLabel}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Flexbox>
    );
  },
);

WorkQueryResults.displayName = 'WorkQueryResults';

export default WorkQueryResults;
