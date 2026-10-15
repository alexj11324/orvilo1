import { CalendarOffIcon, ChevronDownIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DropdownMenu } from '@/components/ItemsMenu';
import StopLoadingIcon from '@/components/StopLoading';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { nextHeartbeatFiring, nextScheduleFiring } from './scheduler/helpers';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { useRunWithContractCheck } from './useRunWithContractCheck';

const padTime = (n: number) => String(n).padStart(2, '0');

export type CountdownDisplay =
  { countdown: string; type: 'time' } | { days: number; hours: number; type: 'days' };

export const formatCountdown = (msRemaining: number): CountdownDisplay => {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  if (days > 0) {
    return { days, hours: Math.floor((totalSeconds % 86_400) / 3600), type: 'days' };
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const countdown =
    hours > 0
      ? `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`
      : `${padTime(minutes)}:${padTime(seconds)}`;

  return { countdown, type: 'time' };
};

export { shouldPersistFallbackAssignee } from './useRunWithContractCheck';

const TaskDetailRunPauseAction = memo(() => {
  const { t } = useTranslation('chat');
  const {
    canEditTask,
    canExecuteTask,
    permissionReason: reason,
    runWithContractCheck,
  } = useRunWithContractCheck();
  const taskId = useTaskDetailTaskId();
  const canRun = useTaskDetailSelector(taskDetailSelectors.canRunTask);
  const isBlocked = useTaskDetailSelector(taskDetailSelectors.isTaskBlocked);
  const canPause = useTaskDetailSelector(taskDetailSelectors.canPauseTask);
  const status = useTaskDetailSelector(taskDetailSelectors.taskStatus);
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const automationMode = useTaskDetailSelector(taskDetailSelectors.taskAutomationMode);
  const interval = useTaskDetailSelector(taskDetailSelectors.taskPeriodicInterval);
  const schedulePattern = useTaskDetailSelector(taskDetailSelectors.taskSchedulePattern);
  const scheduleTimezone = useTaskDetailSelector(taskDetailSelectors.taskScheduleTimezone);
  const isRerun = status === 'completed';
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const setAutomationMode = useTaskStore((s) => s.setAutomationMode);
  const refreshDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const refreshList = useTaskStore((s) => s.refreshTaskList);

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);

  const handleRunOrPause = useCallback(async () => {
    if (!canExecuteTask || isStopping) return;
    if (!taskId) return;
    if (canPause) {
      if (automationMode === 'schedule' || automationMode === 'heartbeat') {
        setIsStopping(true);
        try {
          const { data } = await taskService.getIssuePlan(taskId);
          if (data.automationQueue?.activeDispatchId) {
            await taskService.cancelAutomationOccurrence(taskId);
          } else {
            const runningTopics = detail?.activities?.filter(
              (activity) =>
                activity.type === 'topic' &&
                activity.status === 'running' &&
                (!activity.sourceTaskId || activity.sourceTaskId === detail.id),
            );
            const topicId = runningTopics?.length === 1 ? runningTopics[0].id : undefined;
            if (!topicId) throw new Error('Current running Topic could not be identified');
            await taskService.cancelTopic(topicId);
          }
          const refreshed = await Promise.allSettled([refreshDetail(taskId), refreshList()]);
          for (const result of refreshed) {
            if (result.status === 'rejected')
              console.error(
                '[TaskDetailRunPauseAction] Could not refresh after stop',
                result.reason,
              );
          }
        } catch (error) {
          console.error('[TaskDetailRunPauseAction] Could not stop current round', error);
          toast.error(t('taskDetail.plan.stopRoundError'));
        } finally {
          setIsStopping(false);
        }
      } else {
        await updateTaskStatus(taskId, 'paused');
      }
      return;
    }
    if (!canRun) return;
    setIsStarting(true);
    try {
      await runWithContractCheck(taskId);
    } finally {
      setIsStarting(false);
    }
  }, [
    taskId,
    canRun,
    canPause,
    runWithContractCheck,
    updateTaskStatus,
    canExecuteTask,
    isStopping,
    automationMode,
    detail,
    refreshDetail,
    refreshList,
    t,
  ]);

  const handleRunNow = useCallback(async () => {
    if (!canExecuteTask || isBlocked) return;
    if (!taskId) return;
    setIsRunningNow(true);
    try {
      await runWithContractCheck(taskId);
    } finally {
      setIsRunningNow(false);
    }
  }, [canExecuteTask, isBlocked, taskId, runWithContractCheck]);

  const handleCancelSchedule = useCallback(async () => {
    if (!canExecuteTask) return;
    if (!taskId) return;
    setIsCancellingSchedule(true);
    try {
      await setAutomationMode(taskId, null);
      if (status === 'scheduled') {
        await updateTaskStatus(taskId, 'backlog');
      }
    } finally {
      setIsCancellingSchedule(false);
    }
  }, [canExecuteTask, taskId, setAutomationMode, updateTaskStatus, status]);

  const isScheduled = status === 'scheduled';

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isScheduled) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isScheduled]);

  const countdownText = useMemo(() => {
    if (!isScheduled) return null;
    let next = null;
    if (automationMode === 'heartbeat') {
      next = nextHeartbeatFiring(
        detail?.heartbeat?.scheduledAt ?? detail?.heartbeat?.lastAt,
        interval,
      );
    } else if (automationMode === 'schedule' && schedulePattern) {
      next = nextScheduleFiring(schedulePattern, scheduleTimezone);
    }
    if (!next) return null;
    return formatCountdown(next.toDate().getTime() - nowMs);
  }, [
    isScheduled,
    automationMode,
    detail?.heartbeat?.lastAt,
    detail?.heartbeat?.scheduledAt,
    interval,
    schedulePattern,
    scheduleTimezone,
    nowMs,
  ]);

  if (isScheduled) {
    return (
      <div className="flex items-center gap-3">
        <div className="inline-flex">
          <Button
            className="rounded-r-none"
            disabled={!canExecuteTask || isCancellingSchedule || isRunningNow}
            loading={isCancellingSchedule || isRunningNow}
            size="compact"
            title={canEditTask ? undefined : reason}
            variant="default"
            onClick={handleCancelSchedule}
          >
            <CalendarOffIcon data-icon="inline-start" />
            {t('taskDetail.cancelSchedule')}
          </Button>
          <DropdownMenu
            items={[
              {
                disabled: !canExecuteTask || isBlocked || isRunningNow || isCancellingSchedule,
                icon: <PlayIcon size="1em" />,
                key: 'runNow',
                label: t('taskDetail.runNow'),
                onClick: handleRunNow,
              },
            ]}
          >
            <Button
              className="rounded-l-none border-l-0"
              disabled={!canExecuteTask || isCancellingSchedule || isRunningNow}
              size="compact"
              variant="default"
            >
              <ChevronDownIcon size={14} />
            </Button>
          </DropdownMenu>
        </div>
        {countdownText && (
          <div className="text-xs text-muted-foreground">
            {countdownText.type === 'days'
              ? t('taskDetail.nextRunCountdownDays', countdownText)
              : t('taskDetail.nextRunCountdown', countdownText)}
          </div>
        )}
      </div>
    );
  }

  if (
    !canRun &&
    !canPause &&
    !isStarting &&
    !(isBlocked && ['backlog', 'failed', 'paused', 'completed'].includes(status ?? ''))
  )
    return null;

  if (isStarting) {
    const pendingLabel = isRerun ? t('taskDetail.rerunTask') : t('taskDetail.runTask');
    return (
      <Button disabled loading size="compact" variant="default">
        {pendingLabel}
      </Button>
    );
  }

  if (canPause) {
    return (
      <Button
        disabled={!canExecuteTask}
        loading={isStopping}
        size="compact"
        title={reason}
        onClick={handleRunOrPause}
      >
        <StopLoadingIcon data-icon="inline-start" />
        {t('taskDetail.stopTask')}
      </Button>
    );
  }

  const runLabel = isRerun ? t('taskDetail.rerunTask') : t('taskDetail.runTask');
  const RunIcon = isRerun ? RotateCcwIcon : PlayIcon;

  return (
    <Button
      disabled={!canExecuteTask || isBlocked}
      size="compact"
      title={!canEditTask ? reason : isBlocked ? t('taskDetail.prerequisites.blocked') : undefined}
      variant="default"
      onClick={handleRunOrPause}
    >
      <RunIcon data-icon="inline-start" />
      {runLabel}
    </Button>
  );
});

export default TaskDetailRunPauseAction;
