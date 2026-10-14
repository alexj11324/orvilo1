import { Mermaid } from '@lobehub/ui';
import type { TaskContext } from '@orvilo/types';
import { Workflow } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { issuePlanGraph } from './issuePlanGraph';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import TaskDetailSectionHeader from './TaskDetailSectionHeader';

export const TaskIssuePlan = ({ onChanged }: { onChanged?: () => Promise<unknown> }) => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailTaskId();
  const parent = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const { allowed: canEdit, reason } = usePermission('create_content');
  const refreshDetail = useTaskStore((state) => state.internal_refreshTaskDetail);
  const refreshList = useTaskStore((state) => state.refreshTaskList);
  const { data, error, isLoading, isValidating, mutate } = useClientDataSWR(
    taskId ? ['taskIssuePlan', taskId] : null,
    () => taskService.getIssuePlan(taskId!),
  );
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState<'draft' | 'confirm' | 'stop' | 'pause' | 'resume' | null>(
    null,
  );
  const [writeError, setWriteError] = useState<'plan' | 'stop' | 'automation' | null>(null);
  const plan = data?.data.plan;
  const subtasks = data?.data.subtasks ?? [];
  const { graph, edges } = issuePlanGraph(
    parent ? [parent, ...subtasks] : subtasks,
    data?.data.dependencies ?? [],
  );
  const taskLabel = (id: string) => {
    const task = id === parent?.id ? parent : subtasks.find((item) => item.id === id);
    return task ? `${task.identifier} ${task.name ?? ''}`.trim() : id;
  };
  const write = async (action: 'draft' | 'confirm' | 'stop' | 'pause' | 'resume') => {
    if (!taskId || pending || !canEdit) return;
    setPending(action);
    setWriteError(null);
    try {
      if (action === 'pause' || action === 'resume')
        await taskService.updateStatus(taskId, action === 'pause' ? 'paused' : 'scheduled');
      else if (action === 'stop') await taskService.cancelAutomationOccurrence(taskId);
      else if (action === 'draft') await taskService.draftIssuePlan(taskId);
      else if (plan) await taskService.confirmIssuePlan(taskId, plan.revision);
      await Promise.all([mutate(), refreshDetail(taskId), refreshList(), onChanged?.()]);
    } catch (error) {
      console.error('[TaskIssuePlan] Could not save plan', error);
      setWriteError(
        action === 'stop'
          ? 'stop'
          : action === 'pause' || action === 'resume'
            ? 'automation'
            : 'plan',
      );
      // A stale revision must reload the current plan before another confirmation.
      await mutate();
    } finally {
      setPending(null);
    }
  };

  if (!taskId || parent?.parentTaskId) return null;
  return (
    <section aria-label={t('taskDetail.plan.title')} className="flex flex-col gap-2">
      <TaskDetailSectionHeader
        icon={Workflow}
        open={open}
        title={t('taskDetail.plan.title')}
        onToggle={() => setOpen(!open)}
      />
      {open && (
        <div className="flex flex-col gap-3 px-3 text-sm">
          {error && (
            <div className="flex items-center gap-2 text-destructive-text" role="alert">
              <span>{t('taskDetail.plan.loadError')}</span>
              <Button
                loading={isValidating}
                size="sm"
                variant="ghost"
                onClick={() => void mutate()}
              >
                {t('taskDetail.plan.retry')}
              </Button>
            </div>
          )}
          {isLoading && !data ? (
            <Skeleton className="h-16 w-full" />
          ) : plan ? (
            <>
              <p className="whitespace-pre-wrap">{plan.summary}</p>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{t('taskDetail.plan.scope')}</h3>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {plan.scope.description}
                </p>
                <ul className="list-inside list-disc">
                  {plan.scope.repositories.map((repository) => (
                    <li key={repository.repo}>
                      {repository.repo} → {repository.targetBranch}
                    </li>
                  ))}
                </ul>
              </div>
              {!plan.confirmedAt && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">{t('taskDetail.plan.checklist')}</h3>
                  {plan.checklists.map((checklist) => (
                    <div className="flex flex-col gap-1" key={checklist.taskId}>
                      <h4 className="text-sm text-muted-foreground">
                        {taskLabel(checklist.taskId)}
                      </h4>
                      <ul className="list-inside list-disc">
                        {checklist.items.map((item) => (
                          <li key={item.id}>
                            {item.title}
                            {item.description ? ` — ${item.description}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {subtasks.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">{t('taskDetail.plan.dependencies')}</h3>
                  <div aria-hidden="true">
                    <Mermaid variant="borderless">{graph}</Mermaid>
                  </div>
                  {edges.length > 0 ? (
                    <ul
                      aria-label={t('taskDetail.plan.dependencies')}
                      className="list-inside list-disc"
                    >
                      {edges.map((edge) => (
                        <li key={`${edge.dependsOnId}:${edge.taskId}`}>
                          {t('taskDetail.plan.edge', {
                            predecessor: taskLabel(edge.dependsOnId),
                            dependent: taskLabel(edge.taskId),
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">{t('taskDetail.plan.noDependencies')}</p>
                  )}
                </div>
              )}
              {plan.confirmedAt ? (
                <div className="flex flex-col gap-2">
                  <p className="text-success-text" role="status">
                    {t('taskDetail.plan.confirmed')}
                  </p>
                  {parent?.workflowCategory === 'done' && (
                    <Button
                      className="self-start"
                      disabled={!canEdit || !!pending}
                      loading={pending === 'draft'}
                      size="sm"
                      variant="ghost"
                      onClick={() => void write('draft')}
                    >
                      {t('taskDetail.plan.redraft')}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={!canEdit || !!pending || !!error}
                    loading={pending === 'confirm'}
                    size="sm"
                    title={reason}
                    variant="secondary"
                    onClick={() => void write('confirm')}
                  >
                    {t('taskDetail.plan.confirm')}
                  </Button>
                  <Button
                    disabled={!canEdit || !!pending}
                    loading={pending === 'draft'}
                    size="sm"
                    variant="ghost"
                    onClick={() => void write('draft')}
                  >
                    {t('taskDetail.plan.redraft')}
                  </Button>
                </div>
              )}
            </>
          ) : !error && data ? (
            <>
              <p className="text-muted-foreground">{t('taskDetail.plan.empty')}</p>
              <Button
                className="self-start"
                disabled={!canEdit || !!pending}
                loading={pending === 'draft'}
                size="sm"
                title={reason}
                variant="secondary"
                onClick={() => void write('draft')}
              >
                {t('taskDetail.plan.draft')}
              </Button>
            </>
          ) : null}
          {data?.data.automationQueue && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground" role="status">
                {t('taskDetail.plan.queuedRounds', { count: data.data.automationQueue.queued })}
              </p>
              {parent?.automationMode && (
                <Button
                  className="self-start"
                  disabled={!canEdit || !!pending}
                  loading={pending === 'pause' || pending === 'resume'}
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void write(
                      (parent.context as TaskContext | null)?.scheduler?.automationPaused
                        ? 'resume'
                        : 'pause',
                    )
                  }
                >
                  {t(
                    (parent.context as TaskContext | null)?.scheduler?.automationPaused
                      ? 'taskDetail.plan.resumeAutomation'
                      : 'taskDetail.plan.pauseAutomation',
                  )}
                </Button>
              )}
              {data.data.automationQueue.activeDispatchId && (
                <Button
                  className="self-start"
                  disabled={!canEdit || !!pending}
                  loading={pending === 'stop'}
                  size="sm"
                  variant="ghost"
                  onClick={() => void write('stop')}
                >
                  {t('taskDetail.plan.stopRound')}
                </Button>
              )}
              {data.data.automationQueue.recent
                .filter((round) => round.phase === 'canceled')
                .map((round) => (
                  <p className="text-muted-foreground" key={round.id}>
                    {t('taskDetail.plan.canceledRound', {
                      date: new Date(round.updatedAt).toLocaleString(),
                    })}
                  </p>
                ))}
            </div>
          )}
          {writeError && (
            <p className="text-destructive-text" role="alert">
              {t(
                writeError === 'stop'
                  ? 'taskDetail.plan.stopRoundError'
                  : writeError === 'automation'
                    ? 'taskDetail.plan.automationError'
                    : 'taskDetail.plan.writeError',
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
