import { describe, expect, it } from 'vitest';

import { resolveWorkflowMove, type WorkflowMoveState } from '../workflowMove';

const state = (
  id: string,
  category: WorkflowMoveState['category'],
  remoteStateId: string | null = id,
): WorkflowMoveState => ({ category, id, remoteStateId });

describe('resolveWorkflowMove', () => {
  it('patches only the category when the team has no states in that column', () => {
    expect(
      resolveWorkflowMove({
        category: 'in_review',
        states: [state('todo-1', 'todo')],
      }),
    ).toEqual({ type: 'category', workflowCategory: 'in_review' });
  });

  it('auto-applies the only matching state, including local rows without a remote id', () => {
    expect(
      resolveWorkflowMove({
        category: 'todo',
        states: [state('todo-1', 'todo', null), state('review-1', 'in_review')],
      }),
    ).toEqual({
      type: 'exact',
      workflowCategory: 'todo',
      workflowStateId: null,
      workflowStateRefId: 'todo-1',
    });
  });

  it('requires an explicit pick when two states share a category', () => {
    expect(
      resolveWorkflowMove({
        category: 'in_review',
        states: [state('review-1', 'in_review'), state('review-2', 'in_review')],
      }),
    ).toEqual({ type: 'required' });
  });

  it('applies the selected row and rejects a state from another category', () => {
    const states = [state('review-1', 'in_review'), state('review-2', 'in_review')];
    expect(
      resolveWorkflowMove({
        category: 'in_review',
        states,
        targetWorkflowStateRefId: 'review-2',
      }),
    ).toEqual({
      type: 'exact',
      workflowCategory: 'in_review',
      workflowStateId: 'review-2',
      workflowStateRefId: 'review-2',
    });
    expect(
      resolveWorkflowMove({
        category: 'in_review',
        states,
        targetWorkflowStateRefId: 'todo-1',
      }),
    ).toEqual({ type: 'invalid' });
  });
});
