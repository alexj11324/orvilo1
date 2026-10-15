import { DeviceTransportErrorCode } from '@orvilo/device-gateway-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentOperationItem } from '@/database/schemas/agentOperations';

import type { DeviceQueue, DeviceQueuePayload } from './deviceQueue';
import {
  cancelQueuedDeviceOperation,
  deviceQueueExpired,
  isDefinitiveDeviceOffline,
  queueOfflineDeviceRun,
  readDeviceQueue,
  sweepQueuedDeviceOperations,
} from './deviceQueue';

const {
  rows,
  dispatch,
  presence,
  complete,
  authorize,
  sign,
  end,
  decision,
  reviewer,
  runDecision,
  composePrime,
  issueTask,
  repairCurrent,
  savedAgentConfig,
} = vi.hoisted(() => ({
  rows: new Map<string, AgentOperationItem>(),
  dispatch: vi.fn(),
  presence: vi.fn(),
  complete: vi.fn(),
  authorize: vi.fn(),
  sign: vi.fn(),
  end: vi.fn(),
  decision: vi.fn(),
  reviewer: vi.fn(),
  runDecision: vi.fn(),
  composePrime: vi.fn(),
  issueTask: vi.fn(),
  repairCurrent: vi.fn(),
  savedAgentConfig: vi.fn(),
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getAgentConfigForExecution = savedAgentConfig;
  },
}));
vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: class {
    async findById(id: string) {
      return rows.get(id);
    }
    async parkForDevice(id: string, queue: DeviceQueue, observed?: DeviceQueue) {
      const row = rows.get(id);
      if (!row || !['running', 'idle'].includes(row.status)) return false;
      if (
        observed &&
        (row.status !== 'idle' ||
          JSON.stringify(row.metadata?.deviceQueue) !== JSON.stringify(observed))
      )
        return false;
      row.status = 'idle';
      row.metadata = { ...row.metadata, deviceQueue: queue };
      return true;
    }
    async claimDeviceQueue(id: string) {
      const row = rows.get(id);
      if (row?.status !== 'idle') return;
      row.status = 'running';
      row.metadata!.deviceQueue = {
        ...(row.metadata!.deviceQueue as DeviceQueue),
        state: 'launching',
      };
      return row;
    }
    async cancelDeviceQueue(id: string) {
      const row = rows.get(id);
      if (row?.status !== 'idle') return false;
      row.status = 'interrupted';
      return true;
    }
    async settleDeviceQueue(id: string, status: 'error', error: AgentOperationItem['error']) {
      const row = rows.get(id);
      if (row?.status !== 'idle') return false;
      row.status = status;
      row.error = error;
      return true;
    }
    async clearDeviceQueue(id: string) {
      const row = rows.get(id);
      if (row?.metadata) delete row.metadata.deviceQueue;
    }
    async recordCompletion(id: string, { status }: { status: 'interrupted' }) {
      const row = rows.get(id);
      if (row) row.status = status;
      return true;
    }
  },
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: class {
    findById = issueTask;
    isIssueReviewRepairCurrent = repairCurrent;
  },
}));
vi.mock('@/server/services/task/review', () => ({
  readIssueReview: (task: { config?: { issueReview?: unknown } }) => task.config?.issueReview,
}));
vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: class {
    findByOperation = async () => ({ userDecision: runDecision() });
  },
}));
vi.mock('@/server/services/verify/reviewerAgent', () => ({ resolveIssueReviewer: reviewer }));
vi.mock('@/database/models/message', () => ({ MessageModel: class {} }));
vi.mock('@/database/models/topic', () => ({
  TopicModel: class {
    async settleRunningOperation() {}
  },
}));
vi.mock('@/libs/trpc/utils/internalJwt', () => ({ signHeteroOperationJWT: sign }));
vi.mock('@/server/modules/AgentExecution/factory', () => ({
  createStreamEventManager: () => ({ publishAgentRuntimeEnd: end }),
}));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: vi.fn(),
}));
vi.mock('@/server/services/agentExecution/CompletionLifecycle', () => ({
  CompletionLifecycle: class {
    completeOperation = complete;
  },
}));
vi.mock('@/server/services/controlPlane/devicePrimeDispatch', () => ({
  composeDevicePrimeRun: composePrime,
}));
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { dispatchAgentRun: dispatch, queryDevicePresence: presence },
}));
vi.mock('@/server/services/deviceGateway/dispatchAuthorization', () => ({
  resolveDeviceDispatchAuthorizationFailure: authorize,
}));
vi.mock('@/server/services/file/resolveAttachments', () => ({
  resolveAttachmentsByFileIds: vi.fn(async () => ({
    imageList: [{ id: 'image-1', url: 'fresh-url' }],
  })),
}));
vi.mock('./pipeline/heteroDispatch', () => ({
  finalizeHeteroDispatchError: vi.fn(),
  settleRemoteDispatchOutcome: vi.fn(async (_deps, result) => ({
    outcome: result.success ? 'acknowledged' : 'unknown',
    admissionState: result.success ? 'acknowledged' : 'unknown',
  })),
}));

const db = {
  select: (columns?: unknown) => ({
    from: () => ({
      where: () => ({
        limit: async () =>
          columns
            ? [{ userDecision: decision() }]
            : [...rows.values()]
                .filter(
                  (row) =>
                    ['idle', 'error', 'interrupted'].includes(row.status) &&
                    row.metadata?.deviceQueue,
                )
                .map((row) => structuredClone(row)),
      }),
    }),
  }),
  update: () => ({ set: () => ({ where: async () => [] }) }),
} as never;
const payload: DeviceQueuePayload = {
  agentId: 'agent',
  agentType: 'opencode',
  assistantMessageId: 'assistant',
  channel: 'agent_run_request',
  deviceId: 'saved-device',
  imageFileIds: ['image-1'],
  prompt: 'Review the original deliverable',
  systemContext: 'Original context',
  topicId: 'topic',
  userMessageId: 'user-message',
};
const hooks = [
  {
    id: 'completion-notification',
    type: 'onComplete',
    webhook: {
      body: { checkItemId: 'check', parentOperationId: 'parent' },
      url: '/api/workflows/notify/on-complete',
    },
  },
];

describe('ordinary offline device queue', () => {
  beforeEach(() => {
    rows.clear();
    vi.clearAllMocks();
    rows.set('original-op', {
      id: 'original-op',
      userId: 'user',
      agentId: 'agent',
      status: 'running',
      topicId: 'topic',
      metadata: { _hooks: hooks },
    } as unknown as AgentOperationItem);
    authorize.mockResolvedValue(undefined);
    presence.mockResolvedValue(true);
    dispatch.mockResolvedValue({ success: true });
    sign.mockResolvedValue('fresh-secret');
    complete.mockResolvedValue(undefined);
    end.mockResolvedValue(undefined);
    decision.mockReturnValue(null);
    runDecision.mockReturnValue(null);
    reviewer.mockResolvedValue('agent');
    savedAgentConfig.mockResolvedValue(undefined);
    rows.set('parent', { id: 'parent', taskId: 'task', userId: 'user' } as AgentOperationItem);
  });

  it('resumes the original ordinary/verifier operation with its prompt, device, hooks, and fresh authorization', async () => {
    expect(await queueOfflineDeviceRun(db, 'user', 'original-op', payload)).toBe(true);
    const stored = rows.get('original-op')!;
    expect(stored.status).toBe('idle');
    expect(readDeviceQueue(stored.metadata)?.verifyCheck).toBeUndefined();
    expect(JSON.stringify(stored.metadata)).not.toContain('fresh-secret');
    await Promise.all([sweepQueuedDeviceOperations({ db }), sweepQueuedDeviceOperations({ db })]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'original-op',
        operationId: 'original-op',
        deviceId: 'saved-device',
        prompt: payload.prompt,
        systemContext: payload.systemContext,
        jwt: 'fresh-secret',
        imageList: [{ id: 'image-1', url: 'fresh-url' }],
      }),
    );
    expect(rows.size).toBe(2);
    expect(stored.metadata?._hooks).toEqual(hooks);
    expect(stored.metadata?.deviceQueue).toBeUndefined();
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    [9, 20, false],
    [20, 9, false],
    [20, 20, true],
  ])(
    'expires only both queue and observed silence windows (%i, %i)',
    (queueAge, offlineAge, expired) => {
      const now = 30_000;
      expect(
        deviceQueueExpired(
          {
            payload,
            queuedAt: new Date(now - queueAge * 1000).toISOString(),
            offlineSince: new Date(now - offlineAge * 1000).toISOString(),
            state: 'waiting',
          },
          now,
          10_000,
        ),
      ).toBe(expired);
    },
  );

  it('rehydrates current saved Agent env at reconnect without storing it in the queue', async () => {
    savedAgentConfig.mockResolvedValue({
      agencyConfig: {
        heterogeneousProvider: { type: 'opencode', env: { XDG_DATA_HOME: '/marker-before-queue' } },
      },
    });
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    const queued = JSON.stringify(readDeviceQueue(rows.get('original-op')?.metadata));
    expect(queued).not.toContain('XDG_DATA_HOME');
    expect(queued).not.toContain('/marker-before-queue');
    savedAgentConfig.mockResolvedValue({
      agencyConfig: {
        heterogeneousProvider: {
          type: 'opencode',
          env: {
            XDG_DATA_HOME: '/marker-at-reconnect',
            ORVILO_AGENT_ID: 'must-not-replace-source-agent',
          },
        },
      },
    });
    await sweepQueuedDeviceOperations({ db });
    expect(dispatch.mock.calls[0][0].env).toMatchObject({
      XDG_DATA_HOME: '/marker-at-reconnect',
      ORVILO_AGENT_ID: 'agent',
    });
    expect(JSON.stringify(rows.get('original-op')?.metadata)).not.toContain('/marker-at-reconnect');
  });

  it('does not turn a failed presence read into an offline expiry', async () => {
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    presence.mockRejectedValue(new Error('gateway unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await sweepQueuedDeviceOperations({ db, now: Date.now() + 60_000, graceMs: 1 });
    error.mockRestore();
    expect(rows.get('original-op')?.status).toBe('idle');
    expect(dispatch).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    presence.mockResolvedValue(false);
    const observedAt = Date.parse(readDeviceQueue(rows.get('original-op')?.metadata)!.offlineSince);
    await sweepQueuedDeviceOperations({ db, now: observedAt + 500, graceMs: 1000 });
    expect(rows.get('original-op')?.status).toBe('idle');
  });

  it('fails with the offline reason after both confirmed grace windows', async () => {
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    presence.mockResolvedValue(false);
    await sweepQueuedDeviceOperations({ db, now: Date.now() + 60_000, graceMs: 1 });
    expect(rows.get('original-op')?.status).toBe('error');
    expect(rows.get('original-op')?.error?.message).toContain('offline');
    expect(dispatch).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('never launches a queued run canceled by a person or an accepted check', async () => {
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    expect(await cancelQueuedDeviceOperation(db, 'user', 'original-op')).toBe(true);
    await sweepQueuedDeviceOperations({ db });
    expect(dispatch).not.toHaveBeenCalled();
    expect(rows.get('original-op')?.status).toBe('interrupted');
  });

  it('never replays a persisted legacy Verify check after reconnect', async () => {
    const operation = rows.get('original-op')!;
    operation.metadata = { _hooks: [{ ...hooks[0], id: 'reviewer-terminal' }] };
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    expect(readDeviceQueue(operation.metadata)?.verifyCheck).toEqual({
      checkItemId: 'check',
      parentOperationId: 'parent',
    });
    await sweepQueuedDeviceOperations({ db });
    expect(dispatch).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(rows.get('original-op')?.status).toBe('interrupted');
  });

  it.each(['cycle changed', 'reviewer changed', 'manual status changed'])(
    'does not launch an Issue review when %s',
    async (change) => {
      const operation = rows.get('original-op')!;
      operation.taskId = 'task';
      operation.appContext = { issueReviewCycleId: 'cycle' };
      operation.metadata = {};
      issueTask.mockResolvedValue({
        workflowCategory: change === 'manual status changed' ? 'in_progress' : 'in_review',
        reviewerAgentId: change === 'reviewer changed' ? 'replacement' : 'agent',
        config: {
          issueReview: {
            cycleId: change === 'cycle changed' ? 'new-cycle' : 'cycle',
            reviewerOperationId: 'original-op',
          },
        },
      });
      await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
      await sweepQueuedDeviceOperations({ db });
      expect(dispatch).not.toHaveBeenCalled();
      expect(operation.status).toBe('interrupted');
    },
  );

  it('fences an invalidated automatic repair before reconnect launch', async () => {
    const operation = rows.get('original-op')!;
    operation.taskId = 'task';
    operation.appContext = { issueReviewRepairCycleId: 'cycle' };
    operation.metadata = {};
    repairCurrent.mockResolvedValue(false);
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    await sweepQueuedDeviceOperations({ db });
    expect(dispatch).not.toHaveBeenCalled();
    expect(operation.status).toBe('interrupted');
  });

  it('retains the Prime registration when reconnect dispatch returns offline again', async () => {
    const primePayload = {
      ...payload,
      agentType: 'orvilo' as const,
    };
    const binding = { operationId: 'original-op', runtimeRegistrationId: 'original-registration' };
    composePrime.mockResolvedValue({ ok: true, value: { binding, descriptor: { version: 1 } } });
    await queueOfflineDeviceRun(db, 'user', 'original-op', primePayload);
    dispatch.mockResolvedValueOnce({
      success: false,
      errorCode: DeviceTransportErrorCode.DeviceNotFound,
    });
    await sweepQueuedDeviceOperations({ db });
    expect(readDeviceQueue(rows.get('original-op')?.metadata)?.payload.primeRegistration).toEqual(
      binding,
    );
    await sweepQueuedDeviceOperations({ db });
    expect(composePrime.mock.calls[1][1].queuedRegistration).toEqual(binding);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('does not let a failed presence observation replace a concurrent launch claim', async () => {
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    presence.mockImplementationOnce(async () => {
      const row = rows.get('original-op')!;
      row.status = 'running';
      row.metadata!.deviceQueue = {
        ...(row.metadata!.deviceQueue as DeviceQueue),
        state: 'launching',
      };
      throw new Error('Gateway unavailable');
    });
    await sweepQueuedDeviceOperations({ db });
    expect(rows.get('original-op')?.status).toBe('running');
    expect(readDeviceQueue(rows.get('original-op')?.metadata)?.state).toBe('launching');
  });

  it('keeps a lost acknowledgement out of reconnect replay', async () => {
    expect(
      isDefinitiveDeviceOffline({
        success: false,
        errorCode: DeviceTransportErrorCode.DeviceResponseTimeout,
      }),
    ).toBe(false);
    await queueOfflineDeviceRun(db, 'user', 'original-op', payload);
    dispatch.mockResolvedValue({
      success: false,
      errorCode: DeviceTransportErrorCode.DeviceResponseTimeout,
    });
    await sweepQueuedDeviceOperations({ db });
    await sweepQueuedDeviceOperations({ db });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(rows.get('original-op')?.status).toBe('running');
    expect(rows.get('original-op')?.metadata?.deviceQueue).toBeUndefined();
    expect(complete).not.toHaveBeenCalled();
  });
});
