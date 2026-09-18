import debug from 'debug';
import type { Context } from 'hono';

import { GoalModel } from '@/database/models/goal';
import { getServerDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { enqueueHatchetTask } from '@/libs/hatchet';
import { advanceGoal } from '@/server/services/goal/advanceGoal';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

const log = debug('orvilo-server:workflows:goal:sweep');

/**
 * How long a Work may hold its operation lease before the sweep treats the goal
 * as stalled. Above the coordinator's own claim TTL so a healthy run is never
 * swept while it is between heartbeats.
 */
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

export interface GoalSweepPayload {
  /** Only report what would be advanced. */
  dryRun?: boolean;
  limit?: number;
  /** Override the stale window, in milliseconds. */
  staleAfterMs?: number;
}

/**
 * Cron-style safety net for goal advancement.
 *
 * The fast path is event-driven — creating a goal, resolving a gate, or a Work
 * Task settling all queue an advance. This sweep exists because that path can
 * be missed: a queue message can be dropped, a runner can die between
 * dispatching a Work and writing its outcome, and a Work can outlive its
 * operation lease with nobody left to reclaim it. Without it, one lost message
 * strands a long-horizon goal forever.
 *
 * Registered as a Hatchet cron task. Global scan, no per-user auth; the worker
 * invokes this handler directly.
 */
export async function sweep(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as GoalSweepPayload;
    return c.json(await runGoalSweep(body));
  } catch (error) {
    console.error('[goal/sweep] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}

export const runGoalSweep = async ({
  dryRun = false,
  limit = 200,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
}: GoalSweepPayload = {}) => {
  const db = await getServerDB();
  const stalled = await GoalModel.listStalled(db, {
    limit,
    staleBefore: new Date(Date.now() - staleAfterMs),
  });

  log('scan: stalled=%d dryRun=%s', stalled.length, dryRun);

  if (dryRun || stalled.length === 0) {
    return { advanced: 0, dryRun, stalled: stalled.length, success: true };
  }

  const advanced = await fanout(
    stalled.map((goal) => ({
      goalId: goal.id,
      trigger: 'sweep' as const,
      userId: goal.userId,
      workspaceId: goal.workspaceId ?? undefined,
    })),
  );

  return { advanced, stalled: stalled.length, success: true };
};

interface StalledGoal {
  goalId: string;
  trigger: 'sweep';
  userId: string;
  workspaceId?: string;
}

/**
 * Hand each goal off individually so one that throws cannot take the sweep
 * down with it, and so each gets its own retry budget in queue mode.
 */
const fanout = async (goals: StalledGoal[]): Promise<number> => {
  const results = appEnv.enableQueueAgentRuntime
    ? await publishAll(goals)
    : await Promise.allSettled(goals.map((goal) => advanceGoal(goal)));

  let advanced = 0;
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') advanced += 1;
    else
      console.error('[goal/sweep] advance failed goal=%s: %O', goals[index].goalId, result.reason);
  }
  return advanced;
};

const publishAll = async (goals: StalledGoal[]) => {
  return Promise.allSettled(
    goals.map((input) => enqueueHatchetTask(HATCHET_TASK_NAMES.goalAdvance, input)),
  );
};
