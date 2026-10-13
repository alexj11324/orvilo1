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
  resolveStatusCascade,
  workQueryBoardMoveToastKey,
} from './workQueryBoardMove';

const mocks = vi.hoisted(() => ({
  createCascadeModal: vi.fn(),
  createPicker: vi.fn(),
  pickReviewer: vi.fn(),
  find: vi.fn(),
  getTaskTree: vi.fn(),
  moveBoard: vi.fn(),
  update: vi.fn(),
  updateStatusCascade: vi.fn(),
}));

vi.mock('@/features/AgentTasks/features/ReviewerAgentSelector', () => ({
  pickReviewerAgent: mocks.pickReviewer,
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
    mocks.find.mockResolvedValue({ data: { ...task, reviewerAgentId: 'reviewer-1' } });
  });

  it('does not move into review when reviewer selection is cancelled', async () => {
    mocks.find.mockResolvedValue({ data: { ...task, reviewerAgentId: null } });
    mocks.pickReviewer.mockResolvedValue(null);
    await expect(
      moveBoardMaybePickingState({
        expectedDomainRevision: 3,
        groupBy: 'workflowCategory',
        targetKey: 'in_review',
        taskId: task.id,
      }),
    ).resolves.toBe(false);
    expect(mocks.moveBoard).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('sets the chosen reviewer before committing review with the fresh revision', async () => {
    mocks.find
      .mockResolvedValueOnce({ data: { ...task, reviewerAgentId: null } })
      .mockResolvedValueOnce({
        data: { ...task, domainRevision: 4, reviewerAgentId: 'reviewer-2' },
      });
    mocks.pickReviewer.mockResolvedValue('reviewer-2');
    await moveBoardMaybePickingState({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'in_review',
      taskId: task.id,
    });
    expect(mocks.update).toHaveBeenCalledWith(task.id, {
      reviewerAgentId: 'reviewer-2',
      expectedDomainRevision: 3,
    });
    expect(mocks.moveBoard).toHaveBeenCalledWith(
      expect.objectContaining({ expectedDomainRevision: 4 }),
    );
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.moveBoard.mock.invocationCallOrder[0],
    );
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
    mocks.find.mockResolvedValue({ data: { ...task, reviewerAgentId: 'reviewer-1' } });
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

describe('resolveStatusCascade', () => {
  const family = [
    { id: 'tsk_1', identifier: 'T-1', status: 'backlog' },
    { id: 'tsk_2', identifier: 'T-2', status: 'backlog' },
    { id: 'tsk_3', identifier: 'T-3', status: 'completed' },
  ];
  const input = (parentOnly = vi.fn(async () => 3)) => ({
    parentOnly,
    status: 'completed' as const,
    task: { id: 'tsk_1', identifier: 'T-1' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTaskTree.mockResolvedValue({ data: family });
  });

  it('asks nothing and moves just the issue when it has no open sub-issues', async () => {
    mocks.getTaskTree.mockResolvedValue({ data: [family[0], family[2]] });
    const parentOnly = vi.fn(async () => 5);

    await expect(resolveStatusCascade(input(parentOnly))).resolves.toEqual({
      cascaded: false,
      revision: 5,
    });
    expect(mocks.createCascadeModal).not.toHaveBeenCalled();
    expect(mocks.updateStatusCascade).not.toHaveBeenCalled();
  });

  it('lists only the open sub-issues and cascades through the server on "update all"', async () => {
    mocks.updateStatusCascade.mockResolvedValue({ data: { task: { domainRevision: 9 } } });
    mocks.createCascadeModal.mockImplementation(
      async (options: { onApply: (includeSubtasks: boolean) => Promise<void> }) => {
        await options.onApply(true);
        return true;
      },
    );
    const parentOnly = vi.fn(async () => 5);

    await expect(resolveStatusCascade(input(parentOnly))).resolves.toEqual({
      cascaded: true,
      revision: 9,
    });
    expect(mocks.createCascadeModal.mock.calls[0][0].subtasks).toEqual([family[1]]);
    expect(mocks.updateStatusCascade).toHaveBeenCalledWith('T-1', 'completed');
    expect(parentOnly).not.toHaveBeenCalled();
  });

  it('runs the caller\'s own write on "parent only"', async () => {
    mocks.createCascadeModal.mockImplementation(
      async (options: { onApply: (includeSubtasks: boolean) => Promise<void> }) => {
        await options.onApply(false);
        return true;
      },
    );

    await expect(resolveStatusCascade(input())).resolves.toEqual({ cascaded: false, revision: 3 });
    expect(mocks.updateStatusCascade).not.toHaveBeenCalled();
  });

  it('resolves with nothing when the question is dismissed', async () => {
    mocks.createCascadeModal.mockResolvedValue(false);
    const parentOnly = vi.fn(async () => 5);

    await expect(resolveStatusCascade(input(parentOnly))).resolves.toBeUndefined();
    expect(parentOnly).not.toHaveBeenCalled();
    expect(mocks.updateStatusCascade).not.toHaveBeenCalled();
  });
});

describe('applyWorkQueryStatusChoice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveBoard.mockResolvedValue({ success: true });
    mocks.find.mockResolvedValue({ data: { ...task, reviewerAgentId: 'reviewer-1' } });
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
