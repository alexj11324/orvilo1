'use client';

import { Center, Empty, Flexbox } from '@lobehub/ui';
import { ActionIcon, Button, Text, toast } from '@lobehub/ui/base-ui';
import {
  type TaskWorkflowCategory,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
  WORKFLOW_STATE_REQUIRED,
  type WorkQueryExternalReview,
  type WorkQueryGroupBy,
  type WorkQueryLayout,
} from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { BellOffIcon, BellPlusIcon, ListTodoIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { createTaskStatusCascadeModal } from '@/features/AgentTasks/features/TaskStatusCascadeModal';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
import { getOpenSubtasks } from '@/features/AgentTasks/features/useTaskStatusChange';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { taskService } from '@/services/task';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode, trpcErrorMessage } from '@/utils/trpcError';

import { createWorkflowStatePickerModal } from './WorkflowStatePickerModal';
import {
  parseWorkQueryBoardPayload,
  WORK_QUERY_BOARD_MIME,
  type WorkQueryBoardTask,
  workQueryColumnLabelKey,
  workQueryMovePlan,
} from './workQueryBoard';
import { type WorkQueryGroupPage, workQueryHasMore } from './workQueryPaging';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    flex: none;
    opacity: 0;
    transition: opacity ${cssVar.motionDurationFast};

    @media (hover: none) {
      opacity: 1;
    }
  `,
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
  columnCount: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  columnHeader: css`
    padding-inline: 4px;
  `,
  card: css`
    cursor: grab;

    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorBgContainer};

    transition: border-color ${cssVar.motionDurationFast};

    &:hover {
      border-color: ${cssVar.colorBorder};
    }

    &:hover .work-query-row-actions,
    &:focus-within .work-query-row-actions {
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
  teamId: task.teamId,
  workflowCategory: task.workflowCategory,
  workflowStateId: task.workflowStateId,
});

const moveBoardMaybePickingState = async (input: {
  expectedDomainRevision: number;
  groupBy: 'status' | 'workflowCategory';
  targetKey: string;
  taskId: string;
  teamId?: string | null;
}) => {
  try {
    await workAttentionService.moveBoard({
      expectedDomainRevision: input.expectedDomainRevision,
      groupBy: input.groupBy,
      targetKey: input.targetKey,
      taskId: input.taskId,
    });
    return true;
  } catch (error) {
    if (
      !input.teamId ||
      !isTrpcErrorCode(error, 'PRECONDITION_FAILED') ||
      trpcErrorMessage(error) !== WORKFLOW_STATE_REQUIRED
    ) {
      throw error;
    }
    const picked = await createWorkflowStatePickerModal({
      category: input.targetKey as TaskWorkflowCategory,
      teamId: input.teamId,
    });
    if (!picked) return false;
    await workAttentionService.moveBoard({
      expectedDomainRevision: input.expectedDomainRevision,
      groupBy: input.groupBy,
      targetKey: input.targetKey,
      taskId: input.taskId,
      targetWorkflowStateRefId: picked,
    });
    return true;
  }
};

const WorkQueryTaskRow = memo(
  ({
    dense,
    followed,
    onToggleFollow,
    task,
  }: {
    dense?: boolean;
    followed?: boolean;
    onToggleFollow?: (taskId: string, followed: boolean) => void;
    task: WorkQueryResultTask;
  }) => {
    const { t } = useTranslation('common');
    return (
      <Flexbox horizontal align="center" className={dense ? undefined : styles.row}>
        <WorkspaceLink
          className={styles.link}
          to={taskDetailPath(task.id, task.assigneeAgentId ?? undefined, task.name)}
        >
          <TaskStatusIcon size={16} status={task.status} />
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
          if (plan.type === 'cascade') {
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
                return result.data.task.domainRevision;
              }
              await taskService.update(plan.task.id, { status: plan.status });
              const current = await taskService.find(plan.task.id);
              return current.data.domainRevision;
            };
            let revision: number | undefined;
            if (openSubtasks.length > 0) {
              const confirmed = await createTaskStatusCascadeModal({
                onApply: async (includeSubtasks) => {
                  revision = await applyStatus(includeSubtasks);
                },
                subtasks: openSubtasks,
                targetStatus: plan.status,
              });
              if (!confirmed || revision === undefined) return;
            } else {
              revision = await applyStatus(false);
            }
            if (boardGroupBy === 'workflowCategory') {
              await moveBoardMaybePickingState({
                expectedDomainRevision: revision,
                groupBy: 'workflowCategory',
                targetKey,
                taskId: plan.task.id,
                teamId: plan.task.teamId,
              });
            }
          } else {
            const moved = await moveBoardMaybePickingState({
              expectedDomainRevision: plan.expectedDomainRevision,
              groupBy: plan.groupBy,
              targetKey: plan.targetKey,
              taskId: task.id,
              teamId: task.teamId,
            });
            if (!moved) return;
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
      return <SkeletonList aria-label={loadingLabel} rows={8} />;
    }

    const reviewBlock = externalReviews ? (
      <Flexbox gap={8}>
        <Text weight={500}>{t('myWork.externalReviews')}</Text>
        {externalReviews.length === 0 ? (
          <Empty description={t('myWork.externalReviewsEmpty')} icon={ListTodoIcon} />
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
    }

    const fallbackColumns = (
      boardGroupBy === 'status' ? WORK_QUERY_STATUS_COLUMNS : WORK_QUERY_WORKFLOW_COLUMNS
    ).map((key): WorkQueryGroupPage<WorkQueryResultTask> => ({
      hasMore: false,
      key,
      tasks: [],
      total: 0,
    }));
    const columns = groups && groups.length > 0 ? groups : fallbackColumns;

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
              <Flexbox
                horizontal
                align="center"
                className={styles.columnHeader}
                gap={8}
                justify={'space-between'}
              >
                <Text weight={500}>
                  {t(workQueryColumnLabelKey(boardGroupBy, column.key), {
                    defaultValue: column.key,
                    ns: 'chat',
                  })}
                </Text>
                <Text className={styles.columnCount} fontSize={12}>
                  {column.total}
                </Text>
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
                    dense
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
