import { beforeEach, describe, expect, it, vi } from 'vitest';

import { childResultEventId } from '../childResultDelivery';
import { ChildRunService } from '../ChildRunService';

const {
  mockAckReceipt,
  mockFindMessage,
  mockMessageQuery,
  mockResumeCas,
  mockPluginFind,
  mockOpFind,
  mockUpdateToolMessage,
  mockUpsertReceipt,
} = vi.hoisted(() => ({
  mockAckReceipt: vi.fn(),
  mockFindMessage: vi.fn(),
  mockMessageQuery: vi.fn(),
  mockOpFind: vi.fn(),
  mockPluginFind: vi.fn(),
  mockResumeCas: vi.fn(),
  mockUpdateToolMessage: vi.fn(),
  mockUpsertReceipt: vi.fn(),
}));

vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn().mockImplementation(function () {
    return { tryResumeFromAsyncTool: mockResumeCas };
  }),
}));

vi.mock('@/database/models/eventOutbox', () => ({
  EventOutboxModel: vi.fn().mockImplementation(function () {
    return {
      ackDeliveryReceiptByEventId: mockAckReceipt,
      upsertDeliveryReceipt: mockUpsertReceipt,
    };
  }),
}));

const buildService = ({
  anchorState,
  parentGeneration,
  parentState,
}: {
  anchorState: Record<string, unknown> | null;
  parentGeneration?: number;
  parentState: any;
}) => {
  // persistChildResultDelivery probes the anchor by id; the resume barrier
  // probes by toolCallId — distinguish via the column the `where` callback eq's.
  const probe = (where: any) =>
    where(new Proxy({}, { get: (_, prop) => ({ __col: prop }) }), { eq: (col: any) => col });
  mockPluginFind.mockImplementation(({ where }: any) => {
    const col = probe(where);
    if (col.__col === 'id') {
      return Promise.resolve(
        anchorState === null
          ? undefined
          : { id: 'msg-tool-1', state: anchorState, toolCallId: 'tc_1' },
      );
    }
    return Promise.resolve({
      id: 'msg-tool-1',
      state: { status: 'completed' },
      toolCallId: 'tc_1',
    });
  });
  mockOpFind.mockResolvedValue({
    appContext: { executionGeneration: parentGeneration ?? 0 },
    workspaceId: 'ws_1',
  });
  const loadAgentState = vi.fn().mockResolvedValue(parentState);
  mockMessageQuery.mockResolvedValue([]);
  mockUpdateToolMessage.mockResolvedValue({ success: true });
  mockUpsertReceipt.mockResolvedValue('inserted');
  mockAckReceipt.mockResolvedValue(true);
  mockResumeCas.mockResolvedValue(false);

  return new ChildRunService({
    agentOperationModel: {} as any,
    messageModel: {
      findById: mockFindMessage,
      query: mockMessageQuery,
      updateToolMessage: mockUpdateToolMessage,
    } as any,
    serverDB: {
      query: {
        agentOperations: { findFirst: mockOpFind },
        messagePlugins: { findFirst: mockPluginFind },
      },
    } as any,
    stateManager: { loadAgentState } as any,
    userId: 'user_1',
  } as any);
};

const bridgeParams = {
  operationId: 'op-child-1',
  parentOperationId: 'op-parent-1',
  reason: 'done',
  threadId: 'thread-1',
  toolMessageId: 'msg-tool-1',
};

describe('completeSubAgentBridge delivery ledger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists the receipt and marks it delivered when the resume CAS wins', async () => {
    const service = buildService({
      anchorState: { status: 'pending' },
      parentGeneration: 2,
      parentState: {
        pendingToolsCalling: [{ id: 'tc_1' }],
        status: 'waiting_for_async_tool',
      },
    });
    mockResumeCas.mockResolvedValue(true);

    const resumed = await service.completeSubAgentBridge({
      ...bridgeParams,
      finalState: { messages: [] } as any,
    });

    const eventId = childResultEventId({
      childOperationId: 'op-child-1',
      generation: 2,
      parentOperationId: 'op-parent-1',
      toolCallId: 'tc_1',
    });
    expect(resumed).toBe(true);
    expect(mockUpdateToolMessage).toHaveBeenCalledOnce();
    expect(mockUpdateToolMessage.mock.calls[0][1].pluginState.childResultDelivery).toEqual({
      childOperationId: 'op-child-1',
      eventId,
    });
    expect(mockUpsertReceipt).toHaveBeenCalledWith({
      delivered: false,
      event: expect.objectContaining({ eventId, eventType: 'agent_operation.child_result' }),
    });
    // The CAS win is the consume point for the legacy parked path — the
    // durable inbox ACK, bound to this parent operation.
    expect(mockAckReceipt).toHaveBeenCalledWith({
      aggregateId: 'op-parent-1',
      eventId,
    });
  });

  it('skips backfill for a superseded delivery (placeholder terminal under a foreign key)', async () => {
    // The await deadline sweep already settled this placeholder to error —
    // a late child completion must not overwrite it.
    const service = buildService({
      anchorState: { status: 'error', waitDeadlineExceeded: true },
      parentState: null,
    });

    const resumed = await service.completeSubAgentBridge({
      ...bridgeParams,
      finalState: { messages: [] } as any,
    });

    expect(resumed).toBe(false);
    expect(mockUpdateToolMessage).not.toHaveBeenCalled();
    expect(mockUpsertReceipt).toHaveBeenCalledWith({
      delivered: true,
      event: expect.objectContaining({
        eventId: 'child-result:op-parent-1:op-child-1:tc_1:0',
        payload: expect.objectContaining({ superseded: true }),
      }),
    });
  });

  it('keeps a same-key terminal backfill idempotent (webhook redelivery)', async () => {
    const service = buildService({
      anchorState: {
        childResultDelivery: {
          childOperationId: 'op-child-1',
          eventId: 'child-result:op-parent-1:op-child-1:tc_1:0',
        },
        status: 'completed',
      },
      parentState: null,
    });

    await service.completeSubAgentBridge({ ...bridgeParams, finalState: { messages: [] } as any });

    // Same dedupe key → not superseded → rewrite is harmless idempotent.
    expect(mockUpdateToolMessage).toHaveBeenCalledOnce();
    expect(mockUpsertReceipt).toHaveBeenCalledWith({
      delivered: false,
      event: expect.objectContaining({ payload: expect.objectContaining({ superseded: false }) }),
    });
  });
});
