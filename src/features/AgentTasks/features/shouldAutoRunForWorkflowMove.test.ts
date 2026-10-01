import { describe, expect, it } from 'vitest';

import { shouldAutoRunForWorkflowMove } from './shouldAutoRunForWorkflowMove';

describe('shouldAutoRunForWorkflowMove', () => {
  it('starts a run when a task enters in progress or review', () => {
    expect(
      shouldAutoRunForWorkflowMove({ nextCategory: 'in_progress', previousCategory: 'todo' }),
    ).toBe(true);
    expect(
      shouldAutoRunForWorkflowMove({ nextCategory: 'in_review', previousCategory: 'in_progress' }),
    ).toBe(true);
  });

  it('does not start from todo, done, or a same-category move', () => {
    expect(
      shouldAutoRunForWorkflowMove({ nextCategory: 'todo', previousCategory: 'backlog' }),
    ).toBe(false);
    expect(
      shouldAutoRunForWorkflowMove({
        nextCategory: 'in_progress',
        previousCategory: 'in_progress',
      }),
    ).toBe(false);
  });

  it('leaves a running, scheduled, blocked, or automated task alone', () => {
    expect(
      shouldAutoRunForWorkflowMove({
        nextCategory: 'in_progress',
        previousCategory: 'todo',
        status: 'running',
      }),
    ).toBe(false);
    expect(
      shouldAutoRunForWorkflowMove({
        nextCategory: 'in_progress',
        previousCategory: 'todo',
        status: 'scheduled',
      }),
    ).toBe(false);
    expect(
      shouldAutoRunForWorkflowMove({
        blocked: true,
        nextCategory: 'in_progress',
        previousCategory: 'todo',
      }),
    ).toBe(false);
    expect(
      shouldAutoRunForWorkflowMove({
        automationMode: 'schedule',
        nextCategory: 'in_review',
        previousCategory: 'todo',
      }),
    ).toBe(false);
  });
});
