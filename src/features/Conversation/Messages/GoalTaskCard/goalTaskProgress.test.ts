import { describe, expect, it } from 'vitest';

import { getGoalTaskProgress } from './goalTaskProgress';

describe('getGoalTaskProgress', () => {
  it('reports how much of the graph is closed while it runs', () => {
    expect(getGoalTaskProgress({ status: 'running', taskDone: 2, taskTotal: 3 })).toEqual({
      passed: 2,
      phase: 'running',
      progress: 67,
      total: 3,
    });
  });

  it('shows no task progress before the graph is seeded', () => {
    expect(getGoalTaskProgress({ status: 'planning' })).toEqual({
      passed: 0,
      phase: 'running',
      progress: 0,
      total: 0,
    });
  });

  it('lets a waiting decision gate outrank the goal status', () => {
    // A goal keeps its `running` row while a gate is open; the card must still
    // read as blocked on the user, not as work in progress.
    expect(getGoalTaskProgress({ pendingDecisions: 1, status: 'running' }).phase).toBe('waiting');
  });

  it.each([
    ['achieved', 'achieved'],
    ['canceled', 'canceled'],
    ['failed', 'error'],
    ['paused', 'paused'],
    ['review', 'review'],
  ] as const)('maps goal status %s to phase %s', (status, phase) => {
    expect(getGoalTaskProgress({ status }).phase).toBe(phase);
  });
});
