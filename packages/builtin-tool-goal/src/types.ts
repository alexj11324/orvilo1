export type { CreateGoalParams, CreateGoalState } from '@orvilo/builtin-tool-task';

export const GoalApiName = {
  createGoal: 'createGoal',
} as const;

export type GoalApiNameType = (typeof GoalApiName)[keyof typeof GoalApiName];
