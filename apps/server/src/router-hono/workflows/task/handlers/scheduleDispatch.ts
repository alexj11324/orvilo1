import { isExecutionTime } from '@orvilo/utils/cronEval';
import debug from 'debug';
import type { Context } from 'hono';

import { TaskModel } from '@/database/models/task';
import { getServerDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';
import { runScheduleTick } from '@/server/services/taskRunner/scheduleTick';

const log = debug('lobe-server:workflows:task:schedule-dispatch');

export interface ScheduleDispatchPayload {
  /** When true, only return what would be dispatched without firing executes. */
  dryRun?: boolean;
}

interface DueTask {
  pattern: string;
  taskId: string;
  taskIdentifier: string;
  timezone: string | null;
  userId: string;
}

/**
 * Cron-style central dispatcher. Registered as a Hatchet cron task (e.g.
 * `*\/30 * * * *`) pointing at this endpoint. On each tick:
 *
 *   1. Loads all schedule-mode tasks in dispatchable status (`scheduled`/`backlog`).
 *   2. Filters by cron pattern + timezone + last-run dedup (`isExecutionTime`).
 *   3. Fan-outs one Hatchet task per due task to the schedule executor.
 *
 * No per-user authentication: this is a global worker sweep.
 */
export async function scheduleDispatch(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as ScheduleDispatchPayload;
    return c.json(await runScheduleDispatch(body));
  } catch (error) {
    console.error('[task/schedule-dispatch] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}

export const runScheduleDispatch = async ({ dryRun = false }: ScheduleDispatchPayload = {}) => {
  const db = await getServerDB();
  const tasks = await TaskModel.getScheduledTasks(db);

  const now = new Date();
  const due: DueTask[] = [];
  for (const task of tasks) {
    if (!task.schedulePattern) continue;
    const matches = isExecutionTime({
      cronPattern: task.schedulePattern,
      currentTime: now,
      lastExecutedAt: task.lastHeartbeatAt ?? null,
      timezone: task.scheduleTimezone,
    });
    if (!matches) continue;
    due.push({
      pattern: task.schedulePattern,
      taskId: task.id,
      taskIdentifier: task.identifier,
      timezone: task.scheduleTimezone,
      userId: task.createdByUserId,
    });
  }

  log(
    'scan: total=%d due=%d skipped=%d dryRun=%s',
    tasks.length,
    due.length,
    tasks.length - due.length,
    dryRun,
  );

  if (dryRun || due.length === 0) {
    return {
      dispatched: 0,
      dryRun,
      due: due.length,
      skipped: tasks.length - due.length,
      success: true,
      total: tasks.length,
    };
  }

  const dispatched = await fanout(due);

  return {
    dispatched,
    due: due.length,
    skipped: tasks.length - due.length,
    success: true,
    total: tasks.length,
  };
};

const fanout = async (due: DueTask[]): Promise<number> => {
  // In queue mode, hand off via Hatchet so each task gets its own retry budget
  // and runs in an isolated handler invocation. Locally, just run inline so
  // dev / electron can exercise the path without a remote worker.
  if (appEnv.enableQueueAgentRuntime) {
    const results = await Promise.allSettled(
      due.map((d) =>
        enqueueHatchetTask(HATCHET_TASK_NAMES.taskScheduleExecute, {
          taskId: d.taskId,
          userId: d.userId,
        }),
      ),
    );

    let dispatched = 0;
    for (const [i, r] of results.entries()) {
      if (r.status === 'fulfilled') {
        dispatched += 1;
      } else {
        console.error(
          '[task/schedule-dispatch] failed to publish task=%s identifier=%s: %O',
          due[i].taskId,
          due[i].taskIdentifier,
          r.reason,
        );
      }
    }
    return dispatched;
  }

  // Local / dev: invoke runScheduleTick directly. Errors are logged but don't
  // fail the dispatch — one bad task shouldn't block the rest.
  const results = await Promise.allSettled(due.map((d) => runScheduleTick(d.taskId, d.userId)));
  let dispatched = 0;
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      dispatched += 1;
    } else {
      console.error(
        '[task/schedule-dispatch] inline tick failed task=%s: %O',
        due[i].taskId,
        r.reason,
      );
    }
  }
  return dispatched;
};
