import { WORKFLOW_STATE_REQUIRED } from '@orvilo/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  kanbanColumnForWorkflowCategory,
  RAW_STATUS_KANBAN_COLUMNS,
  WORKFLOW_KANBAN_COLUMNS,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';

import {
  applyWorkQueryStatusChoice,
  commitWorkQueryBoardMove,
  moveBoardMaybePickingState,
  workQueryBoardMoveToastKey,
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
  getOpenSubtasks: (items: Array<{ status?: string }>) =>
    items.filter((item) => item.status !== 'completed' && item.status !== 'canceled'),
}));

const wfColumn = (category: string) => {
  const found = WORKFLOW_KANBAN_COLUMNS.find((item) => item.key === `wf:${category}`);
  if (!found) throw new Error(`missing workflow column ${category}`);
  return found;
};

const stColumn = (status: string) => {
  const found = RAW_STATUS_KANBAN_COLUMNS.find((item) => item.key === `st:${status}`);
  if (!found) throw new Error(`missing status column ${status}`);
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

describe('commitWorkQueryBoardMove', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveBoard.mockResolvedValue({ success: true });
  });

  it('drops onto a workflow column through moveBoard, not a raw category patch', async () => {
    await expect(
      commitWorkQueryBoardMove({
        column: wfColumn('in_review'),
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
        column: wfColumn('in_review'),
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
        column: wfColumn('done'),
        groupBy: 'workflowCategory',
        task,
      }),
    ).resolves.toBe(true);

    expect(mocks.createPicker).toHaveBeenCalledWith({ category: 'done', teamId: 'team_1' });
  });

  it('keeps an `st:` Runs-view drop on the execution-status axis — even for a linked task', async () => {
    // The `st:` board groups by the legacy execution projection; a drop there
    // writes that projection directly and never mutates the Issue Status.
    await expect(
      commitWorkQueryBoardMove({
        column: stColumn('paused'),
        groupBy: 'status',
        task,
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 3,
      groupBy: 'status',
      targetKey: 'paused',
      taskId: 'tsk_1',
    });
  });

  it('treats a drop onto the task’s own column as a noop — no write at all', async () => {
    await expect(
      commitWorkQueryBoardMove({
        column: wfColumn('todo'),
        groupBy: 'workflowCategory',
        task,
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).not.toHaveBeenCalled();
  });

  it('cascades an unlinked Done drop through subtasks before the board move', async () => {
    mocks.getTaskTree.mockResolvedValue({
      data: [{ id: 'tsk_1', identifier: 'T-1' }],
    });
    mocks.update.mockResolvedValue({ success: true });
    mocks.find.mockResolvedValue({ data: { domainRevision: 4 } });

    const unlinked = { ...task, workflowCategory: 'in_progress', workflowStateId: null };
    await expect(
      commitWorkQueryBoardMove({
        column: wfColumn('done'),
        groupBy: 'workflowCategory',
        task: unlinked,
      }),
    ).resolves.toBe(true);

    expect(mocks.update).toHaveBeenCalledWith('tsk_1', { status: 'completed' });
    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 4,
      groupBy: 'workflowCategory',
      targetKey: 'done',
      taskId: 'tsk_1',
    });
  });
});

describe('applyWorkQueryStatusChoice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveBoard.mockResolvedValue({ success: true });
  });

  it('routes a category menu row through the shared board command', async () => {
    const column = kanbanColumnForWorkflowCategory('in_review')!;
    await expect(
      applyWorkQueryStatusChoice({
        choice: { column, workflowCategory: 'in_review' },
        task,
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'in_review',
      taskId: 'tsk_1',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('carries a precise-state pick into the first CAS write — no picker', async () => {
    const column = kanbanColumnForWorkflowCategory('todo')!;
    const choice = {
      column,
      state: {
        category: 'todo' as const,
        id: 'tws_todo_b',
        name: 'Design',
        position: 1,
        remoteStateId: 'ls-todo-b',
        teamId: 'team_1',
        workspaceId: 'ws-1',
      },
      workflowCategory: 'todo' as const,
    };

    await expect(
      applyWorkQueryStatusChoice({
        choice,
        task: { ...task, workflowCategory: 'in_progress', workflowStateRefId: 'tws_todo_a' },
      }),
    ).resolves.toBe(true);

    expect(mocks.moveBoard).toHaveBeenCalledWith({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'todo',
      targetWorkflowStateRefId: 'tws_todo_b',
      taskId: 'tsk_1',
    });
    expect(mocks.createPicker).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a choice without a workflow target — execution rows are never picks', async () => {
    await expect(
      applyWorkQueryStatusChoice({
        choice: { column: stColumn('paused') },
        task,
      }),
    ).resolves.toBe(false);

    expect(mocks.moveBoard).not.toHaveBeenCalled();
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
