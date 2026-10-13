/**
 * Shared shaping for the `createGoal` tool between the client executor and the
 * server runtime: both create the same Goal Graph, so the wording the agent and
 * the verifier read must not drift between the two paths.
 */
import type { GoalSchedulePolicy } from '@orvilo/types';

/**
 * Attempts one Work gets before the coordinator opens a decision gate.
 *
 * `null` is the manifest's documented "no user-specified cap" — the cleared
 * input field — and must stay distinct from a chosen number, or clearing the
 * field would quietly pin the goal to three attempts. Returning `undefined`
 * leaves `maxAttemptsPerTask` off the config so `resolveTaskAttemptBudget`
 * applies its own default.
 */
export const resolveGoalAttemptBudget = (maxIterations?: number | null): number | undefined =>
  typeof maxIterations === 'number' ? Math.min(10, Math.max(2, maxIterations)) : undefined;

/**
 * How many of the goal's Tasks may run at once (1–10).
 *
 * `null` is the cleared input field — distinct from a chosen number — and
 * returns `undefined` so `maxConcurrentTasks` stays off the config and the
 * coordinator's default applies. Bounds mirror the router's create input.
 */
export const resolveGoalConcurrency = (maxConcurrentTasks?: number | null): number | undefined =>
  typeof maxConcurrentTasks === 'number'
    ? Math.min(10, Math.max(1, Math.round(maxConcurrentTasks)))
    : undefined;

/**
 * The goal's calendar-time budget, as the schedule config the coordinator reads.
 *
 * `null` is the manifest's documented "no user-specified deadline" — the cleared
 * input field — and returns `undefined` so the schedule block stays off the
 * config entirely. An invalid string is dropped rather than stored: a deadline
 * that cannot be parsed would either never fire (silently no budget) or fire
 * immediately (silently paused goal), and both hide the mistake from the user.
 */
export const resolveGoalScheduleConfig = (
  deadline?: string | null,
): GoalSchedulePolicy | undefined => {
  if (typeof deadline !== 'string' || deadline.trim() === '') return undefined;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return { deadline: parsed.toISOString() };
};

/** Compose the reviewed scope and acceptance criteria into the editable description. */
export const buildGoalRequirement = (
  name: string,
  criteriaDescription: string,
  instruction?: string,
): string =>
  [...new Set([`## ${name}`, instruction, criteriaDescription].filter(Boolean))].join('\n\n');
