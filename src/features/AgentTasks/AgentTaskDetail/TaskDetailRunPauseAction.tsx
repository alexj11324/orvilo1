import { CalendarOffIcon, ChevronDownIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DropdownMenu } from '@/components/ItemsMenu';
import { confirmModal } from '@/components/Modal';
import StopLoadingIcon from '@/components/StopLoading';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { nextHeartbeatFiring, nextScheduleFiring } from './scheduler/helpers';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

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

export const shouldPersistFallbackAssignee = (
  assigneeAgentId?: string | null,
  assigneeUserId?: string | null,
  inboxAgentId?: string | null,
) => !assigneeAgentId && !assigneeUserId && !!inboxAgentId;

const TaskDetailRunPauseAction = memo(() => {
  const { t } = useTranslation('chat');
  const { allowed: canEditTask, reason } = usePermission('create_content');
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
  const assigneeAgentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const assigneeUserId = useTaskDetailSelector(taskDetailSelectors.taskAssigneeUserId);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const isRerun = status === 'completed';
  const runTask = useTaskStore((s) => s.runTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const setAutomationMode = useTaskStore((s) => s.setAutomationMode);

  const [isStarting, setIsStarting] = useState(false);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);

  /**
   * Contract-aware run (SB08): when goal/acceptance drifted from the adopted
   * contract's revisions, the run is explicitly a frozen-contract `repair`
   * and the user is told the edits stay pending for an approved replan — a
   * run never silently adopts or ignores constraint changes.
   */
  const runWithContractCheck = useCallback(
    async (id: string) => {
      if (shouldPersistFallbackAssignee(assigneeAgentId, assigneeUserId, inboxAgentId)) {
        await updateTask(id, { assigneeAgentId: inboxAgentId });
      }
      const context = await lambdaClient.task.contractContext.query({ id }).catch(() => undefined);
      if (context?.data?.pendingConstraintEdits) {
        const revision = context.data.contract?.revision;
        const confirmed = await new Promise<boolean>((resolve) => {
          confirmModal({
            cancelText: t('cancel', { ns: 'common' }),
            content: t('taskDetail.pendingContractEdits.content', {
              revision: revision ?? '?',
            }),
            okText: t('taskDetail.runNow'),
            onCancel: () => resolve(false),
            onOk: () => resolve(true),
            title: t('taskDetail.pendingContractEdits.title'),
          });
        });
        if (!confirmed) return;
        await runTask(id, { intent: 'repair' });
        return;
      }
      await runTask(id);
    },
    [assigneeAgentId, assigneeUserId, inboxAgentId, runTask, t, updateTask],
  );

  const handleRunOrPause = useCallback(async () => {
    if (!canEditTask) return;
    if (!taskId) return;
    if (canPause) {
      await updateTaskStatus(taskId, 'paused');
      return;
    }
    if (!canRun) return;
    setIsStarting(true);
    try {
      await runWithContractCheck(taskId);
    } finally {
      setIsStarting(false);
    }
  }, [taskId, canRun, canPause, runWithContractCheck, updateTaskStatus, canEditTask]);

  const handleRunNow = useCallback(async () => {
    if (!canEditTask || isBlocked) return;
    if (!taskId) return;
    setIsRunningNow(true);
    try {
      await runWithContractCheck(taskId);
    } finally {
      setIsRunningNow(false);
    }
  }, [canEditTask, isBlocked, taskId, runWithContractCheck]);

  const handleCancelSchedule = useCallback(async () => {
    if (!canEditTask) return;
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
  }, [canEditTask, taskId, setAutomationMode, updateTaskStatus, status]);

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
            disabled={!canEditTask || isCancellingSchedule || isRunningNow}
            loading={isCancellingSchedule || isRunningNow}
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
                disabled: !canEditTask || isBlocked || isRunningNow || isCancellingSchedule,
                icon: <PlayIcon size="1em" />,
                key: 'runNow',
                label: t('taskDetail.runNow'),
                onClick: handleRunNow,
              },
            ]}
          >
            <Button
              className="rounded-l-none border-l-0"
              disabled={!canEditTask || isCancellingSchedule || isRunningNow}
              variant="default"
            >
              <ChevronDownIcon size={14} />
            </Button>
          </DropdownMenu>
        </div>
        {countdownText && (
          <div className="text-[12px] text-muted-foreground">
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
      <Button disabled loading variant="default">
        {pendingLabel}
      </Button>
    );
  }

  if (canPause) {
    return (
      <Button disabled={!canEditTask} title={reason} onClick={handleRunOrPause}>
        <StopLoadingIcon data-icon="inline-start" />
        {t('taskDetail.stopTask')}
      </Button>
    );
  }

  const runLabel = isRerun ? t('taskDetail.rerunTask') : t('taskDetail.runTask');
  const runIcon = isRerun ? RotateCcwIcon : PlayIcon;

  return (
    <Button
      disabled={!canEditTask || isBlocked}
      title={!canEditTask ? reason : isBlocked ? t('taskDetail.prerequisites.blocked') : undefined}
      variant="default"
      onClick={handleRunOrPause}
    >
      {runIcon}
      {runLabel}
    </Button>
  );
});

export default TaskDetailRunPauseAction;
