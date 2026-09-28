// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskLifecycleService } from '@/server/services/taskLifecycle';

import { processTaskDispatchRecovery, sweepTaskDispatchRecovery } from './index';

const mocks = vi.hoisted(() => ({
  claimForRecovery: vi.fn(),
  findById: vi.fn(),
  findLatestAssistantByOperationId: vi.fn(),
  findRecoveryCandidates: vi.fn(),
  onTopicComplete: vi.fn(),
  releaseRecovery: vi.fn(),
  updateHeartbeat: vi.fn(),
}));

vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn(function () {
    return { findById: mocks.findById };
  }),
}));
vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn(function () {
    return { findLatestAssistantByOperationId: mocks.findLatestAssistantByOperationId };
  }),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { updateHeartbeat: mocks.updateHeartbeat };
  }),
}));
vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: Object.assign(
    vi.fn(function () {
      return {
        claimForRecovery: mocks.claimForRecovery,
        releaseRecovery: mocks.releaseRecovery,
      };
    }),
    { findRecoveryCandidates: mocks.findRecoveryCandidates },
  ),
}));
vi.mock('@/server/services/taskLifecycle', () => ({
  TaskLifecycleService: vi.fn(function () {
    return { onTopicComplete: mocks.onTopicComplete };
  }),
}));

const claim = () => ({
  dispatch: {
    fence: 4,
    generation: 3,
    id: 'dispatch-1',
    operationId: 'operation-1',
    taskId: 'task-1',
  },
  fence: 4,
  task: { id: 'task-1', identifier: 'TASK-1' },
  topic: {
    dispatchFence: 4,
    dispatchId: 'dispatch-1',
    executionGeneration: 3,
    operationId: 'operation-1',
    taskId: 'task-1',
    topicId: 'topic-1',
    trigger: 'orchestrator',
    userId: 'user-1',
  },
});

const operation = (status: string) => ({
  appContext: {
    dispatchFence: 4,
    dispatchId: 'dispatch-1',
    executionGeneration: 3,
  },
  id: 'operation-1',
  status,
  taskId: 'task-1',
  topicId: 'topic-1',
});

describe('task dispatch recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimForRecovery.mockResolvedValue(claim());
    mocks.findLatestAssistantByOperationId.mockResolvedValue({ content: 'Recovered result' });
    mocks.onTopicComplete.mockResolvedValue(undefined);
    mocks.releaseRecovery.mockResolvedValue(true);
    mocks.updateHeartbeat.mockResolvedValue(undefined);
  });

  it('replays a terminal lifecycle callback with the original stable identity', async () => {
    mocks.findById.mockResolvedValue(operation('done'));

    await expect(
      processTaskDispatchRecovery({
        db: {} as never,
        dispatchId: 'dispatch-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toEqual({
      dispatchId: 'dispatch-1',
      operationId: 'operation-1',
      outcome: 'settled',
    });

    expect(TaskLifecycleService).toHaveBeenCalledWith({}, 'user-1', 'workspace-1');
    expect(mocks.onTopicComplete).toHaveBeenCalledWith({
      dispatchFence: 4,
      dispatchId: 'dispatch-1',
      errorMessage: undefined,
      executionGeneration: 3,
      lastAssistantContent: 'Recovered result',
      operationId: 'operation-1',
      reason: 'done',
      runTrigger: 'orchestrator',
      taskId: 'task-1',
      taskIdentifier: 'TASK-1',
      topicId: 'topic-1',
    });
    expect(mocks.releaseRecovery).not.toHaveBeenCalled();
  });

  it('restores an existing running operation without starting another process', async () => {
    mocks.findById.mockResolvedValue(operation('waiting_for_async_tool'));

    await expect(
      processTaskDispatchRecovery({
        db: {} as never,
        dispatchId: 'dispatch-1',
        retryMs: 1234,
        workspaceId: 'workspace-1',
      }),
    ).resolves.toEqual({
      dispatchId: 'dispatch-1',
      operationId: 'operation-1',
      outcome: 'active',
    });

    expect(mocks.releaseRecovery).toHaveBeenCalledWith({
      dispatchId: 'dispatch-1',
      fence: 4,
      owner: expect.stringMatching(/^task-recovery:/),
      phase: 'running',
      reason: 'runtime_waiting_for_async_tool',
      retryAfterMs: 1234,
    });
    expect(mocks.updateHeartbeat).toHaveBeenCalledWith('task-1');
    expect(mocks.onTopicComplete).not.toHaveBeenCalled();
  });

  it('keeps an unknown outcome visible when the operation row is missing', async () => {
    mocks.findById.mockResolvedValue(null);

    await expect(
      processTaskDispatchRecovery({
        db: {} as never,
        dispatchId: 'dispatch-1',
        retryMs: 2222,
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({ outcome: 'retry', reason: 'operation_missing:operation-1' });

    expect(mocks.releaseRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'outcome_unknown',
        reason: 'operation_missing:operation-1',
        retryAfterMs: 2222,
      }),
    );
    expect(mocks.onTopicComplete).not.toHaveBeenCalled();
  });

  it('refuses to settle an operation whose persisted dispatch identity differs', async () => {
    mocks.findById.mockResolvedValue({
      ...operation('done'),
      appContext: { ...operation('done').appContext, dispatchFence: 99 },
    });

    await expect(
      processTaskDispatchRecovery({
        db: {} as never,
        dispatchId: 'dispatch-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({
      outcome: 'retry',
      reason: 'operation_identity_mismatch:operation-1',
    });
    expect(mocks.onTopicComplete).not.toHaveBeenCalled();
  });

  it('sweeps each expired candidate in its own workspace scope', async () => {
    mocks.findRecoveryCandidates.mockResolvedValue([
      { dispatchId: 'dispatch-1', workspaceId: 'workspace-1' },
      { dispatchId: 'dispatch-2', workspaceId: null },
    ]);
    mocks.claimForRecovery.mockResolvedValue(null);

    await expect(sweepTaskDispatchRecovery({ db: {} as never, limit: 2 })).resolves.toEqual([
      { dispatchId: 'dispatch-1', outcome: 'skipped' },
      { dispatchId: 'dispatch-2', outcome: 'skipped' },
    ]);
    expect(TaskDispatchModel).toHaveBeenNthCalledWith(1, {}, 'workspace-1');
    expect(TaskDispatchModel).toHaveBeenNthCalledWith(2, {}, undefined);
    expect(AgentOperationModel).not.toHaveBeenCalled();
    expect(MessageModel).not.toHaveBeenCalled();
    expect(TaskModel).not.toHaveBeenCalled();
  });
});
