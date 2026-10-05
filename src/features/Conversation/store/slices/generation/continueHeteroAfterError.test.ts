import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as agentDispatcher from '@/store/chat/slices/agentRun/actions/dispatch/agentDispatcher';

import { type ConversationContext } from '../../../types';
import { createStore } from '../../index';

// ── Mock the hetero runtime seam ──
// FIX-C: `continueHeteroAfterError` no longer chains a fresh
// `orvilo hetero exec` turn onto the run's surviving tail over renderer IPC —
// a resumable hetero failure re-enters through `delAndRegenerateMessage` →
// `selectRuntimeType` → `gateway` (unified server admission). We keep the
// executor mock solely to prove the spawn count is 0.
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
const mockUpdateMessage = vi.fn(async () => ({ success: false }));
const mockRemoveMessages = vi.fn(async () => ({ success: false }));
vi.mock('@/services/message', () => ({
  messageService: {
    createMessage: (...args: any[]) => mockCreateMessage(...(args as [])),
    removeMessages: (...args: any[]) => mockRemoveMessages(...(args as [])),
    updateMessage: (...args: any[]) => mockUpdateMessage(...(args as [])),
  },
}));

vi.mock('@/store/agent', () => ({
  getAgentStoreState: () => ({ localAgentWorkingDirectoryMap: {} }),
}));

let mockAgentVisibility: 'private' | 'public' = 'public';
let mockIsWorkspaceAgent = false;
let mockSharedExecutionTarget: 'device' | 'local' = 'local';
let mockWorkspaceOverride: { boundDeviceId: string; executionTarget: 'local' } | undefined;

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentById: () => () =>
      mockIsWorkspaceAgent
        ? { visibility: mockAgentVisibility, workspaceId: 'workspace-1' }
        : undefined,
  },
  agentSelectors: {
    getAgentConfigById: () => () => ({
      agencyConfig: {
        boundDeviceId: 'workspace-device',
        executionTarget: mockSharedExecutionTarget,
        heterogeneousProvider: { type: 'claude-code' },
        workingDirByDevice: {
          'personal-device': '/Users/me/project',
          'workspace-device': '/workspace/project',
        },
      },
    }),
  },
}));

let mockTopic: { id: string; model?: string; provider?: string } | undefined;
vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    getTopicById: () => () => mockTopic,
    getTopicHeteroPinById: () => () =>
      mockTopic?.model ? { model: mockTopic.model, provider: mockTopic.provider || '' } : undefined,
    getTopicModelById: () => () =>
      mockTopic?.model ? { model: mockTopic.model, provider: mockTopic.provider || '' } : undefined,
  },
}));

vi.mock('@/store/electron', () => ({
  getElectronStoreState: () => ({ gatewayDeviceInfo: { deviceId: 'personal-device' } }),
}));

vi.mock('@/store/user', () => ({
  getUserStoreState: () => ({
    workspaceUserPreference: {
      agentDeviceOverrides: mockWorkspaceOverride ? { 'agent-1': mockWorkspaceOverride } : {},
    },
  }),
}));

const mockChatDeleteMessage = vi.fn(async () => {});
const mockExecuteGatewayAgent = vi.fn(async () => {});
const mockStartOperation = vi.fn(() => ({ operationId: 'op-id' }));
const noop = vi.fn();
vi.mock('@/store/chat', () => ({
  useChatStore: {
    getState: vi.fn(() => ({
      topicDataMap: {},
      topicDetailMap: mockTopic ? { [mockTopic.id]: mockTopic } : {},
      operations: {},
      operationsByMessage: {},

      associateMessageWithOperation: noop,
      completeOperation: noop,
      deleteMessage: (...args: any[]) => mockChatDeleteMessage(...(args as [])),
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

const CONTEXT: ConversationContext = { agentId: 'agent-1', threadId: null, topicId: 'topic-1' };

const HETERO_RATE_LIMIT = { body: { agentType: 'claude-code', code: 'rate_limit' } };

const USER_MESSAGE = { content: 'clean up worktrees', id: 'user-1', role: 'user' };

/**
 * A finished-then-failed run: step-1 did real work (a tool call), step-2 opened
 * and immediately died on the usage limit. `step-1` is also the group id.
 */
const buildGroupStore = (children: any[], dbMessages?: any[]) => {
  const store = createStore({ context: CONTEXT });
  act(() => {
    store.setState({
      dbMessages: dbMessages ?? [
        USER_MESSAGE,
        { content: '', id: 'step-1', parentId: 'user-1', role: 'assistant' },
        { content: '', id: 'step-2', parentId: 'step-1', role: 'assistant' },
      ],
      displayMessages: [
        USER_MESSAGE,
        { children, content: '', id: 'step-1', parentId: 'user-1', role: 'assistantGroup' },
      ],
    } as any);
  });
  return store;
};

describe('continueHeteroAfterError (FIX-C unified admission)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentVisibility = 'public';
    mockIsWorkspaceAgent = false;
    mockSharedExecutionTarget = 'local';
    mockTopic = undefined;
    mockWorkspaceOverride = undefined;
  });

  it('deletes the failed turn and regenerates through gateway admission — IPC spawn count 0', async () => {
    const store = buildGroupStore([
      { content: 'looking', id: 'step-1', tools: [{ id: 'call-1' }] },
      { content: '', error: HETERO_RATE_LIMIT, id: 'step-2', tools: [{ id: 'call-2' }] },
    ]);

    await act(async () => {
      await store.getState().continueHeteroAfterError('step-1');
    });

    // The whole turn is replaced via delAndRegenerateMessage — no surgical
    // tail-clearing, no chained CLI-session continuation.
    expect(mockChatDeleteMessage).toHaveBeenCalledWith('step-1', { operationId: 'op-id' });
    expect(mockUpdateMessage).not.toHaveBeenCalled();
    expect(mockRemoveMessages).not.toHaveBeenCalled();

    // The replacement run goes through server admission as a gateway
    // regenerate of the original user prompt.
    expect(mockExecuteGatewayAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: USER_MESSAGE.content,
        parentMessageId: 'user-1',
      }),
    );

    // The retired renderer-IPC lifecycle is never touched.
    expect(mockExecuteHeterogeneousAgent).not.toHaveBeenCalled();
    expect(mockCreateMessage).not.toHaveBeenCalled();
  });

  it('workspace agent + member local override still routes through gateway — never a private respawn', async () => {
    // Regression for F03: a workspace member's `local` pick used to spawn the
    // private IPC lifecycle on their own desktop, bypassing server admission.
    // The selector must still see the resolved override context — and must
    // route it to gateway regardless.
    mockIsWorkspaceAgent = true;
    mockSharedExecutionTarget = 'device';
    mockWorkspaceOverride = {
      boundDeviceId: 'personal-device',
      executionTarget: 'local',
    };

    const selectRuntimeTypeSpy = vi.spyOn(agentDispatcher, 'selectRuntimeType');
    const store = buildGroupStore([
      { content: 'looking', id: 'step-1', tools: [{ id: 'call-1' }] },
      { content: '', error: HETERO_RATE_LIMIT, id: 'step-2' },
    ]);

    await act(async () => {
      await store.getState().continueHeteroAfterError('step-1');
    });

    expect(selectRuntimeTypeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        boundDeviceId: 'personal-device',
        executionTarget: 'local',
        isWorkspaceAgent: true,
        workspaceScoped: false,
      }),
    );
    expect(mockExecuteGatewayAgent).toHaveBeenCalled();
    expect(mockExecuteHeterogeneousAgent).not.toHaveBeenCalled();
  });

  it('workspace shared-local target without an override routes through gateway', async () => {
    mockIsWorkspaceAgent = true;
    mockSharedExecutionTarget = 'local';
    const selectRuntimeTypeSpy = vi.spyOn(agentDispatcher, 'selectRuntimeType');
    const store = buildGroupStore([
      { content: 'looking', id: 'step-1', tools: [{ id: 'call-1' }] },
      { content: '', error: HETERO_RATE_LIMIT, id: 'step-2' },
    ]);

    await act(async () => {
      await store.getState().continueHeteroAfterError('step-1');
    });

    expect(selectRuntimeTypeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        boundDeviceId: 'workspace-device',
        executionTarget: 'local',
        isWorkspaceAgent: true,
        workspaceScoped: true,
      }),
    );
    expect(mockExecuteGatewayAgent).toHaveBeenCalledWith(
      expect.objectContaining({ message: USER_MESSAGE.content }),
    );
    expect(mockExecuteHeterogeneousAgent).not.toHaveBeenCalled();
  });

  it("applies the owner's own local override while the Workspace Agent is private", async () => {
    // The owner's `local` pick lives in the per-user override even on a
    // private Workspace Agent — it still reaches the selector, which still
    // routes to gateway.
    mockAgentVisibility = 'private';
    mockIsWorkspaceAgent = true;
    mockSharedExecutionTarget = 'device';
    mockWorkspaceOverride = {
      boundDeviceId: 'personal-device',
      executionTarget: 'local',
    };
    const selectRuntimeTypeSpy = vi.spyOn(agentDispatcher, 'selectRuntimeType');
    const store = buildGroupStore([
      { content: 'looking', id: 'step-1', tools: [{ id: 'call-1' }] },
      { content: '', error: HETERO_RATE_LIMIT, id: 'step-2' },
    ]);

    await act(async () => {
      await store.getState().continueHeteroAfterError('step-1');
    });

    expect(selectRuntimeTypeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        boundDeviceId: 'personal-device',
        executionTarget: 'local',
        isWorkspaceAgent: true,
        workspaceScoped: false,
      }),
    );
    expect(mockExecuteGatewayAgent).toHaveBeenCalled();
    expect(mockExecuteHeterogeneousAgent).not.toHaveBeenCalled();
  });

  it('ignores a tail error that is not a heterogeneous-agent status error', async () => {
    const store = buildGroupStore([
      { content: 'looking', id: 'step-1', tools: [{ id: 'call-1' }] },
      { content: '', error: { body: { message: 'boom' }, type: 'PluginError' }, id: 'step-2' },
    ]);

    await act(async () => {
      await store.getState().continueHeteroAfterError('step-1');
    });

    expect(mockChatDeleteMessage).not.toHaveBeenCalled();
    expect(mockExecuteHeterogeneousAgent).not.toHaveBeenCalled();
    expect(mockExecuteGatewayAgent).not.toHaveBeenCalled();
  });
});
