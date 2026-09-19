import { WORKFLOW_STATE_REQUIRED } from '@orvilo/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STATUS_KANBAN_COLUMNS } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';

import {
  commitWorkQueryBoardMove,
  commitWorkQueryListStatus,
  moveBoardMaybePickingState,
  storeKanbanUsesWorkflowMove,
  workQueryBoardMoveToastKey,
  workQueryMoveGroupBy,
} from './workQueryBoardMove';

const mocks = vi.hoisted(() => ({
  createCascadeModal: vi.fn(),
  createPicker: vi.fn(),
  find: vi.fn(),
  getTaskTree: vi.fn(),
  moveBoard: vi.fn(),
  update: vi.fn(),
  updateStatusCascade: vi.fn(),
}));

vi.mock('@/services/workAttention', () => ({
  workAttentionService: { moveBoard: mocks.moveBoard },
}));

vi.mock('@/services/task', () => ({
  taskService: {
    find: mocks.find,
    getTaskTree: mocks.getTaskTree,
    update: mocks.update,
    updateStatusCascade: mocks.updateStatusCascade,
  },
}));

vi.mock('./WorkflowStatePickerModal', () => ({
  createWorkflowStatePickerModal: mocks.createPicker,
}));

vi.mock('@/features/AgentTasks/features/TaskStatusCascadeModal', () => ({
  createTaskStatusCascadeModal: mocks.createCascadeModal,
}));

const column = (key: string) => {
  const found = STATUS_KANBAN_COLUMNS.find((item) => item.key === key);
  if (!found) throw new Error(`missing column ${key}`);
  return found;
};

const task = {
  domainRevision: 3,
  id: 'tsk_1',
  identifier: 'T-1',
  status: 'todo',
  teamId: 'team_1',
  workflowCategory: 'todo',
  workflowStateId: 'state-1',
};

const precondition = {
  data: { code: 'PRECONDITION_FAILED' },
  message: WORKFLOW_STATE_REQUIRED,
};

describe('moveBoardMaybePickingState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveBoard.mockResolvedValue({ success: true });
  });

  it('commits a versioned move without opening the picker', async () => {
    await expect(
      moveBoardMaybePickingState({
        expectedDomainRevision: 3,
        groupBy: 'workflowCategory',
        targetKey: 'in_review',
        taskId: 'tsk_1',
        teamId: 'team_1',
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).toHaveBeenCalledTimes(1);
    expect(mocks.createPicker).not.toHaveBeenCalled();
  });

  it('opens the exact-state picker when the team column is ambiguous', async () => {
    mocks.moveBoard.mockRejectedValueOnce(precondition).mockResolvedValueOnce({ success: true });
    mocks.createPicker.mockResolvedValue('state-done-2');

    await expect(
      moveBoardMaybePickingState({
        expectedDomainRevision: 3,
        groupBy: 'workflowCategory',
        targetKey: 'done',
        taskId: 'tsk_1',
        teamId: 'team_1',
      }),
    ).resolves.toBe(true);

    expect(mocks.createPicker).toHaveBeenCalledWith({
      category: 'done',
      teamId: 'team_1',
    });
    expect(mocks.moveBoard).toHaveBeenNthCalledWith(2, {
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'done',
      targetWorkflowStateRefId: 'state-done-2',
      taskId: 'tsk_1',
    });
  });

  it('returns false when the picker is cancelled so the board can revert', async () => {
    mocks.moveBoard.mockRejectedValueOnce(precondition);
    mocks.createPicker.mockResolvedValue(null);

    await expect(
      moveBoardMaybePickingState({
        expectedDomainRevision: 3,
        groupBy: 'workflowCategory',
        targetKey: 'in_review',
        taskId: 'tsk_1',
        teamId: 'team_1',
      }),
    ).resolves.toBe(false);

    expect(mocks.moveBoard).toHaveBeenCalledTimes(1);
  });

  it('does not treat a missing team as a picker prompt', async () => {
    mocks.moveBoard.mockRejectedValueOnce(precondition);

    await expect(
      moveBoardMaybePickingState({
        expectedDomainRevision: 3,
        groupBy: 'workflowCategory',
        targetKey: 'in_review',
        taskId: 'tsk_1',
      }),
    ).rejects.toEqual(precondition);

    expect(mocks.createPicker).not.toHaveBeenCalled();
  });
});

describe('storeKanbanUsesWorkflowMove', () => {
  it('sends Linear-linked My Work drops through moveBoard', () => {
    expect(storeKanbanUsesWorkflowMove('status', { workflowStateId: 'state-1' })).toBe(true);
    expect(storeKanbanUsesWorkflowMove('status', { workflowStateId: null })).toBe(false);
    expect(storeKanbanUsesWorkflowMove('assignee', { workflowStateId: 'state-1' })).toBe(false);
    expect(workQueryMoveGroupBy('status', { workflowStateId: 'state-1' })).toBe('workflowCategory');
    expect(workQueryMoveGroupBy('status', { workflowStateId: null })).toBe('status');
    expect(workQueryMoveGroupBy('workflowCategory', { workflowStateId: 'state-1' })).toBe(
      'workflowCategory',
    );
  });
});

describe('commitWorkQueryBoardMove', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveBoard.mockResolvedValue({ success: true });
  });

  it('drops onto In review through moveBoard, not a raw category patch', async () => {
    await expect(
      commitWorkQueryBoardMove({
        column: column('needsInput'),
        groupBy: 'workflowCategory',
        task,
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'in_review',
      taskId: 'tsk_1',
    });
  });

  it('rethrows a conflict so the board can revert', async () => {
    const conflict = { data: { code: 'CONFLICT' }, message: 'revision mismatch' };
    mocks.moveBoard.mockRejectedValueOnce(conflict);

    await expect(
      commitWorkQueryBoardMove({
        column: column('needsInput'),
        groupBy: 'workflowCategory',
        task,
      }),
    ).rejects.toEqual(conflict);
  });

  it('picks the exact Done state when the team column is ambiguous', async () => {
    mocks.moveBoard.mockRejectedValueOnce(precondition);
    mocks.createPicker.mockResolvedValue('state-done-2');
    mocks.moveBoard.mockResolvedValueOnce({ success: true });

    await expect(
      commitWorkQueryBoardMove({
        column: column('done'),
        groupBy: 'workflowCategory',
        task,
      }),
    ).resolves.toBe(true);

    expect(mocks.createPicker).toHaveBeenCalledWith({ category: 'done', teamId: 'team_1' });
  });

  it('promotes a status-grouped Linear card onto the workflow move path', async () => {
    await expect(
      commitWorkQueryBoardMove({
        column: column('needsInput'),
        groupBy: 'status',
        task,
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'in_review',
      taskId: 'tsk_1',
    });
  });

  it('keeps an unlinked status drop on the status path', async () => {
    await expect(
      commitWorkQueryBoardMove({
        column: column('needsInput'),
        groupBy: 'status',
        task: { ...task, workflowStateId: null },
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 3,
      groupBy: 'status',
      targetKey: 'paused',
      taskId: 'tsk_1',
    });
  });
});

describe('commitWorkQueryListStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveBoard.mockResolvedValue({ success: true });
  });

  it('sends a Linear list glyph through moveBoard instead of a local status patch', async () => {
    await expect(
      commitWorkQueryListStatus({
        groupBy: 'status',
        status: 'paused',
        task,
      }),
    ).resolves.toBe('moved');

    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'in_review',
      taskId: 'tsk_1',
    });
  });

  it('leaves unlinked list rows on the local task.update path', async () => {
    await expect(
      commitWorkQueryListStatus({
        groupBy: 'status',
        status: 'paused',
        task: { ...task, workflowStateId: null },
      }),
    ).resolves.toBe('local');
    expect(mocks.moveBoard).not.toHaveBeenCalled();
  });

  it('does not fall through to a local patch when the picker is cancelled', async () => {
    mocks.moveBoard.mockRejectedValueOnce(precondition);
    mocks.createPicker.mockResolvedValueOnce(undefined);

    await expect(
      commitWorkQueryListStatus({
        groupBy: 'status',
        status: 'completed',
        task,
      }),
    ).resolves.toBe('cancelled');
  });
});

describe('workQueryBoardMoveToastKey', () => {
  it('maps revision races and blockers onto the work-query copy', () => {
    expect(workQueryBoardMoveToastKey({ data: { code: 'CONFLICT' } })).toBe('myWork.moveConflict');
    expect(workQueryBoardMoveToastKey({ data: { code: 'PRECONDITION_FAILED' } })).toBe(
      'myWork.moveBlocked',
    );
    expect(workQueryBoardMoveToastKey(new Error('offline'))).toBe('myWork.moveFailed');
  });
});
