// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskIntegrationService } from '@/server/services/taskIntegration';

import { processTaskCancellation } from './index';

const dispatchModel = {
  claimCancellation: vi.fn(),
  retryCancellation: vi.fn(),
  settleCancellation: vi.fn(),
};
const interruptTask = vi.fn();
const cleanupTaskWorktrees = vi.fn();

vi.mock('@/database/models/taskDispatch', () => ({ TaskDispatchModel: vi.fn() }));
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: vi.fn() }));
vi.mock('@/server/services/taskIntegration', () => ({ TaskIntegrationService: vi.fn() }));

const claim = () => ({
  dispatch: {
    fence: 3,
    generation: 2,
    id: 'dispatch-1',
    operationId: 'operation-1',
    taskId: 'task-1',
  },
  fence: 3,
  topic: {
    operationId: 'operation-1',
    taskId: 'task-1',
    topicId: 'topic-1',
    userId: 'user-1',
  },
});

describe('processTaskCancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (TaskDispatchModel as any).mockImplementation(function () {
      return dispatchModel;
    });
    (AiAgentService as any).mockImplementation(function () {
      return { interruptTask };
    });
    (TaskIntegrationService as any).mockImplementation(function () {
      return { cleanupTaskWorktrees };
    });
    dispatchModel.claimCancellation.mockResolvedValue(claim());
    dispatchModel.retryCancellation.mockResolvedValue(true);
    dispatchModel.settleCancellation.mockResolvedValue({
      currentGeneration: true,
      dispatch: { phase: 'canceled' },
      topicId: 'topic-1',
    });
    cleanupTaskWorktrees.mockResolvedValue(undefined);
  });

  it('settles local state only after the runtime confirms interruption', async () => {
    interruptTask.mockResolvedValue({ deviceCancellationConfirmed: true, success: true });

    await expect(
      processTaskCancellation({
        db: {} as never,
        dispatchId: 'dispatch-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toEqual({ dispatchId: 'dispatch-1', outcome: 'canceled', taskId: 'task-1' });

    expect(interruptTask).toHaveBeenCalledWith({
      operationId: 'operation-1',
      topicId: 'topic-1',
    });
    expect(dispatchModel.settleCancellation).toHaveBeenCalledOnce();
    expect(dispatchModel.retryCancellation).not.toHaveBeenCalled();
  });

  it('keeps the durable stop intent active when device cancellation is unconfirmed', async () => {
    interruptTask.mockResolvedValue({ deviceCancellationConfirmed: false, success: true });

    const outcome = await processTaskCancellation({
      db: {} as never,
      dispatchId: 'dispatch-1',
      retryMs: 1234,
      workspaceId: 'workspace-1',
    });

    expect(outcome).toMatchObject({ outcome: 'retry' });
    expect(dispatchModel.settleCancellation).not.toHaveBeenCalled();
    expect(dispatchModel.retryCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchId: 'dispatch-1',
        fence: 3,
        retryAfterMs: 1234,
      }),
    );
  });

  it('replays the same operation identity after response loss before settlement', async () => {
    interruptTask.mockResolvedValue({ deviceCancellationConfirmed: true, success: true });
    dispatchModel.settleCancellation
      .mockRejectedValueOnce(new Error('database connection lost'))
      .mockResolvedValueOnce({
        currentGeneration: true,
        dispatch: { phase: 'canceled' },
        topicId: 'topic-1',
      });

    await expect(
      processTaskCancellation({
        db: {} as never,
        dispatchId: 'dispatch-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({ outcome: 'retry' });
    await expect(
      processTaskCancellation({
        db: {} as never,
        dispatchId: 'dispatch-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({ outcome: 'canceled' });

    expect(interruptTask).toHaveBeenCalledTimes(2);
    expect(interruptTask).toHaveBeenNthCalledWith(1, {
      operationId: 'operation-1',
      topicId: 'topic-1',
    });
    expect(interruptTask).toHaveBeenNthCalledWith(2, {
      operationId: 'operation-1',
      topicId: 'topic-1',
    });
  });
});
