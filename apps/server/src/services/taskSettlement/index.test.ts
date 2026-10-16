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
  logWorkflowMove: vi.fn(),
  requestReviewerAssignment: vi.fn(),
  resolveTaskReviewRequirement: vi.fn(),
  updateStatus: vi.fn(),
  updateStatusForExecutionContract: vi.fn(),
  updateStatusIfCurrent: vi.fn(),
  updateStatusIfReservation: vi.fn(),
}));

vi.mock('../task/review', () => ({ startIssueReview: vi.fn() }));
vi.mock('../task/reviewerAssignment', () => ({
  requestReviewerAssignment: mocks.requestReviewerAssignment,
  isWaitingForReviewer: (task: TaskItem) =>
    task.workflowCategory === 'in_progress' &&
    task.parkedReason === 'review_required' &&
    !!task.error?.startsWith('Delivery is waiting for a reviewer Agent'),
  WAITING_FOR_REVIEWER: 'Delivery is waiting for a reviewer Agent',
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return {
      findById: mocks.findById,
      hasUnresolvedInput: mocks.hasUnresolvedInput,
      logWorkflowMove: mocks.logWorkflowMove,
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
    reviewerAgentId: 'reviewer-1',
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

  it('ordinary delivery with a reviewer enters review even without an explicit gate', async () => {
    const result = await settle({ outcome: 'succeeded' });
    expect(result).toMatchObject({
      applied: true,
      attention: 'review_required',
      execution: 'succeeded',
      workflowCategory: 'in_review',
    });
    expect(mocks.requestReviewerAssignment).not.toHaveBeenCalled();
  });
  it('ordinary delivery without a reviewer stays in progress and asks the Orchestrator', async () => {
    mocks.findById.mockResolvedValue(runningTask({ reviewerAgentId: null }));
    const result = await settle({ outcome: 'succeeded' });
    expect(result).toMatchObject({
      applied: true,
      workflowCategory: 'in_progress',
      attention: 'review_required',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({
        workflowCategory: 'in_progress',
        parkedReason: 'review_required',
        error: 'Delivery is waiting for a reviewer Agent',
      }),
    );
    expect(mocks.requestReviewerAssignment).toHaveBeenCalled();
  });
  it('preserves an unusable reviewer wait when the builder completion lands afterward', async () => {
    mocks.findById.mockResolvedValue(
      runningTask({
        parkedReason: 'review_required',
        error: 'Delivery is waiting for a reviewer Agent: cannot mount submitVerifyResult',
      }),
    );
    const result = await settle({ outcome: 'succeeded', context: { error: null } });
    expect(result).toMatchObject({ workflowCategory: 'in_progress', attention: 'review_required' });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({
        error: expect.stringContaining('cannot mount submitVerifyResult'),
      }),
    );
    expect(mocks.requestReviewerAssignment).not.toHaveBeenCalled();
  });
  it('records the settlement move in the Issue feed as the system, never as a person', async () => {
    const before = runningTask();
    const after = { id: 'task-1', workflowCategory: 'done' };
    mocks.findById.mockResolvedValue(before);
    mocks.updateStatus.mockResolvedValue(after);

    await settle({ outcome: 'succeeded' });

    expect(mocks.logWorkflowMove).toHaveBeenCalledTimes(1);
    expect(mocks.logWorkflowMove).toHaveBeenCalledWith('task-1', before, after, {});
  });

  it('still settles when the feed line cannot be written', async () => {
    mocks.logWorkflowMove.mockRejectedValueOnce(new Error('insert failed'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await settle({ outcome: 'succeeded' });

    expect(result).toMatchObject({ applied: true, workflowCategory: 'in_review' });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
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

  it('an automatic pass with the live reviewer cleared waits for Orchestrator assignment', async () => {
    mocks.findById.mockResolvedValue(runningTask({ reviewerAgentId: null }));
    const result = await settle({ verifyOutcome: 'passed' });
    expect(result).toMatchObject({
      applied: true,
      workflowCategory: 'in_progress',
      attention: 'review_required',
      decision: { type: 'review' },
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({ error: 'Delivery is waiting for a reviewer Agent' }),
    );
    expect(mocks.requestReviewerAssignment).toHaveBeenCalled();
  });
  it('an automatic pass preserves unanswered input instead of requesting reviewer assignment', async () => {
    mocks.findById.mockResolvedValue(runningTask({ reviewerAgentId: null }));
    mocks.hasUnresolvedInput.mockResolvedValue(true);
    const result = await settle({ verifyOutcome: 'passed' });
    expect(result).toMatchObject({
      applied: true,
      workflowCategory: 'in_progress',
      attention: 'needs_input',
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({ parkedReason: 'needs_input' }),
    );
    expect(mocks.requestReviewerAssignment).not.toHaveBeenCalled();
  });
  it('manual acceptance completes a delivery without a reviewer and never asks the Orchestrator', async () => {
    mocks.findById.mockResolvedValue(
      runningTask({
        reviewerAgentId: null,
        parkedReason: 'review_required',
        error: 'Delivery is waiting for a reviewer Agent',
      }),
    );
    const result = await settle({
      verifyOutcome: 'passed',
      context: { manualAcceptance: true, error: null },
    });
    expect(result).toMatchObject({
      applied: true,
      workflowCategory: 'done',
      attention: 'none',
      decision: { type: 'complete' },
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'task-1',
      'completed',
      expect.objectContaining({ workflowCategory: 'done', error: null }),
    );
    expect(mocks.requestReviewerAssignment).not.toHaveBeenCalled();
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
