// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskDispatchWaitingError } from '@/server/services/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';

import { processTaskDispatchResume, sweepTaskDispatchResume } from './index';

const mocks = vi.hoisted(() => ({
  claimForResume: vi.fn(),
  findStaleStartCandidates: vi.fn(),
  findWaitingResumeCandidates: vi.fn(),
  requestStop: vi.fn(),
  runTask: vi.fn(),
}));

vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: Object.assign(
    vi.fn(function () {
      return {
        claimForResume: mocks.claimForResume,
        requestStop: mocks.requestStop,
      };
    }),
    {
      findStaleStartCandidates: mocks.findStaleStartCandidates,
      findWaitingResumeCandidates: mocks.findWaitingResumeCandidates,
    },
  ),
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
  dispatchId: 'dispatch-1',
  fence: 2,
  generation: 3,
  idempotencyKey: 'manual:user-1:task-1',
  phase: 'requested' as const,
  planRevision: null,
  recoveryAttempts: 0,
  requestedBy: 'manual:user-1',
  taskId: 'task-1',
  userId: 'user-1',
  waitingReason: null,
  workspaceId: 'workspace-1',
  ...overrides,
});

describe('processTaskDispatchResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimForResume.mockResolvedValue({ dispatch: { id: 'dispatch-1' }, fence: 2 });
    mocks.requestStop.mockResolvedValue({ id: 'dispatch-1' });
    mocks.runTask.mockResolvedValue({ dispatchId: 'dispatch-1' });
  });

  it('re-drives a stranded requested intent under its stored key and trigger', async () => {
    await expect(
      processTaskDispatchResume({
        candidate: candidate({ requestedBy: 'orchestrator:correction-1' }),
        db: {} as never,
      }),
    ).resolves.toEqual({ dispatchId: 'dispatch-1', outcome: 'resumed' });

    expect(TaskRunnerService).toHaveBeenCalledWith({}, 'user-1', 'workspace-1');
    expect(mocks.runTask).toHaveBeenCalledWith({
      idempotencyKey: 'manual:user-1:task-1',
      planRevision: undefined,
      requestedBy: 'orchestrator:correction-1',
      taskId: 'task-1',
      trigger: 'orchestrator',
    });
    expect(mocks.requestStop).not.toHaveBeenCalled();
  });

  it('re-parks a still-gated waiting row without canceling the intent', async () => {
    // `runTask` wraps the held signal in PRECONDITION_FAILED with the typed
    // cause — the sweep must read it back off `error.cause`.
    mocks.runTask.mockRejectedValue(
      new TRPCError({
        cause: new TaskDispatchWaitingError('project_concurrency_limit', 'dispatch-1'),
        code: 'PRECONDITION_FAILED',
        message: 'project_concurrency_limit',
      }),
    );

    await expect(
      processTaskDispatchResume({
        candidate: candidate({
          phase: 'waiting' as never,
          waitingReason: 'project_concurrency_limit',
        }),
        db: {} as never,
      }),
    ).resolves.toMatchObject({ outcome: 'waiting' });
    expect(mocks.requestStop).not.toHaveBeenCalled();
  });

  it('skips when a concurrent claimant already owns the row', async () => {
    mocks.claimForResume.mockResolvedValue(null);

    await expect(
      processTaskDispatchResume({ candidate: candidate(), db: {} as never }),
    ).resolves.toEqual({
      dispatchId: 'dispatch-1',
      outcome: 'skipped',
      reason: 'claim_lost',
    });
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('skips when another live dispatch already owns the task', async () => {
    mocks.runTask.mockRejectedValue(new TRPCError({ code: 'CONFLICT', message: 'busy' }));

    await expect(
      processTaskDispatchResume({ candidate: candidate(), db: {} as never }),
    ).resolves.toMatchObject({ outcome: 'skipped', reason: 'busy' });
  });

  it('retries a failed re-drive instead of stopping the intent', async () => {
    mocks.runTask.mockRejectedValue(new Error('provisioner offline'));

    await expect(
      processTaskDispatchResume({ candidate: candidate(), db: {} as never }),
    ).resolves.toMatchObject({ outcome: 'retry' });
    expect(mocks.requestStop).not.toHaveBeenCalled();
  });

  it('stops the intent once the resume attempt bound is reached', async () => {
    await expect(
      processTaskDispatchResume({
        candidate: candidate({ recoveryAttempts: 20 }),
        db: {} as never,
      }),
    ).resolves.toEqual({
      dispatchId: 'dispatch-1',
      outcome: 'stopped',
      reason: 'resume_attempts_exhausted',
    });

    expect(mocks.requestStop).toHaveBeenCalledWith({
      dispatchId: 'dispatch-1',
      fence: 2,
      generation: 3,
      reason: 'resume_attempts_exhausted',
    });
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('stops intents whose trigger a sweep can never re-drive', async () => {
    await expect(
      processTaskDispatchResume({
        candidate: candidate({ requestedBy: 'event:trigger-1' }),
        db: {} as never,
      }),
    ).resolves.toEqual({
      dispatchId: 'dispatch-1',
      outcome: 'stopped',
      reason: 'resume_unsupported_trigger',
    });

    expect(mocks.requestStop).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'resume_unsupported_trigger' }),
    );
    expect(mocks.runTask).not.toHaveBeenCalled();
  });
});

describe('sweepTaskDispatchResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimForResume.mockResolvedValue({ dispatch: { id: 'dispatch-1' }, fence: 2 });
    mocks.runTask.mockResolvedValue({ dispatchId: 'dispatch-1' });
  });

  it('processes stale starts and parked waits in the same pass', async () => {
    mocks.findStaleStartCandidates.mockResolvedValue([candidate()]);
    mocks.findWaitingResumeCandidates.mockResolvedValue([
      candidate({ dispatchId: 'dispatch-2', phase: 'waiting' as never }),
    ]);

    await expect(sweepTaskDispatchResume({ db: {} as never })).resolves.toEqual([
      { dispatchId: 'dispatch-1', outcome: 'resumed' },
      { dispatchId: 'dispatch-2', outcome: 'resumed' },
    ]);
    expect(mocks.runTask).toHaveBeenCalledTimes(2);
  });
});
