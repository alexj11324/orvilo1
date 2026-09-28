import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onCreatorComplete } from './onCreatorComplete';

const { areDelivered, completeCreatorWakeup, getServerDB } = vi.hoisted(() => ({
  areDelivered: vi.fn(),
  completeCreatorWakeup: vi.fn(),
  getServerDB: vi.fn(),
}));

vi.mock('@/database/server', () => ({ getServerDB }));
vi.mock('@/server/services/taskResultBridge', () => ({
  TaskResultBridgeService: vi.fn(function () {
    return { completeCreatorWakeup };
  }),
}));
vi.mock('@/server/services/taskResultBridge/redisStore', () => ({
  TaskResultCallbackRedisStore: vi.fn(function () {
    return { areDelivered };
  }),
}));

const makeContext = (body: Record<string, unknown>) => {
  const json = vi.fn(function (payload, status = 200) {
    return { payload, status };
  });
  return {
    context: { json, req: { json: vi.fn().mockResolvedValue(body) } } as any,
    json,
  };
};

const payload = {
  agentId: 'agent-creator',
  operationId: 'op-creator',
  originTopicId: 'topic-origin',
  receiptIds: ['receipt-1'],
  userId: 'user-1',
};

describe('onCreatorComplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerDB.mockResolvedValue({});
    completeCreatorWakeup.mockResolvedValue(undefined);
    areDelivered.mockResolvedValue(false);
  });

  it('settles the callback receipt through the bridge', async () => {
    const { context } = makeContext(payload);

    const response = await onCreatorComplete(context);

    expect(response).toMatchObject({ status: 200 });
    expect(completeCreatorWakeup).toHaveBeenCalledWith({
      agentId: 'agent-creator',
      originTopicId: 'topic-origin',
      receiptIds: ['receipt-1'],
    });
  });

  it('rejects payloads missing required fields', async () => {
    const { context } = makeContext({ agentId: 'a' });

    const response = await onCreatorComplete(context);

    expect(response).toMatchObject({ status: 400 });
    expect(completeCreatorWakeup).not.toHaveBeenCalled();
  });

  it('does not settle a receipt that was already delivered', async () => {
    areDelivered.mockResolvedValue(true);
    const { context } = makeContext(payload);

    const response = await onCreatorComplete(context);

    expect(response).toMatchObject({ payload: { deduped: true, success: true }, status: 200 });
    expect(completeCreatorWakeup).not.toHaveBeenCalled();
  });
});
