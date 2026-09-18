import { describe, expect, it } from 'vitest';

import {
  cascadeStatusForBoardKey,
  isMyWorkBoardMode,
  parseWorkQueryBoardPayload,
  workQueryMovePlan,
} from './workQueryBoard';

const task = {
  domainRevision: 3,
  id: 'tsk_1',
  identifier: 'T-1',
  status: 'backlog',
  workflowCategory: 'todo',
  workflowStateId: null,
};

describe('isMyWorkBoardMode', () => {
  it('offers a board only on assigned and delegated', () => {
    expect(isMyWorkBoardMode('assigned')).toBe(true);
    expect(isMyWorkBoardMode('delegated')).toBe(true);
    expect(isMyWorkBoardMode('review')).toBe(false);
  });
});

describe('workQueryMovePlan', () => {
  it('keeps Linear-linked category moves on the existing task command', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'workflowCategory',
        targetKey: 'in_review',
        task: { ...task, workflowStateId: 'state-1' },
      }),
    ).toEqual({
      task: { ...task, workflowStateId: 'state-1' },
      type: 'linear-category',
      workflowCategory: 'in_review',
    });
  });

  it('routes local Done drops through the completion cascade instead of a raw status write', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'workflowCategory',
        targetKey: 'done',
        task,
      }),
    ).toEqual({ status: 'completed', task, type: 'cascade' });
  });

  it('uses a versioned local patch for ordinary category moves', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'workflowCategory',
        targetKey: 'backlog',
        task,
      }),
    ).toEqual({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'backlog',
      type: 'local',
    });
  });
});

describe('cascadeStatusForBoardKey', () => {
  it('maps Done and Canceled columns onto the completion gate', () => {
    expect(cascadeStatusForBoardKey('workflowCategory', 'done')).toBe('completed');
    expect(cascadeStatusForBoardKey('status', 'canceled')).toBe('canceled');
    expect(cascadeStatusForBoardKey('workflowCategory', 'todo')).toBeNull();
  });
});

describe('parseWorkQueryBoardPayload', () => {
  it('rejects malformed drag payloads', () => {
    expect(parseWorkQueryBoardPayload('{')).toBeNull();
    expect(parseWorkQueryBoardPayload(JSON.stringify({ groupKey: 'todo' }))).toBeNull();
  });
});
