// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskDispatchWaitingError } from '@/server/services/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';

import { sweepTaskBacklogIntake } from './index';

const mocks = vi.hoisted(() => ({
  areAllDependenciesCompleted: vi.fn(),
  findBacklogIntakeCandidates: vi.fn(),
  findLatestTerminalDispatch: vi.fn(),
  listProjectAgentRoster: vi.fn(),
  runTask: vi.fn(),
  updateWithLog: vi.fn(),
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return {
      areAllDependenciesCompleted: mocks.areAllDependenciesCompleted,
      updateWithLog: mocks.updateWithLog,
    };
  }),
}));
vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: Object.assign(vi.fn(), {
    findBacklogIntakeCandidates: mocks.findBacklogIntakeCandidates,
    findLatestTerminalDispatch: mocks.findLatestTerminalDispatch,
    listProjectAgentRoster: mocks.listProjectAgentRoster,
  }),
}));
vi.mock('@/database/models/project', () => ({
  normalizeProjectOrchestrationPolicy: (policy: unknown) => policy,
}));
vi.mock('@/server/services/taskRunner', () => ({
  TaskRunnerService: vi.fn(function () {
    return { runTask: mocks.runTask };
  }),
}));
vi.mock('@/server/services/taskDispatch', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    TaskDispatchService: vi.fn(),
  };
});

const candidate = (overrides: Record<string, unknown> = {}) => ({
  assigneeAgentId: 'agent-1',
  createdBySubjectId: null,
  createdByUserId: 'user-1',
  executionGeneration: 4,
  orchestrationPolicy: { autoDispatch: true, replanMode: 'disabled', requireHumanReview: false },
  priority: 0,
  projectId: 'project-1',
  taskId: 'task-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  ...overrides,
});

describe('sweepTaskBacklogIntake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.areAllDependenciesCompleted.mockResolvedValue(true);
    mocks.findLatestTerminalDispatch.mockResolvedValue(undefined);
    mocks.listProjectAgentRoster.mockResolvedValue([]);
    mocks.runTask.mockResolvedValue({ dispatchId: 'dispatch-1' });
    mocks.updateWithLog.mockResolvedValue({});
  });

  it('starts an opted-in backlog task under an orchestrator intake key', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([candidate()]);

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'started', taskId: 'task-1' },
    ]);

    expect(TaskModel).toHaveBeenCalledWith({}, 'user-1', 'workspace-1');
    expect(TaskRunnerService).toHaveBeenCalledWith({}, 'user-1', 'workspace-1');
    expect(mocks.runTask).toHaveBeenCalledWith({
      idempotencyKey: 'backlog-intake:task:task-1:generation:5',
      requestedBy: 'backlog_intake',
      taskId: 'task-1',
      trigger: 'orchestrator',
    });
  });

  it('skips a task whose dependencies are still incomplete without minting an intent', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([candidate()]);
    mocks.areAllDependenciesCompleted.mockResolvedValue(false);

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'blocked', reason: 'dependencies_incomplete', taskId: 'task-1' },
    ]);
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('keeps a policy-gated start parked at waiting for the resume sweep', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([candidate()]);
    // `runTask` wraps the held signal in PRECONDITION_FAILED with the typed
    // cause — the sweep must read it back off `error.cause`.
    mocks.runTask.mockRejectedValue(
      new TRPCError({
        cause: new TaskDispatchWaitingError('project_concurrency_limit', 'dispatch-1'),
        code: 'PRECONDITION_FAILED',
        message: 'project_concurrency_limit',
      }),
    );

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'waiting', reason: 'project_concurrency_limit', taskId: 'task-1' },
    ]);
  });

  it('does not treat a live-dispatch conflict as an error', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([candidate()]);
    mocks.runTask.mockRejectedValue(new TRPCError({ code: 'CONFLICT', message: 'busy' }));

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'blocked', reason: 'busy', taskId: 'task-1' },
    ]);
  });

  it('rebinds the assignee to the cheapest roster agent meeting the required tier', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([
      candidate({ assigneeAgentId: 'agent-cheap', priority: 3 }),
    ]);
    mocks.listProjectAgentRoster.mockResolvedValue([
      { agentId: 'agent-cheap', role: null, sortOrder: 0, tier: 'low' },
      { agentId: 'agent-mid', role: null, sortOrder: 1, tier: 'mid' },
      { agentId: 'agent-high', role: null, sortOrder: 2, tier: 'high' },
    ]);

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'started', taskId: 'task-1' },
    ]);
    // `mid` satisfies the normal-priority requirement; `high` also would but
    // costs more, so cheap-first wins.
    expect(mocks.updateWithLog).toHaveBeenCalledWith(
      'task-1',
      { assigneeAgentId: 'agent-mid' },
      {},
      { executionTransfer: true },
    );
    expect(mocks.runTask).toHaveBeenCalled();
  });

  it('escalates one band after a terminally failed orchestrated attempt', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([
      candidate({ assigneeAgentId: 'agent-cheap', priority: 4 }),
    ]);
    mocks.findLatestTerminalDispatch.mockResolvedValue({
      agentId: 'agent-cheap',
      generation: 3,
      phase: 'failed',
      requestedBy: 'orchestrator:backlog_intake',
      tier: 'low',
    });
    mocks.listProjectAgentRoster.mockResolvedValue([
      { agentId: 'agent-cheap', role: null, sortOrder: 0, tier: 'low' },
      { agentId: 'agent-mid', role: null, sortOrder: 1, tier: 'mid' },
    ]);

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'started', taskId: 'task-1' },
    ]);
    expect(mocks.updateWithLog).toHaveBeenCalledWith(
      'task-1',
      { assigneeAgentId: 'agent-mid' },
      {},
      { executionTransfer: true },
    );
  });

  it("keeps the task's assignee when no roster agent satisfies the required tier", async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([
      candidate({ assigneeAgentId: 'agent-cheap', priority: 1 }),
    ]);
    mocks.listProjectAgentRoster.mockResolvedValue([
      { agentId: 'agent-cheap', role: null, sortOrder: 0, tier: 'low' },
    ]);

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'started', taskId: 'task-1' },
    ]);
    // Graceful fallback — the run proceeds on the existing assignee path.
    expect(mocks.updateWithLog).not.toHaveBeenCalled();
    expect(mocks.runTask).toHaveBeenCalled();
  });

  it('does not escalate past the top band after a failed high-tier attempt', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([
      candidate({ assigneeAgentId: 'agent-high', priority: 4 }),
    ]);
    mocks.findLatestTerminalDispatch.mockResolvedValue({
      agentId: 'agent-high',
      generation: 2,
      phase: 'failed',
      requestedBy: 'orchestrator:backlog_intake',
      tier: 'high',
    });
    mocks.listProjectAgentRoster.mockResolvedValue([
      { agentId: 'agent-high', role: null, sortOrder: 0, tier: 'high' },
    ]);

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'started', taskId: 'task-1' },
    ]);
    // No unbounded escalation — the requirement falls back to the priority
    // baseline and the incumbent already satisfies it.
    expect(mocks.updateWithLog).not.toHaveBeenCalled();
  });

  it('surfaces the run-budget gate for an escalated attempt unchanged', async () => {
    mocks.findBacklogIntakeCandidates.mockResolvedValue([
      candidate({ assigneeAgentId: 'agent-mid', priority: 4 }),
    ]);
    mocks.findLatestTerminalDispatch.mockResolvedValue({
      agentId: 'agent-low',
      generation: 1,
      phase: 'failed',
      requestedBy: 'orchestrator:backlog_intake',
      tier: 'low',
    });
    mocks.listProjectAgentRoster.mockResolvedValue([
      { agentId: 'agent-mid', role: null, sortOrder: 0, tier: 'mid' },
    ]);
    mocks.runTask.mockRejectedValue(
      new TRPCError({
        cause: new TaskDispatchWaitingError('project_run_budget_exhausted', 'dispatch-1'),
        code: 'PRECONDITION_FAILED',
        message: 'project_run_budget_exhausted',
      }),
    );

    await expect(sweepTaskBacklogIntake({ db: {} as never })).resolves.toEqual([
      { outcome: 'waiting', reason: 'project_run_budget_exhausted', taskId: 'task-1' },
    ]);
  });
});
