import { beforeEach, describe, expect, it, vi } from 'vitest';

import { imageGenerationExecutor } from './index';

const mocks = vi.hoisted(() => ({
  createImage: vi.fn(),
  createTopic: vi.fn(),
  enabledImageModelList: vi.fn(),
  getAgentStoreState: vi.fn(),
  getGenerationStatus: vi.fn(),
}));

vi.mock('@/services/generation', () => ({
  generationService: {
    getGenerationStatus: mocks.getGenerationStatus,
  },
}));
vi.mock('@/services/generationTopic', () => ({
  generationTopicService: {
    createTopic: mocks.createTopic,
  },
}));
vi.mock('@/services/image', () => ({
  imageService: {
    createImage: mocks.createImage,
  },
}));
vi.mock('@/store/agent', () => ({
  getAgentStoreState: mocks.getAgentStoreState,
}));
vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentById:
      (agentId: string) =>
      (state: { agentMap: Record<string, { visibility?: 'private' | 'public' }> }) =>
        state.agentMap[agentId],
  },
}));
vi.mock('@/store/aiInfra', () => ({
  aiProviderSelectors: {
    enabledImageModelList: mocks.enabledImageModelList,
  },
  getAiInfraStoreState: vi.fn(() => ({})),
}));

describe('ImageGenerationExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAgentStoreState.mockReturnValue({
      agentMap: {
        'agent-public': {
          visibility: 'public',
        },
      },
    });
    mocks.enabledImageModelList.mockReturnValue([
      {
        children: [
          { id: 'image-model-1', providerId: 'provider-1' },
          { id: 'image-model-2', providerId: 'provider-1' },
        ],
        id: 'provider-1',
        name: 'Provider 1',
      },
    ]);
    mocks.createTopic.mockResolvedValue('topic-1');
    mocks.createImage.mockResolvedValue({
      data: {
        batch: { id: 'batch-1' },
        generations: [{ asyncTaskId: 'task-1', id: 'generation-1' }],
      },
      success: true,
    });
  });

  it('preserves public agent visibility for client-routed image topics', async () => {
    const result = await imageGenerationExecutor.generateImage(
      {
        model: 'image-model-1',
        prompt: 'A shared workspace illustration',
        provider: 'provider-1',
        waitUntilComplete: false,
      },
      {
        agentId: 'agent-public',
        messageId: 'message-1',
      },
    );

    expect(result.success).toBe(true);
    expect(mocks.createTopic).toHaveBeenCalledWith(
      'image',
      'public',
      'A shared workspace illustration',
    );
  });

  it('lists the static catalog image models with provider filter and limit', async () => {
    const result = await imageGenerationExecutor.listImageModels({
      limit: 1,
      provider: 'provider-1',
    });

    expect(result).toMatchObject({
      state: {
        providers: [{ id: 'provider-1', models: [{ id: 'image-model-1' }] }],
        totalModels: 1,
      },
      success: true,
    });
  });

  it('returns an empty catalog when the store has no image models', async () => {
    mocks.enabledImageModelList.mockReturnValue([]);

    const result = await imageGenerationExecutor.listImageModels({
      limit: 1,
      provider: 'provider-1',
    });

    expect(result).toMatchObject({
      state: { providers: [], totalModels: 0 },
      success: true,
    });
  });
});
