import { describe, expect, it } from 'vitest';

import {
  resolveTriageOutcome,
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

describe('resolveTriageOutcome', () => {
  it('moves declined issues to the canceled category like Linear', () => {
    // Linear: "Declining will update the issue to a Canceled status type" —
    // without the category move the row resurfaced as ordinary open work.
    expect(
      resolveTriageOutcome({
        action: 'decline',
        states: [state('cancel-1', 'canceled', 'remote-cancel')],
        workflowCategory: 'backlog',
      }),
    ).toEqual({
      workflowCategory: 'canceled',
      workflowStateId: 'remote-cancel',
      workflowStateRefId: 'cancel-1',
    });
  });

  it('moves duplicates to canceled too — Linear cancels the merged copy', () => {
    expect(
      resolveTriageOutcome({
        action: 'duplicate',
        states: [state('cancel-1', 'canceled')],
        workflowCategory: 'triage',
      }),
    ).toEqual({
      workflowCategory: 'canceled',
      workflowStateId: 'cancel-1',
      workflowStateRefId: 'cancel-1',
    });
  });

  it('lands the bare canceled category when no state or several could match', () => {
    expect(
      resolveTriageOutcome({ action: 'decline', states: [], workflowCategory: 'backlog' }),
    ).toEqual({ workflowCategory: 'canceled' });
    expect(
      resolveTriageOutcome({
        action: 'decline',
        states: [state('cancel-1', 'canceled'), state('cancel-2', 'canceled')],
        workflowCategory: 'backlog',
      }),
    ).toEqual({ workflowCategory: 'canceled' });
  });

  it('moves an accepted issue out of the triage lane, and only then', () => {
    // A card created inside the Triage column keeps category 'triage' — accept
    // must not leave it parked there (Linear moves to the default status).
    expect(
      resolveTriageOutcome({
        action: 'accept',
        states: [state('backlog-1', 'backlog')],
        workflowCategory: 'triage',
      }),
    ).toEqual({
      workflowCategory: 'backlog',
      workflowStateId: 'backlog-1',
      workflowStateRefId: 'backlog-1',
    });
    // Already-laned work keeps its category on accept/reassign.
    expect(
      resolveTriageOutcome({
        action: 'accept',
        states: [state('backlog-1', 'backlog')],
        workflowCategory: 'backlog',
      }),
    ).toEqual({});
    expect(
      resolveTriageOutcome({
        action: 'reassign',
        states: [state('backlog-1', 'backlog')],
        workflowCategory: 'todo',
      }),
    ).toEqual({});
  });
});
