import { deriveLegacyTaskStatus } from '@orvilo/types';
import { and, eq, sql } from 'drizzle-orm';

import { isAutomationArmed, TASK_OPEN_WORKFLOW } from '@/database/models/taskExecutionSql';
import { tasks } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import type { OrviloDatabase } from '@/database/type';
import { appEnv } from '@/envs/app';

import { createTaskSchedulerModule } from './impls';
import type { TaskSchedulerImpl } from './impls/type';

/**
 * Restore the same durable token, never invent a new occurrence on restart.
 * scheduledAt is the time of arming, so due = scheduledAt + interval.
 * Missed intervals coalesce into the single pending token; interval mode is
 * completion-relative, and lifecycle settlement arms the next token.
 */
export async function recoverLocalHeartbeatSchedules(
  db: OrviloDatabase,
  options: { now?: number; scheduler?: TaskSchedulerImpl } = {},
) {
  if (appEnv.enableQueueAgentRuntime) return { restored: 0, overdue: 0, invalid: 0 };
  const armed = await db
    .select({
      automationMode: tasks.automationMode,
      context: tasks.context,
      createdByUserId: tasks.createdByUserId,
      heartbeatInterval: tasks.heartbeatInterval,
      id: tasks.id,
      workflowCategory: tasks.workflowCategory,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.automationMode, 'heartbeat'),
        TASK_OPEN_WORKFLOW,
        isAutomationArmed,
        sql`${tasks.isDeleted} IS NOT TRUE`,
      ),
    );
  // An overdue token may wake at 0ms. Wait for callback registration rather
  // than assuming the existing scheduler's lazy import has already finished.
  if (!options.scheduler) await import('@/server/services/taskRunner/heartbeatTick');
  const scheduler = options.scheduler ?? createTaskSchedulerModule();
  const now = options.now ?? Date.now();
  let restored = 0;
  let overdue = 0;
  let invalid = 0;
  for (const task of armed) {
    // Defence in depth for callers/test adapters; the timer callback also
    // re-reads DB, fencing any pause or mode change after this scan.
    if (deriveLegacyTaskStatus(task) !== 'scheduled' || task.automationMode !== 'heartbeat')
      continue;
    const context = task.context as {
      scheduler?: { scheduledAt?: string; tickToken?: string };
    } | null;
    const token = context?.scheduler?.tickToken;
    const scheduledAt = Date.parse(context?.scheduler?.scheduledAt ?? '');
    const interval = task.heartbeatInterval;
    if (
      !task.createdByUserId ||
      !token ||
      !Number.isFinite(scheduledAt) ||
      !interval ||
      interval <= 0
    ) {
      invalid++;
      continue;
    }
    const dueAt = scheduledAt + interval * 1000;
    await scheduler.scheduleNextTopic({
      delay: Math.max(0, (dueAt - now) / 1000),
      taskId: task.id,
      tickToken: token,
      userId: task.createdByUserId,
    });
    restored++;
    if (dueAt <= now) overdue++;
  }
  return { restored, overdue, invalid };
}

interface RecoveryLoopGlobal {
  __orviloHeartbeatRecoveryTimer?: ReturnType<typeof setInterval>;
}

/** Boot recovery and periodic repair of timers lost after callback errors. */
export function startLocalHeartbeatRecoveryLoop() {
  if (appEnv.enableQueueAgentRuntime) return;
  const state = globalThis as RecoveryLoopGlobal;
  if (state.__orviloHeartbeatRecoveryTimer) return;
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await recoverLocalHeartbeatSchedules(await getServerDB());
    } catch {
      console.error('[task-scheduler] Persistent heartbeat recovery unavailable');
    } finally {
      inFlight = false;
    }
  };
  void tick();
  state.__orviloHeartbeatRecoveryTimer = setInterval(() => void tick(), 60_000);
  state.__orviloHeartbeatRecoveryTimer.unref?.();
}
