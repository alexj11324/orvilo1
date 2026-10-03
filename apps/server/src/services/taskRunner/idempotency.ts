/**
 * Stable identities for the commands that can start a Task run.
 *
 * These keys are part of the durable dispatch contract. They must be derived
 * from the command/tick/message that caused the run so a queue redelivery can
 * find the same dispatch instead of allocating a new one.
 */
export const taskRunIdempotencyKey = {
  /**
   * Backlog-intake starts are keyed on the task's execution generation so a
   * consumed (terminal) intent never blocks a later intake attempt for the
   * same revision lineage — each burned intent bumps the generation.
   */
  backlogIntake: (input: { executionGeneration: number; taskId: string }): string =>
    `backlog-intake:task:${input.taskId}:generation:${input.executionGeneration + 1}`,

  automationTick: (input: {
    kind: 'heartbeat' | 'schedule';
    taskId: string;
    tickToken: string;
  }): string => {
    if (!input.tickToken.trim())
      throw new Error('Automation tick requires a durable plan identity');
    return `${input.kind}:tick:${input.tickToken}`;
  },

  dependencyCascade: (input: {
    completedTaskIds: string[];
    executionGeneration: number;
    taskId: string;
    taskRevision: number;
  }): string =>
    `dependency-cascade:${[...new Set(input.completedTaskIds)].sort().join(',')}:task:${input.taskId}:generation:${input.executionGeneration + 1}:revision:${input.taskRevision}`,

  goalTaskAttempt: (input: {
    executionGeneration: number;
    goalId: string;
    taskId: string;
    taskRevision: number;
  }): string =>
    `goal:${input.goalId}:task:${input.taskId}:generation:${input.executionGeneration + 1}:revision:${input.taskRevision}`,

  integrationCorrection: (input: {
    attempt: number;
    taskId: string;
    taskRevision: number;
    topicId: string;
  }): string =>
    `integration:${input.taskId}:topic:${input.topicId}:attempt:${input.attempt}:revision:${input.taskRevision}`,

  onboardingRecommendation: (input: {
    recommendationId: string;
    sessionId: string;
    taskId: string;
    topicId: string;
  }): string =>
    `onboarding:${input.topicId}:session:${input.sessionId}:recommendation:${input.recommendationId}:task:${input.taskId}`,

  readySubtask: (input: { parentTaskId: string; requestId: string; taskId: string }): string =>
    `ready-subtasks:${input.requestId}:parent:${input.parentTaskId}:task:${input.taskId}`,
};
