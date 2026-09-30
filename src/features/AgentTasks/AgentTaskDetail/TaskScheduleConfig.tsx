import { InputNumber } from '@lobehub/ui';
import { ActionIcon, Avatar, Button, Select, Switch, Tabs, Text } from '@lobehub/ui/base-ui';
import type { TaskAutomationMode } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { CalendarClockIcon, CalendarDays, Clock, RefreshCw, TimerIcon, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import {
  formatIntervalLabel,
  formatScheduleDescription,
  formatTimezoneName,
  nextHeartbeatFiring,
  nextScheduleFiring,
} from './scheduler/helpers';
import SchedulerForm, { type SchedulerFormChange } from './scheduler/SchedulerForm';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

type IntervalUnit = 'hours' | 'minutes';

const MIN_MINUTES = 10;

const styles = createStaticStyles(({ css, cssVar }) => ({
  fieldLabel: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  popover: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
  `,
  preview: css`
    padding-block: 12px;
    padding-inline: 14px;
    border-radius: 12px;
    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface IntervalTabProps {
  currentInterval: number;
  disabled?: boolean;
  taskId?: string;
}

const IntervalTab = memo<IntervalTabProps>(({ currentInterval, disabled, taskId }) => {
  const { t } = useTranslation('chat');
  const updatePeriodicInterval = useTaskStore((s) => s.updatePeriodicInterval);

  const derived = useMemo(() => {
    if (!currentInterval || currentInterval === 0)
      return { displayValue: MIN_MINUTES, unit: 'minutes' as IntervalUnit };
    if (currentInterval >= 3600 && currentInterval % 3600 === 0)
      return { displayValue: currentInterval / 3600, unit: 'hours' as IntervalUnit };
    return {
      displayValue: Math.max(MIN_MINUTES, Math.round(currentInterval / 60)),
      unit: 'minutes' as IntervalUnit,
    };
  }, [currentInterval]);

  const [localUnit, setLocalUnit] = useState<IntervalUnit>(derived.unit);
  const [localValue, setLocalValue] = useState<number | undefined>(derived.displayValue);

  useEffect(() => {
    setLocalUnit(derived.unit);
    setLocalValue(derived.displayValue);
  }, [derived.unit, derived.displayValue]);

  const toSeconds = (val: number | null, u: IntervalUnit): number | null => {
    if (!val || val <= 0) return null;
    return u === 'hours' ? val * 3600 : val * 60;
  };

  const handleValueChange = useCallback(
    (val: number | string | null) => {
      let normalized: number | undefined;
      if (val === null || val === '') {
        normalized = undefined;
      } else if (typeof val === 'string') {
        const n = Number(val);
        normalized = Number.isNaN(n) ? undefined : n;
      } else {
        normalized = val;
      }
      setLocalValue(normalized);
      if (disabled) return;
      if (!taskId) return;
      const seconds = toSeconds(normalized ?? null, localUnit);
      updatePeriodicInterval(taskId, seconds);
    },
    [disabled, taskId, localUnit, updatePeriodicInterval],
  );

  const handleUnitChange = useCallback(
    (u: IntervalUnit) => {
      setLocalUnit(u);
      if (disabled) return;
      if (!taskId || !localValue) return;
      const clamped = u === 'minutes' ? Math.max(MIN_MINUTES, localValue) : localValue;
      if (clamped !== localValue) setLocalValue(clamped);
      const seconds = toSeconds(clamped, u);
      updatePeriodicInterval(taskId, seconds);
    },
    [disabled, taskId, localValue, updatePeriodicInterval],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Text className={styles.fieldLabel}>{t('taskSchedule.intervalLabel')}</Text>
      <div className="flex items-center gap-2">
        <Text type="secondary">{t('taskSchedule.every')}</Text>
        <InputNumber
          disabled={disabled}
          min={localUnit === 'minutes' ? MIN_MINUTES : 1}
          placeholder={localUnit === 'minutes' ? String(MIN_MINUTES) : '1'}
          style={{ width: 100 }}
          value={localValue}
          variant="filled"
          onChange={handleValueChange}
        />
        <Select
          disabled={disabled}
          style={{ flex: 1 }}
          value={localUnit}
          variant="filled"
          options={[
            { label: t('taskSchedule.minutes'), value: 'minutes' },
            { label: t('taskSchedule.hours'), value: 'hours' },
          ]}
          onChange={handleUnitChange}
        />
        <Text type="secondary">{t('taskSchedule.intervalSuffix')}</Text>
      </div>
    </div>
  );
});

interface SchedulerTabProps {
  disabled?: boolean;
  taskId?: string;
}

const SchedulerTab = memo<SchedulerTabProps>(({ disabled, taskId }) => {
  const updateSchedule = useTaskStore((s) => s.updateSchedule);
  const pattern = useTaskDetailSelector(taskDetailSelectors.taskSchedulePattern);
  const timezone = useTaskDetailSelector(taskDetailSelectors.taskScheduleTimezone);
  const maxExecutions = useTaskDetailSelector(taskDetailSelectors.taskScheduleMaxExecutions);

  const handleChange = useCallback(
    (change: SchedulerFormChange) => {
      if (disabled) return;
      if (!taskId) return;
      updateSchedule(taskId, change);
    },
    [disabled, taskId, updateSchedule],
  );

  return (
    <SchedulerForm
      key={taskId}
      maxExecutions={maxExecutions}
      pattern={pattern}
      timezone={timezone}
      onChange={handleChange}
    />
  );
});

interface TaskScheduleConfigProps {
  children?: ReactNode;
  currentInterval?: number;
  taskId?: string;
}

const TaskScheduleConfig = memo(function TaskScheduleConfig({
  children,
  currentInterval,
  taskId,
}: TaskScheduleConfigProps) {
  const { t, i18n } = useTranslation('chat');
  const { allowed: canEditTask, reason } = usePermission('create_content');
  const activeTaskId = useTaskDetailTaskId();
  const activeTaskInterval = useTaskDetailSelector(taskDetailSelectors.taskPeriodicInterval);
  const automationMode = useTaskDetailSelector(taskDetailSelectors.taskAutomationMode);
  const setAutomationMode = useTaskStore((s) => s.setAutomationMode);
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const status = useTaskDetailSelector(taskDetailSelectors.taskStatus);
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const schedulePattern = useTaskDetailSelector(taskDetailSelectors.taskSchedulePattern);
  const scheduleTimezone = useTaskDetailSelector(taskDetailSelectors.taskScheduleTimezone);

  const finalTaskId = taskId ?? activeTaskId;
  const finalCurrentInterval = currentInterval ?? activeTaskInterval;

  const enabled = !!automationMode;
  const [isStartingSchedule, setIsStartingSchedule] = useState(false);
  const canStartSchedule =
    ((automationMode === 'schedule' && !!schedulePattern) ||
      (automationMode === 'heartbeat' && finalCurrentInterval > 0)) &&
    !!finalTaskId &&
    status !== 'scheduled' &&
    status !== 'running';

  const summary = useMemo<{ primary: string; secondary?: string } | null>(() => {
    if (automationMode === 'heartbeat' && finalCurrentInterval > 0) {
      return {
        primary: t('taskSchedule.summary.heartbeat', {
          interval: formatIntervalLabel(finalCurrentInterval, t),
        }),
      };
    }
    if (automationMode === 'schedule' && schedulePattern) {
      return {
        primary: formatScheduleDescription(schedulePattern, t),
        secondary: scheduleTimezone
          ? formatTimezoneName(scheduleTimezone, i18n.language)
          : undefined,
      };
    }
    return null;
  }, [automationMode, finalCurrentInterval, schedulePattern, scheduleTimezone, t, i18n.language]);

  const nextRun = useMemo(() => {
    if (!enabled) return null;
    if (automationMode === 'heartbeat') {
      return nextHeartbeatFiring(
        detail?.heartbeat?.scheduledAt ?? detail?.heartbeat?.lastAt,
        finalCurrentInterval,
      );
    }
    if (automationMode === 'schedule' && schedulePattern) {
      return nextScheduleFiring(schedulePattern, scheduleTimezone);
    }
    return null;
  }, [
    automationMode,
    detail?.heartbeat?.lastAt,
    detail?.heartbeat?.scheduledAt,
    enabled,
    finalCurrentInterval,
    schedulePattern,
    scheduleTimezone,
  ]);

  const nextRunText = useMemo(() => {
    if (!nextRun) return null;
    return dayjs(nextRun.toDate()).format(t('taskSchedule.nextRun.format'));
  }, [nextRun, t]);

  const handleEnableChange = useCallback(
    (checked: boolean) => {
      if (!canEditTask) return;
      if (!finalTaskId) return;
      // Schedule (cron) is the more common, predictable choice; users who want
      // a fixed interval can switch to the heartbeat tab from there.
      setAutomationMode(finalTaskId, checked ? 'schedule' : null);
    },
    [canEditTask, finalTaskId, setAutomationMode],
  );

  const handleModeChange = useCallback(
    (value: string) => {
      if (!canEditTask) return;
      if (!finalTaskId) return;
      setAutomationMode(finalTaskId, value as TaskAutomationMode);
    },
    [canEditTask, finalTaskId, setAutomationMode],
  );

  const handleStartScheduling = useCallback(async () => {
    if (!canEditTask) return;
    if (!finalTaskId) return;
    setIsStartingSchedule(true);
    try {
      await updateTaskStatus(finalTaskId, 'scheduled');
    } finally {
      setIsStartingSchedule(false);
    }
  }, [canEditTask, finalTaskId, updateTaskStatus]);

  const content = (
    <div
      className="flex flex-col gap-4"
      style={{ padding: 4, width: 440 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        <Avatar
          avatar={<Zap color={cssVar.colorSuccess} size={20} />}
          background={cssVar.colorSuccessBg}
          shape="square"
          size={40}
        />
        <div className="flex flex-1 flex-col gap-0.5">
          <Text weight={500}>{t('taskSchedule.heading')}</Text>
          <Text style={{ color: cssVar.colorTextSecondary, fontSize: 12 }}>
            {summary?.primary ?? t('taskSchedule.summary.disabled')}
          </Text>
          {summary?.secondary && (
            <Text style={{ color: cssVar.colorTextDescription, fontSize: 11 }}>
              {summary.secondary}
            </Text>
          )}
        </div>
        <Switch checked={enabled} disabled={!canEditTask} onChange={handleEnableChange} />
      </div>

      {enabled && nextRunText && (
        <div className={`flex items-center gap-2.5 ${styles.preview}`}>
          <Clock color={cssVar.colorTextDescription} size={16} />
          <Text style={{ color: cssVar.colorTextSecondary }}>{t('taskSchedule.nextRun')}</Text>
          <Text style={{ flex: 1, textAlign: 'right' }} weight={500}>
            {nextRunText}
          </Text>
        </div>
      )}

      {enabled && (
        <>
          <Tabs
            activeKey={automationMode ?? 'heartbeat'}
            items={[
              {
                disabled: !canEditTask,
                key: 'schedule',
                label: (
                  <div className="flex items-center justify-center gap-1.5">
                    <CalendarDays size={14} />
                    <span>{t('taskSchedule.schedulerTab')}</span>
                  </div>
                ),
              },
              {
                disabled: !canEditTask,
                key: 'heartbeat',
                label: (
                  <div className="flex items-center justify-center gap-1.5">
                    <RefreshCw size={14} />
                    <span>{t('taskSchedule.intervalTab')}</span>
                  </div>
                ),
              },
            ]}
            styles={{
              list: { display: 'flex', width: '100%' },
              tab: { flex: 1 },
            }}
            onChange={handleModeChange}
          />
          {automationMode === 'heartbeat' && (
            <IntervalTab
              currentInterval={finalCurrentInterval}
              disabled={!canEditTask}
              taskId={finalTaskId}
            />
          )}
          {automationMode === 'schedule' && (
            <SchedulerTab disabled={!canEditTask} taskId={finalTaskId} />
          )}
          {canStartSchedule && (
            <Button
              block
              disabled={!canEditTask}
              icon={CalendarClockIcon}
              loading={isStartingSchedule}
              type="primary"
              onClick={handleStartScheduling}
            >
              {t('taskSchedule.startScheduling')}
            </Button>
          )}
        </>
      )}
    </div>
  );

  const trigger = children ? (
    <div title={canEditTask ? undefined : reason} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  ) : (
    <ActionIcon
      disabled={!canEditTask}
      icon={TimerIcon}
      size="small"
      title={t('taskSchedule.title')}
      onClick={(e) => e.stopPropagation()}
    />
  );

  if (!canEditTask) return trigger;

  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={'end'} className={`w-auto p-0 ${styles.popover}`}>
        {content}
      </PopoverContent>
    </Popover>
  );
});

export default TaskScheduleConfig;
