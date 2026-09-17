import { describe, expect, it } from 'vitest';

import { taskRunIdempotencyKey } from './idempotency';

describe('taskRunIdempotencyKey', () => {
  it('keeps a goal attempt stable while distinguishing the next durable generation', () => {
    const input = {
      executionGeneration: 3,
      goalId: 'goal-1',
      taskId: 'task-1',
      taskRevision: 7,
    };

    expect(taskRunIdempotencyKey.goalTaskAttempt(input)).toBe(
      'goal:goal-1:task:task-1:generation:4:revision:7',
    );
    expect(taskRunIdempotencyKey.goalTaskAttempt(input)).toBe(
      taskRunIdempotencyKey.goalTaskAttempt({ ...input }),
    );
    expect(taskRunIdempotencyKey.goalTaskAttempt({ ...input, executionGeneration: 4 })).not.toBe(
      taskRunIdempotencyKey.goalTaskAttempt(input),
    );
  });

  it('uses durable event identities for cascade, steer, integration and onboarding retries', () => {
    expect(
      taskRunIdempotencyKey.dependencyCascade({
        completedTaskIds: ['task-b', 'task-a', 'task-a'],
        executionGeneration: 0,
        taskId: 'task-child',
        taskRevision: 2,
      }),
    ).toBe('dependency-cascade:task-a,task-b:task:task-child:generation:1:revision:2');
    expect(
      taskRunIdempotencyKey.steerContinuation({
        messageId: 'message-1',
        taskId: 'task-1',
        topicId: 'topic-1',
      }),
    ).toBe('steer:task-1:topic:topic-1:message:message-1');
    expect(
      taskRunIdempotencyKey.readySubtask({
        parentTaskId: 'parent-1',
        requestId: 'click-1',
        taskId: 'task-child',
      }),
    ).toBe('ready-subtasks:click-1:parent:parent-1:task:task-child');
    expect(
      taskRunIdempotencyKey.integrationCorrection({
        attempt: 2,
        taskId: 'task-1',
        taskRevision: 4,
        topicId: 'topic-1',
      }),
    ).toBe('integration:task-1:topic:topic-1:attempt:2:revision:4');
    expect(
      taskRunIdempotencyKey.onboardingRecommendation({
        recommendationId: 'recommendation-1',
        sessionId: 'session-1',
        taskId: 'task-1',
        topicId: 'topic-1',
      }),
    ).toBe('onboarding:topic-1:session:session-1:recommendation:recommendation-1:task:task-1');
  });

  it('keeps automation redeliveries on the same tick and uses generation without a token', () => {
    expect(
      taskRunIdempotencyKey.automationTick({
        executionGeneration: 5,
        kind: 'heartbeat',
        taskId: 'task-1',
        tickToken: 'tick-7',
      }),
    ).toBe('heartbeat:tick:tick-7');
    expect(
      taskRunIdempotencyKey.automationTick({
        executionGeneration: 5,
        kind: 'schedule',
        taskId: 'task-1',
      }),
    ).toBe('schedule:tick:task:task-1:generation:6');
  });
});
