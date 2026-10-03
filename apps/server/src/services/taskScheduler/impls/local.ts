import { createHash } from 'node:crypto';

import debug from 'debug';

import type { ScheduleNextTopicParams, TaskSchedulerImpl } from './type';

const log = debug('task-scheduler:local');

export type TaskExecutionCallback = (
  taskId: string,
  userId: string,
  tickToken?: string,
) => Promise<void>;

/**
 * Local wake-up optimization. Persisted scheduler tokens are recovered by
 * recoverLocalHeartbeatSchedules after a restart or callback interruption.
 */
export class LocalTaskScheduler implements TaskSchedulerImpl {
  private executionCallback: TaskExecutionCallback | null = null;
  private pendingSchedules: Map<string, NodeJS.Timeout> = new Map();

  setExecutionCallback(callback: TaskExecutionCallback): void {
    this.executionCallback = callback;
  }

  async scheduleNextTopic(params: ScheduleNextTopicParams): Promise<string> {
    const { taskId, userId, delay = 0, tickToken } = params;
    const scheduleId = tickToken
      ? `local-task-${taskId}-${createHash('sha256').update(`${userId}:${tickToken}`).digest('hex')}`
      : `local-task-${taskId}-${Date.now()}`;
    if (this.pendingSchedules.has(scheduleId)) return scheduleId;

    log('Scheduling next topic for task %s (delay: %ds)', taskId, delay);

    const dueAt = Date.now() + Math.max(0, delay * 1000);
    const wake = async () => {
      if (Date.now() < dueAt) {
        arm();
        return;
      }
      this.pendingSchedules.delete(scheduleId);

      if (!this.executionCallback) {
        log('Warning: No execution callback set');
        return;
      }

      try {
        log('Executing next topic for task %s', taskId);
        if (tickToken) {
          await this.executionCallback(taskId, userId, tickToken);
        } else {
          await this.executionCallback(taskId, userId);
        }
      } catch (error) {
        log('Failed to execute next topic for task %s: %O', taskId, error);
      }
    };
    const arm = () => {
      // Node clamps larger delays to 1ms. Chunk long intervals instead of
      // accidentally executing a restored future occurrence immediately.
      const timer = setTimeout(
        () => void wake(),
        Math.min(2_147_483_647, Math.max(0, dueAt - Date.now())),
      );
      this.pendingSchedules.set(scheduleId, timer);
      timer.unref?.();
    };
    arm();
    return scheduleId;
  }

  async cancelScheduled(scheduleId: string): Promise<void> {
    const timer = this.pendingSchedules.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.pendingSchedules.delete(scheduleId);
      log('Canceled schedule %s', scheduleId);
    }
  }

  /** Process shutdown/HMR cleanup; persistent tokens remain recoverable. */
  dispose(): void {
    for (const timer of this.pendingSchedules.values()) clearTimeout(timer);
    this.pendingSchedules.clear();
  }
}
