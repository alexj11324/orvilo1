import type { GoalAdvanceTrigger } from '@orvilo/agent-tracing';
import type { GoalTickResult } from '@orvilo/types';

export const MAX_TICKS_PER_ADVANCE = 20;

export interface AdvanceGoalParams {
  goalId: string;
  trigger?: GoalAdvanceTrigger;
  userId: string;
  workspaceId?: string;
}

export interface AdvanceGoalOutcome {
  goalId: string;
  result: GoalTickResult;
  ticks: number;
}

/** Acknowledge persisted callbacks without opening a database, trace or another run. */
export const advanceGoal = async ({ goalId }: AdvanceGoalParams): Promise<AdvanceGoalOutcome> => ({
  goalId,
  result: {
    goalId,
    message: 'Standalone Goal execution is unavailable; use an Issue plan and Checklist',
    outcome: 'no_progress',
  },
  ticks: 0,
});
