import { describe, expect, it } from 'vitest';

import {
  resolveWorkflowCreatePreset,
  resolveWorkflowMove,
  type WorkflowMoveState,
} from '../workflowMove';

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

describe('resolveWorkflowCreatePreset', () => {
  it('stamps the only mapped state and accepts the issue out of intake', () => {
    expect(
      resolveWorkflowCreatePreset({
        category: 'todo',
        states: [state('todo-1', 'todo', 'remote-todo'), state('done-1', 'done')],
        teamId: 'team-1',
      }),
    ).toEqual({
      triageStatus: 'accepted',
      workflowCategory: 'todo',
      workflowStateId: 'remote-todo',
      workflowStateRefId: 'todo-1',
    });
  });

  it('keeps the bare category when no state matches or several could', () => {
    expect(
      resolveWorkflowCreatePreset({ category: 'in_review', states: [], teamId: 'team-1' }),
    ).toEqual({ triageStatus: 'accepted', workflowCategory: 'in_review' });
    expect(
      resolveWorkflowCreatePreset({
        category: 'in_review',
        states: [state('review-1', 'in_review'), state('review-2', 'in_review')],
        teamId: 'team-1',
      }),
    ).toEqual({ triageStatus: 'accepted', workflowCategory: 'in_review' });
  });

  it('keeps a Triage-column create in intake', () => {
    expect(
      resolveWorkflowCreatePreset({ category: 'triage', states: [], teamId: 'team-1' }),
    ).toEqual({ workflowCategory: 'triage' });
  });

  it('accepts a status-preset create on a team task', () => {
    expect(resolveWorkflowCreatePreset({ states: [], status: 'paused', teamId: 'team-1' })).toEqual(
      { triageStatus: 'accepted' },
    );
  });

  it('leaves team-less and unpreset creates to the model default', () => {
    expect(
      resolveWorkflowCreatePreset({ category: 'todo', states: [state('todo-1', 'todo')] }),
    ).toEqual({
      workflowCategory: 'todo',
      workflowStateId: 'todo-1',
      workflowStateRefId: 'todo-1',
    });
    expect(resolveWorkflowCreatePreset({ states: [] })).toEqual({});
    expect(resolveWorkflowCreatePreset({ states: [], teamId: 'team-1' })).toEqual({});
  });
});
