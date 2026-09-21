// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncModel } from '@/database/models/linearSync';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';

import { processPlanningTaskDispatchStart, sweepPlanningTaskDispatchStarts } from './index';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  isCaidDispatchAllowed: vi.fn(),
  findPlanningRevisionByInputRevision: vi.fn(),
  findPlanningStartCandidates: vi.fn(),
  markWaiting: vi.fn(),
  runTask: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: vi.fn(function () {
    return { findPlanningRevisionByInputRevision: mocks.findPlanningRevisionByInputRevision };
  }),
}));
vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: Object.assign(
    vi.fn(function () {
      return { findById: mocks.findById, markWaiting: mocks.markWaiting };
    }),
    { findPlanningStartCandidates: mocks.findPlanningStartCandidates },
  ),
}));
vi.mock('@/server/featureFlags/caidAdmission', () => ({
  isCaidDispatchAllowed: mocks.isCaidDispatchAllowed,
}));
vi.mock('@/server/services/taskRunner', () => ({
  TaskRunnerService: vi.fn(function () {
    return { runTask: mocks.runTask };
  }),
}));

const candidate = {
  dispatchId: 'dispatch-1',
  idempotencyKey: 'planning:revision-1:resume:task-1',
  planRevision: 42,
  requestedBy: 'orchestrator:planning:revision-1',
  taskId: 'task-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
};

describe('planned task dispatch start recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPlanningRevisionByInputRevision.mockResolvedValue({
      proposal: {
        actions: [
          {
            action: 'request_resume',
            instruction: 'Resume from the durable plan.',
            reason: 'The task is ready.',
            taskId: 'task-1',
          },
        ],
        explanation: 'Resume one ready task.',
        requiresApproval: false,
      },
      status: 'applied',
    });
    mocks.runTask.mockResolvedValue({ success: true });
    mocks.isCaidDispatchAllowed.mockResolvedValue(true);
  });

  it('replays the exact planner command through the ordinary runner', async () => {
    await expect(processPlanningTaskDispatchStart({ candidate, db: {} as never })).resolves.toEqual(
      { dispatchId: 'dispatch-1', outcome: 'started' },
    );

    expect(LinearSyncModel).toHaveBeenCalledWith({}, 'workspace-1');
    expect(TaskRunnerService).toHaveBeenCalledWith({}, 'user-1', 'workspace-1');
    expect(mocks.runTask).toHaveBeenCalledWith({
      extraPrompt: 'Resume from the durable plan.',
      idempotencyKey: candidate.idempotencyKey,
      planRevision: 42,
      requestedBy: candidate.requestedBy,
      taskId: 'task-1',
      trigger: 'orchestrator',
    });
  });

  it('parks an intent whose persisted planning instruction is unavailable', async () => {
    mocks.findPlanningRevisionByInputRevision.mockResolvedValue(null);
    mocks.markWaiting.mockResolvedValue({ phase: 'waiting' });

    await expect(processPlanningTaskDispatchStart({ candidate, db: {} as never })).resolves.toEqual(
      {
        dispatchId: 'dispatch-1',
        outcome: 'waiting',
        reason: 'planning_resume_instruction_missing',
      },
    );
    expect(mocks.markWaiting).toHaveBeenCalledWith(
      'dispatch-1',
      'planning_resume_instruction_missing',
    );
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('defers a new orchestrated dispatch while CAID admission is off (R10)', async () => {
    mocks.isCaidDispatchAllowed.mockResolvedValue(false);

    await expect(processPlanningTaskDispatchStart({ candidate, db: {} as never })).resolves.toEqual(
      {
        dispatchId: 'dispatch-1',
        outcome: 'waiting',
        reason: 'caid_dispatch_disabled',
      },
    );

    // The row stays 'requested' — no markWaiting — so the same sweep re-drives
    // it the moment the rollout flag flips back on.
    expect(mocks.markWaiting).not.toHaveBeenCalled();
    expect(mocks.runTask).not.toHaveBeenCalled();
    expect(mocks.isCaidDispatchAllowed).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });
  });

  it('leaves a transient pre-claim failure requested for the next sweep', async () => {
    mocks.runTask.mockRejectedValue(new Error('temporary database failure'));
    mocks.findById.mockResolvedValue({ phase: 'requested' });

    await expect(processPlanningTaskDispatchStart({ candidate, db: {} as never })).resolves.toEqual(
      {
        dispatchId: 'dispatch-1',
        outcome: 'retry',
        reason: 'temporary database failure',
      },
    );
  });

  it('sweeps committed planner intents independently', async () => {
    mocks.findPlanningStartCandidates.mockResolvedValue([candidate]);

    await expect(sweepPlanningTaskDispatchStarts({ db: {} as never, limit: 1 })).resolves.toEqual([
      { dispatchId: 'dispatch-1', outcome: 'started' },
    ]);
    expect(TaskDispatchModel.findPlanningStartCandidates).toHaveBeenCalledWith({}, { limit: 1 });
  });
});
