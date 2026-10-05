import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ConversationContext } from '../../../types';
import { createStore } from '../../index';

// ── Mock the hetero runtime seam ──
// FIX-C: regenerate of a heterogeneous-provider turn no longer re-runs the
// local CLI via `executeHeterogeneousAgent` — it re-enters through
// `selectRuntimeType` → `gateway` like every other entry. The original user
// message (with its imageList) stays persisted, so the server-admitted run
// sees the same attachments the send path did; nothing is forwarded or
// dropped client-side. The executor mock proves the spawn count is 0.
const mockExecuteHeterogeneousAgent = vi.fn();
vi.mock(
  '@/store/chat/slices/agentRun/actions/transports/hetero/heterogeneousAgentExecutor',
  () => ({
    executeHeterogeneousAgent: (...args: any[]) => mockExecuteHeterogeneousAgent(...args),
  }),
);

vi.mock('@/store/chat/utils/activeTopicDocumentContext', () => ({
  mergeAgentRuntimeInitialContexts: () => undefined,
  resolveActiveTopicDocumentInitialContext: async () => undefined,
}));

vi.mock('@/store/chat/slices/operation/selectors', () => ({
  operationSelectors: {
    getOperationById: () => () => undefined,
    isMessageProcessing: () => () => false,
    isMessageRegenerating: () => () => false,
  },
}));

const mockCreateMessage = vi.fn(async () => ({ id: 'assistant-new' }));
vi.mock('@/services/message', () => ({
  messageService: { createMessage: (...args: any[]) => mockCreateMessage(...(args as [])) },
}));

vi.mock('@/store/agent', () => ({
  getAgentStoreState: () => ({ localAgentWorkingDirectoryMap: {} }),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentById: () => () => undefined,
    isWorkspaceAgentById: () => () => false,
  },
  agentSelectors: {
    getAgentConfigById: () => () => ({
      agencyConfig: {
        executionTarget: 'local',
        heterogeneousProvider: { type: 'claude-code' },
        workingDirByDevice: { 'device-1': '/work/dir' },
      },
    }),
  },
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    getTopicById: () => () => undefined,
    getTopicHeteroPinById: () => () => undefined,
    getTopicModelById: () => () => undefined,
  },
}));

vi.mock('@/store/electron', () => ({
  getElectronStoreState: () => ({ gatewayDeviceInfo: { deviceId: 'device-1' } }),
}));

const mockExecuteGatewayAgent = vi.fn(async () => {});
const mockStartOperation = vi.fn(() => ({ operationId: 'regen-op-id' }));
const noop = vi.fn();
vi.mock('@/store/chat', () => ({
  useChatStore: {
    getState: vi.fn(() => ({
      topicDataMap: {},
      topicDetailMap: {},
      operations: {},
      operationsByMessage: {},

      associateMessageWithOperation: noop,
      completeOperation: noop,
      executeGatewayAgent: (...args: any[]) => mockExecuteGatewayAgent(...(args as [])),
      failOperation: noop,
      isGatewayModeEnabled: () => false,
      refreshMessages: vi.fn(async () => {}),
      startOperation: (...args: any[]) => mockStartOperation(...(args as [])),
      switchMessageBranch: vi.fn(async () => {}),
    })),
    setState: vi.fn(),
  },
}));

describe('regenerateUserMessage (hetero provider) — FIX-C unified admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('regenerates a turn with images through gateway — the persisted imageList is untouched', async () => {
    const context: ConversationContext = {
      agentId: 'agent-1',
      topicId: 'topic-1',
      threadId: null,
    };

    const imageList = [{ alt: 'shot.png', id: 'img-1', url: 'https://x/img-1.png' }];

    const store = createStore({ context });
    act(() => {
      store.setState({
        displayMessages: [{ content: 'describe this', id: 'msg-1', imageList, role: 'user' }],
        dbMessages: [{ content: 'describe this', id: 'msg-1', imageList, role: 'user' }],
      } as any);
    });

    await act(async () => {
      await store.getState().regenerateUserMessage('msg-1');
    });

    // The server-admitted run resumes the persisted user message — images and
    // all — rather than a locally re-created prompt.
    expect(mockExecuteGatewayAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'describe this',
        parentMessageId: 'msg-1',
        parentOperationId: 'regen-op-id',
      }),
    );
    expect(mockExecuteHeterogeneousAgent).not.toHaveBeenCalled();
    expect(mockCreateMessage).not.toHaveBeenCalled();
  });

  it('regenerates a text-only turn through the same gateway path — no IPC spawn', async () => {
    const context: ConversationContext = {
      agentId: 'agent-1',
      topicId: 'topic-1',
      threadId: null,
    };

    const store = createStore({ context });
    act(() => {
      store.setState({
        displayMessages: [{ content: 'hello', id: 'msg-1', role: 'user' }],
        dbMessages: [{ content: 'hello', id: 'msg-1', role: 'user' }],
      } as any);
    });

    await act(async () => {
      await store.getState().regenerateUserMessage('msg-1');
    });

    expect(mockExecuteGatewayAgent).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'hello', parentMessageId: 'msg-1' }),
    );
    expect(mockExecuteHeterogeneousAgent).not.toHaveBeenCalled();
    expect(mockCreateMessage).not.toHaveBeenCalled();
  });
});
