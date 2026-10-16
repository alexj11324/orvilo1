import type { Context } from 'hono';

export interface GoalSweepPayload {
  dryRun?: boolean;
  limit?: number;
  staleAfterMs?: number;
}

/** Acknowledge old scheduled deliveries without scanning or producing new work. */
export async function sweep(c: Context) {
  return c.json(await runGoalSweep());
}

export const runGoalSweep = async (_payload: GoalSweepPayload = {}) => ({
  advanced: 0,
  skipped: 'goal_retired',
  stalled: 0,
  success: true,
});
