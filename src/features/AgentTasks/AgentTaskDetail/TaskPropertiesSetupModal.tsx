'use client';

import { t as translate } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LabelChips from '@/features/Labels/LabelChips';
import { usePermission } from '@/hooks/usePermission';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { trpcErrorMessage } from '@/utils/trpcError';

import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import TaskLabelSelector from '../features/TaskLabelSelector';
import { useActiveTaskProject } from '../shared/useActiveTaskProject';
import { useTaskProjectChange } from '../shared/useTaskProjectChange';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import TaskDetailAssignee from './TaskDetailAssignee';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { TaskDetailScope, useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import TaskScheduleConfig from './TaskScheduleConfig';

const TaskPropertiesSetup = () => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const taskId = useTaskDetailTaskId();
  const task = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const { allowed: canEdit, reason } = usePermission('create_content');
  const updateTask = useTaskStore((s) => s.updateTask);
  const { apply: applyProject, pending: projectPending } = useTaskProjectChange({ taskId });
  const { project, milestone, milestones, taskDatabaseId } = useActiveTaskProject(taskId);
  const projectQuery = useProjectStore((s) => s.useFetchProjectList)(canEdit);
  const projects = useCurrentProjectList();
  const setTaskMilestone = useProjectStore((s) => s.setTaskMilestone);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const reviewer = useUserDisplayMeta(task?.reviewerUserId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const disabled = !canEdit || pending || projectPending;
  const canManageMilestone = canEdit && !!project && project.userId === currentUserId;

  const apply = async (operation: () => Promise<unknown>) => {
    if (!canEdit || pending || !taskId) return;
    setPending(true);
    setError(undefined);
    try {
      await operation();
    } catch (cause) {
      setError(trpcErrorMessage(cause) ?? t('taskDetail.menu.failed'));
    } finally {
      setPending(false);
    }
  };

  if (!taskId || !task) return null;
  const projectName = project?.name ?? projects.find((row) => row.id === task.projectId)?.name;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('taskDetail.property.setupHelp')}</p>
      {!canEdit ? <p role="alert">{reason}</p> : null}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('taskDetail.labels.title')}</span>
        <div className={styles.propertyValue}>
          <TaskLabelSelector
            assignedLabels={task.labels ?? []}
            disabled={disabled || task.status === 'running'}
            taskIdentifier={taskId}
          >
            <div
              aria-label={t('taskDetail.labels.title')}
              className="flex min-w-0 cursor-pointer items-center gap-1.5"
            >
              {task.labels?.length ? (
                <LabelChips labels={task.labels} max={3} />
              ) : (
                t('taskDetail.property.addLabels')
              )}
            </div>
          </TaskLabelSelector>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('taskDetail.project')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label={t('taskDetail.project')} disabled={disabled} variant="outline">
                {projectName ??
                  t(task.projectId ? 'taskDetail.menu.unavailable' : 'taskDetail.noProject')}
              </Button>
            }
          />
          <DropdownMenuContent className="max-h-64 min-w-52 overflow-y-auto">
            {projectQuery.error ? (
              <DropdownMenuItem onClick={() => void apply(() => projectQuery.mutate())}>
                {t('retry', { ns: 'common' })}
              </DropdownMenuItem>
            ) : projectQuery.isLoading ? (
              <DropdownMenuItem disabled>{t('loading', { ns: 'common' })}</DropdownMenuItem>
            ) : (
              projects.map((row) => (
                <DropdownMenuItem
                  disabled={disabled}
                  key={row.id}
                  onClick={() => void apply(() => applyProject(row.id, task.projectId))}
                >
                  {row.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuItem
              disabled={disabled}
              onClick={() => void apply(() => applyProject(null, task.projectId))}
            >
              {t('taskDetail.noProject')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('taskList.groupBy.milestone')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t('taskList.groupBy.milestone')}
                disabled={disabled || !canManageMilestone}
                variant="outline"
              >
                {milestone?.name ?? t('taskList.noMilestone')}
              </Button>
            }
          />
          <DropdownMenuContent className="max-h-64 min-w-52 overflow-y-auto">
            {milestones.map((row) => (
              <DropdownMenuItem
                disabled={disabled}
                key={row.id}
                onClick={() => {
                  if (canManageMilestone && taskDatabaseId && project)
                    void apply(() => setTaskMilestone(project.id, taskDatabaseId, row.id));
                }}
              >
                {row.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              disabled={disabled}
              onClick={() => {
                if (canManageMilestone && taskDatabaseId && project)
                  void apply(() => setTaskMilestone(project.id, taskDatabaseId, null));
              }}
            >
              {t('taskList.noMilestone')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('taskDetail.reviewer')}</span>
        <div className={styles.propertyValue}>
          <AssigneeMemberSelector
            currentUserId={task.reviewerUserId}
            disabled={disabled || task.status === 'running'}
            taskCreatorId={task.createdByUserId}
            taskIdentifier={taskId}
            taskVisibility={task.visibility}
            onChange={(userId, member) =>
              void apply(() =>
                updateTask(
                  taskId,
                  { reviewerUserId: userId },
                  {
                    optimisticReviewer: member
                      ? {
                          avatar: member.user?.avatar ?? null,
                          id: member.userId,
                          name: member.user?.fullName ?? null,
                          type: 'user',
                        }
                      : undefined,
                  },
                ),
              )
            }
          >
            <div
              aria-label={t('taskDetail.reviewer')}
              className="flex min-w-0 cursor-pointer items-center gap-1.5"
            >
              {reviewer?.title ?? t('taskDetail.property.addReviewer')}
            </div>
          </AssigneeMemberSelector>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('createTask.assignee')}</span>
        <div className={styles.propertyValue}>
          <TaskDetailAssignee />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('taskDetail.property.agentSchedule')}</span>
        <div className={styles.propertyValue}>
          <TaskScheduleConfig>
            <div
              aria-label={t('taskDetail.property.agentSchedule')}
              className="flex min-w-0 cursor-pointer items-center gap-1.5"
            >
              {t('taskDetail.property.schedule')}
            </div>
          </TaskScheduleConfig>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button disabled={pending || projectPending} variant="outline" onClick={close}>
          {t('close', { ns: 'common' })}
        </Button>
      </div>
    </div>
  );
};

export const openTaskPropertiesSetupModal = ({ taskId }: { taskId: string }) =>
  createModal({
    content: (
      <TaskDetailScope taskId={taskId}>
        <TaskPropertiesSetup />
      </TaskDetailScope>
    ),
    footer: null,
    maskClosable: false,
    title: translate('taskDetail.properties', { ns: 'chat' }),
    width: 480,
  });
