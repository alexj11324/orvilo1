import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStartError } from '../../agentExecution/types';
import { AiAgentService } from '../index';

/**
 * F09/R05 regression: `execAgent` must refuse the retired deferred-start flag
 * BEFORE producing any run — not silently ignore it and dispatch anyway.
 * The promise: an accepted run is always dispatched inside the call, so a
 * caller that asked for `autoStart:false` must get an error instead of an
 * already-running operation it never wanted yet.
 */

const {
  mockCreateOperation,
  mockDispatchHeteroAgent,
  mockMessageCreate,
  mockThreadCreate,
  mockTopicCreate,
} = vi.hoisted(() => ({
  mockCreateOperation: vi.fn(),
  mockDispatchHeteroAgent: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockThreadCreate: vi.fn(),
  mockTopicCreate: vi.fn(),
}));

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {
      create: mockMessageCreate,
      getLatestNonToolMessageId: vi.fn().mockResolvedValue(undefined),
      getLatestSpineMessageId: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    };
  }),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
        chatConfig: {},
        files: [],
        id: 'agent-1',
        knowledgeBases: [],
        model: 'gpt-4',
        plugins: [],
        provider: 'openai',
        systemRole: 'You are a helpful assistant',
      }),
      queryAgents: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
        chatConfig: {},
        files: [],
        id: 'agent-1',
        knowledgeBases: [],
        model: 'gpt-4',
        plugins: [],
        provider: 'openai',
        systemRole: 'You are a helpful assistant',
      }),
    };
  }),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return {
      query: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      appendRunningOperationChild: vi.fn().mockResolvedValue(true),
      create: mockTopicCreate,
      findById: vi.fn().mockResolvedValue(undefined),
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@/database/models/thread', () => ({
  ThreadModel: vi.fn().mockImplementation(function () {
    return {
      create: mockThreadCreate,
      findById: vi.fn(),
      update: vi.fn(),
    };
  }),
}));

vi.mock('@/database/models/chatGroup', () => ({
  ChatGroupModel: vi.fn().mockImplementation(function () {
    return {
      findById: vi.fn().mockResolvedValue(undefined),
      getGroupAgentsWithMeta: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/agentExecution', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {
      createOperation: mockCreateOperation,
    };
  }),
}));

vi.mock('../pipeline/heteroDispatch', () => ({
  dispatchHeteroAgent: mockDispatchHeteroAgent,
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn().mockImplementation(function () {
    return {
      getOrviloSkillManifests: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/composio', () => ({
  ComposioService: vi.fn().mockImplementation(function () {
    return {
      getComposioManifests: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return {
      uploadFromUrl: vi.fn(),
    };
  }),
}));

vi.mock('@/server/modules/Mecha', () => ({
  createServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
  serverMessagesEngine: vi.fn().mockResolvedValue([{ content: 'test', role: 'user' }]),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    isConfigured: false,
    queryDeviceList: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: vi.fn(),
}));

vi.mock('model-bank', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelBankModule>();
  return {
    ...actual,
    ORVILO_DEFAULT_MODEL_LIST: [
      {
        abilities: { functionCall: true, video: false, vision: true },
        id: 'gpt-4',
        providerId: 'openai',
      },
    ],
  };
});

describe('AiAgentService.execAgent - autoStart contract', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockThreadCreate.mockResolvedValue({ id: 'thread-1' });
    mockTopicCreate.mockResolvedValue({ id: 'topic-1' });
    mockCreateOperation.mockResolvedValue({
      autoStarted: true,
      messageId: 'queue-msg-1',
      operationId: 'op-123',
      success: true,
    });
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });

    service = new AiAgentService(mockDb, userId);
  });

  it('rejects autoStart:false before any run exists — no thread, message, operation or dispatch', async () => {
    // The F09 contract violation: the flag used to be silently ignored, so a
    // caller requesting deferred start got an already-running operation. The
    // rejection must precede every side effect, so "deferred" runs can't be
    // observed as started.
    await expect(
      service.execAgent({ agentId: 'agent-1', autoStart: false, prompt: 'Test prompt' }),
    ).rejects.toMatchObject({
      denial: 'deferred_start_unsupported',
      name: 'AgentStartError',
    });

    expect(mockThreadCreate).not.toHaveBeenCalled();
    expect(mockTopicCreate).not.toHaveBeenCalled();
    expect(mockMessageCreate).not.toHaveBeenCalled();
    expect(mockCreateOperation).not.toHaveBeenCalled();
    expect(mockDispatchHeteroAgent).not.toHaveBeenCalled();
  });

  it('surfaces a typed error the API layer can map to a 4xx', async () => {
    await expect(
      service.execAgent({ agentId: 'agent-1', autoStart: false, prompt: 'Test prompt' }),
    ).rejects.toBeInstanceOf(AgentStartError);
  });

  it('still dispatches a normal run when autoStart is omitted', async () => {
    await service.execAgent({ agentId: 'agent-1', prompt: 'Test prompt' });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
  });

  it('still dispatches a normal run when autoStart:true is explicit', async () => {
    await service.execAgent({ agentId: 'agent-1', autoStart: true, prompt: 'Test prompt' });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
  });
});
