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
  runTask: vi.fn(),
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { areAllDependenciesCompleted: mocks.areAllDependenciesCompleted };
  }),
}));
vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: Object.assign(vi.fn(), {
    findBacklogIntakeCandidates: mocks.findBacklogIntakeCandidates,
  }),
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
  createdBySubjectId: null,
  createdByUserId: 'user-1',
  executionGeneration: 4,
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
    mocks.runTask.mockResolvedValue({ dispatchId: 'dispatch-1' });
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
});
