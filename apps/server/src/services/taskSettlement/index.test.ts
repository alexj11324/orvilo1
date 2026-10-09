// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settleTaskExecution, type SettleTaskExecutionInput } from './index';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  hasUnresolvedInput: vi.fn(),
  findByOperationId: vi.fn(),
  findByTopicId: vi.fn(),
  listWorkflowStates: vi.fn(),
  resolveTaskReviewRequirement: vi.fn(),
  updateStatus: vi.fn(),
  updateStatusForExecutionContract: vi.fn(),
  updateStatusIfCurrent: vi.fn(),
  updateStatusIfReservation: vi.fn(),
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return {
      findById: mocks.findById,
      hasUnresolvedInput: mocks.hasUnresolvedInput,
      resolveTaskReviewRequirement: mocks.resolveTaskReviewRequirement,
      updateStatus: mocks.updateStatus,
      updateStatusForExecutionContract: mocks.updateStatusForExecutionContract,
      updateStatusIfCurrent: mocks.updateStatusIfCurrent,
      updateStatusIfReservation: mocks.updateStatusIfReservation,
    };
  }),
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(function () {
    return {
      findByOperationId: mocks.findByOperationId,
      findByTopicId: mocks.findByTopicId,
    };
  }),
}));
vi.mock('@/database/models/team', () => ({
  TeamModel: vi.fn(function () {
    return { listWorkflowStates: mocks.listWorkflowStates };
  }),
}));

const runningTask = (overrides: Partial<TaskItem> = {}): TaskItem =>
  ({
    automationMode: null,
    config: {},
    context: {},
    id: 'task-1',
    identifier: 'TASK-1',
    status: 'running',
    workflowCategory: 'in_progress',
    ...overrides,
  }) as unknown as TaskItem;

const db = {} as never;
const settle = (input: Omit<SettleTaskExecutionInput, 'taskId'> & { taskId?: string }) =>
  settleTaskExecution(db, 'user-1', { ...input, taskId: input.taskId ?? 'task-1' });

const noWrites = () => {
  expect(mocks.updateStatus).not.toHaveBeenCalled();
  expect(mocks.updateStatusForExecutionContract).not.toHaveBeenCalled();
  expect(mocks.updateStatusIfCurrent).not.toHaveBeenCalled();
  expect(mocks.updateStatusIfReservation).not.toHaveBeenCalled();
};

describe('settleTaskExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(runningTask());
    mocks.hasUnresolvedInput.mockResolvedValue(false);
    mocks.findByOperationId.mockResolvedValue({ runState: 'running', status: 'running' });
    mocks.findByTopicId.mockResolvedValue({ dispatchFence: null, executionGeneration: null });
    mocks.listWorkflowStates.mockResolvedValue([]);
    mocks.resolveTaskReviewRequirement.mockResolvedValue(false);
    for (const key of [
      'updateStatus',
      'updateStatusForExecutionContract',
      'updateStatusIfCurrent',
      'updateStatusIfReservation',
    ] as const) {
      mocks[key].mockImplementation(async (id: string) => ({ id }));
    }
  });

  it('root task, requireHumanReview=false, no checkpoint, run succeeds → done/succeeded/none', async () => {
    const result = await settle({ outcome: 'succeeded' });

    expect(result).toMatchObject({
      applied: true,
      attention: 'none',
      decision: { type: 'complete' },
      execution: 'succeeded',
      workflowCategory: 'done',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'completed',
      expect.objectContaining({ workflowCategory: 'done' }),
    );
  });

  it('keeps a terminal run with unanswered input open and persists its parked reason', async () => {
    mocks.hasUnresolvedInput.mockResolvedValue(true);
    const result = await settle({ operationId: 'op-question', outcome: 'succeeded' });
    expect(result).toMatchObject({
      applied: true,
      attention: 'needs_input',
      legacyStatus: 'paused',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({
        parkedReason: 'needs_input',
        workflowCategory: 'in_progress',
      }),
    );
  });

  it('requireHumanReview=true + success → in_review/succeeded/review_required', async () => {
    mocks.resolveTaskReviewRequirement.mockResolvedValue(true);

    const result = await settle({ outcome: 'succeeded' });

    expect(result).toMatchObject({
      applied: true,
      attention: 'review_required',
      decision: { type: 'review' },
      execution: 'succeeded',
      workflowCategory: 'in_review',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({ workflowCategory: 'in_review' }),
    );
  });

  it.each([{ completionRequestedByOperation: true }, { runTrigger: 'goal' as const }])(
    'keeps successful completion intent behind required human review: %j',
    async (context) => {
      mocks.resolveTaskReviewRequirement.mockResolvedValue(true);

      const result = await settle({ context, outcome: 'succeeded' });

      expect(result).toMatchObject({
        applied: true,
        attention: 'review_required',
        decision: { type: 'review' },
        workflowCategory: 'in_review',
      });
    },
  );

  it('agent waiting → workflow stays in_progress, execution=waiting, attention=needs_input', async () => {
    const result = await settle({ outcome: 'waiting_for_input' });

    expect(result).toMatchObject({
      applied: true,
      attention: 'needs_input',
      execution: 'waiting',
      workflowCategory: 'in_progress',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'running',
      expect.objectContaining({ workflowCategory: 'in_progress' }),
    );
  });

  it('run failed → workflow stays in_progress, execution=failed, attention=execution_failed', async () => {
    const result = await settle({ outcome: 'failed' });

    expect(result).toMatchObject({
      applied: true,
      attention: 'execution_failed',
      decision: { type: 'keep_open' },
      execution: 'failed',
      workflowCategory: 'in_progress',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({ workflowCategory: 'in_progress' }),
    );
  });

  it('verify passed → done/succeeded/none', async () => {
    const result = await settle({ verifyOutcome: 'passed' });

    expect(result).toMatchObject({
      applied: true,
      attention: 'none',
      decision: { type: 'complete' },
      execution: 'succeeded',
      workflowCategory: 'done',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'completed',
      expect.objectContaining({ workflowCategory: 'done' }),
    );
  });

  it('verify failed + auto repair → in_progress + queued execution', async () => {
    const result = await settle({
      context: { repairSpawned: true },
      verifyOutcome: 'failed',
    });

    expect(result).toMatchObject({
      applied: true,
      attention: 'needs_changes',
      decision: { type: 'retry' },
      execution: 'queued',
      workflowCategory: 'in_progress',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'running',
      expect.objectContaining({ workflowCategory: 'in_progress' }),
    );
  });

  it('verify failed without repair → in_review + needs_changes', async () => {
    const result = await settle({ verifyOutcome: 'failed' });

    expect(result).toMatchObject({
      applied: true,
      attention: 'needs_changes',
      decision: { type: 'review' },
      execution: 'succeeded',
      workflowCategory: 'in_review',
    });
  });

  it('stale-generation settle is a no-op (fence via task_topics generation)', async () => {
    mocks.findById.mockResolvedValue(runningTask({ currentTopicId: 'topic-1' }));
    mocks.findByTopicId.mockResolvedValue({ dispatchFence: 9, executionGeneration: 5 });

    const result = await settle({ dispatchFence: 4, executionGeneration: 3, outcome: 'succeeded' });

    expect(result).toMatchObject({ applied: false, skippedReason: 'stale_generation' });
    noWrites();
  });

  it('uses the immutable contract and completion lease when a completed dispatch projects backlog', async () => {
    mocks.findById.mockResolvedValue(runningTask({ status: 'backlog' }));
    mocks.resolveTaskReviewRequirement.mockResolvedValue(true);
    const contract = {
      assigneeAgentId: 'agent-1',
      executionGeneration: 1,
      policyRevision: 1,
      requirementRevision: 2,
    };
    const result = await settle({
      outcome: 'succeeded',
      context: { expectedContract: contract, reservationId: 'completion:op-1' },
    });
    expect(result).toMatchObject({ applied: true, workflowCategory: 'in_review' });
    expect(mocks.updateStatusForExecutionContract).toHaveBeenCalledWith(
      'task-1',
      'paused',
      { ...contract, runReservationId: 'completion:op-1' },
      expect.objectContaining({ workflowCategory: 'in_review' }),
    );
  });

  it('does not treat the current failed dispatch projection as a completed business issue', async () => {
    mocks.findById.mockResolvedValue(runningTask({ status: 'failed' }));
    const result = await settle({
      outcome: 'failed',
      context: {
        expectedContract: {
          assigneeAgentId: 'agent-1',
          executionGeneration: 1,
          policyRevision: 1,
          requirementRevision: 2,
        },
      },
    });
    expect(result).toMatchObject({
      applied: true,
      attention: 'execution_failed',
      workflowCategory: 'in_progress',
    });
  });

  it('a superseded immutable contract declines the review write', async () => {
    mocks.updateStatusForExecutionContract.mockResolvedValue(null);
    mocks.resolveTaskReviewRequirement.mockResolvedValue(true);
    const result = await settle({
      outcome: 'succeeded',
      context: {
        expectedContract: {
          assigneeAgentId: 'agent-1',
          executionGeneration: 1,
          policyRevision: 1,
          requirementRevision: 2,
        },
        reservationId: 'completion:op-1',
      },
    });
    expect(result).toMatchObject({ applied: false, skippedReason: 'stale_generation' });
    expect(mocks.updateStatusIfReservation).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it('settle on a canceled task is a no-op', async () => {
    mocks.findById.mockResolvedValue(
      runningTask({ status: 'canceled', workflowCategory: 'canceled' }),
    );

    const result = await settle({ outcome: 'succeeded' });

    expect(result).toMatchObject({ applied: false, skippedReason: 'terminal' });
    noWrites();
  });

  it('settlement is idempotent: the same outcome applied twice lands once', async () => {
    const first = await settle({ outcome: 'succeeded' });
    expect(first.applied).toBe(true);

    // The task row now carries the settled state — a replayed settle holds.
    mocks.findById.mockResolvedValue(
      runningTask({ status: 'completed', workflowCategory: 'done' }),
    );
    const second = await settle({ outcome: 'succeeded' });

    expect(second).toMatchObject({ applied: false, skippedReason: 'terminal' });
    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
  });
});
