import type { TaskDetailData, TaskListItem, TaskRunTrigger, TaskStatus } from '@orvilo/types';
import dayjs, { type Dayjs } from 'dayjs';
import type { TFunction } from 'i18next';

import {
  formatIntervalLabel,
  formatScheduleDescription,
  nextHeartbeatFiring,
  nextScheduleFiring,
} from '@/features/AgentTasks/AgentTaskDetail/scheduler/helpers';

/**
 * Cordy automation status ↔ task status. An automation is "active" while its
 * schedule or heartbeat can still fire — the same set the server-side
 * `automated: true` filter keeps (`backlog` / `running` / `scheduled` /
 * `paused`); only `paused` is the user-visible off state.
 */
export type AutomationStatus = 'active' | 'paused';

export const AUTOMATION_ACTIVE_STATUSES: TaskStatus[] = ['backlog', 'running', 'scheduled'];

export const automationStatusOf = (status: string): AutomationStatus =>
  status === 'paused' ? 'paused' : 'active';

/** Statuses the page's All/Active/Paused filter translates to server-side. */
export const automationStatusesFor = (
  filter: AutomationStatus | 'all',
): TaskStatus[] | undefined =>
  filter === 'active' ? AUTOMATION_ACTIVE_STATUSES : filter === 'paused' ? ['paused'] : undefined;

/** One-line trigger summary for a list row ("Every 10 min" / "Every day 09:00"). */
export const automationTriggerSummary = (task: TaskListItem, t: TFunction): string => {
  if (task.automationMode === 'schedule' && task.schedulePattern) {
    return formatScheduleDescription(task.schedulePattern, t as TFunction<'chat'>);
  }
  if (task.automationMode === 'heartbeat' && task.heartbeatInterval) {
    return t('trigger.every', {
      interval: formatIntervalLabel(task.heartbeatInterval, t as TFunction<'chat'>),
      ns: 'automation',
    });
  }
  return '—';
};

/** Next firing instant for a list row; null while unparseable or paused. */
export const automationNextRun = (task: TaskListItem): Dayjs | null => {
  if (automationStatusOf(task.status) === 'paused') return null;
  if (task.automationMode === 'schedule' && task.schedulePattern) {
    return nextScheduleFiring(task.schedulePattern, task.scheduleTimezone);
  }
  if (task.automationMode === 'heartbeat' && task.heartbeatInterval) {
    return nextHeartbeatFiring(
      task.lastHeartbeatAt ? dayjs(task.lastHeartbeatAt).toISOString() : null,
      task.heartbeatInterval,
    );
  }
  return null;
};

/** Cordy run duration label: <1m / Xm / Xh Ym. */
export const runDuration = (
  startIso: string | null | undefined,
  endIso?: string | null,
): string => {
  if (!startIso) return '—';
  const start = dayjs(startIso);
  const end = endIso ? dayjs(endIso) : dayjs();
  const minutes = Math.max(0, Math.floor(end.diff(start, 'minute', true)));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/** Label of what fired a run — falls back to "Manual" for API/goal sources. */
export const runTriggerLabel = (trigger: TaskRunTrigger | string | null | undefined): string => {
  switch (trigger) {
    case 'schedule': {
      return 'schedule';
    }
    case 'heartbeat': {
      return 'heartbeat';
    }
    case 'goal': {
      return 'goal';
    }
    default: {
      return 'manual';
    }
  }
};

/**
 * Run-status buckets for the history tables. task_topics rows carry topic
 * statuses; anything still in flight renders as "running".
 */
export type RunStatus = 'completed' | 'failed' | 'running' | 'skipped';

export const normalizeRunStatus = (status: string | null | undefined): RunStatus => {
  switch (status) {
    case 'completed': {
      return 'completed';
    }
    case 'canceled':
    case 'skipped': {
      return 'skipped';
    }
    case 'failed':
    case 'timeout': {
      return 'failed';
    }
    default: {
      return 'running';
    }
  }
};

/** Run statuses the All-runs page sends to `task.automationRuns`. */
export const RUN_STATUS_FILTER_OPTIONS: RunStatus[] = ['running', 'completed', 'failed', 'skipped'];

/** Maps the UI filter back onto stored task_topics statuses for the server query. */
export const RUN_STATUS_TO_TOPIC_STATUSES: Record<RunStatus, string[]> = {
  completed: ['completed'],
  failed: ['failed', 'timeout'],
  running: ['running'],
  skipped: ['canceled'],
};

export const automationDetailPath = (identifier: string) => `/automations/${identifier}`;

/** Detail-page counterpart of `automationTriggerSummary` (TaskDetailData shape). */
export const automationDetailTriggerSummary = (detail: TaskDetailData, t: TFunction): string => {
  if (detail.automationMode === 'schedule' && detail.schedule?.pattern) {
    return formatScheduleDescription(detail.schedule.pattern, t as TFunction<'chat'>);
  }
  if (detail.automationMode === 'heartbeat' && detail.heartbeat?.interval) {
    return t('trigger.every', {
      interval: formatIntervalLabel(detail.heartbeat.interval, t as TFunction<'chat'>),
      ns: 'automation',
    });
  }
  return '';
};

/** Detail-page counterpart of `automationNextRun`. */
export const automationDetailNextRun = (detail: TaskDetailData): Dayjs | null => {
  if (detail.status === 'paused') return null;
  if (detail.automationMode === 'schedule' && detail.schedule?.pattern) {
    return nextScheduleFiring(detail.schedule.pattern, detail.schedule.timezone ?? null);
  }
  if (detail.automationMode === 'heartbeat' && detail.heartbeat?.interval) {
    return nextHeartbeatFiring(
      detail.heartbeat.scheduledAt ?? detail.heartbeat.lastAt,
      detail.heartbeat.interval,
    );
  }
  return null;
};
