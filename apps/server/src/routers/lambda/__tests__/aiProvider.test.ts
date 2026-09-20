// @vitest-environment node
import type * as BusinessConst from '@orvilo/business-const';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiInfraRepos } from '@/database/repositories/aiInfra';
import { getServerGlobalConfig } from '@/server/globalConfig';
import { type AiProviderRuntimeState } from '@/types/aiProvider';

import { aiProviderRouter } from '../aiProvider';

const mockGetHiddenBuiltinModelsForUser = vi.hoisted(() => vi.fn());

vi.mock('@/business/server/aiProvider', () => ({
  getHiddenBuiltinModelsForUser: mockGetHiddenBuiltinModelsForUser,
  getModelRedirects: vi.fn(async () => ({})),
}));
vi.mock('@/server/globalConfig');
vi.mock('@/database/repositories/aiInfra');
vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: vi.fn(),
}));
vi.mock('@orvilo/business-const', async () => {
  const actual = await vi.importActual<typeof BusinessConst>('@orvilo/business-const');

  return {
    ...actual,
    BRANDING_PROVIDER: 'orvilo',
    ENABLE_BUSINESS_FEATURES: true,
    isOfficialProvider: (id: string) => id === 'orvilo',
  };
});

describe('aiProviderRouter', () => {
  const mockUserId = 'test-user-id';

  const mockRuntimeState: AiProviderRuntimeState = {
    enabledAiModels: [],
    enabledAiProviders: [],
    enabledChatAiProviders: [],
    enabledImageAiProviders: [],
    enabledVideoAiProviders: [],
    runtimeConfig: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHiddenBuiltinModelsForUser.mockResolvedValue([]);

    vi.mocked(getServerGlobalConfig).mockReturnValue({
      aiProvider: {},
    } as any);
  });

  const createMockContext = () => ({
    userId: mockUserId,
  });

  describe('getAiProviderRuntimeState', () => {
    it('should get AI provider runtime state', async () => {
      const mockGetState = vi.fn().mockResolvedValue(mockRuntimeState);
      vi.mocked(AiInfraRepos).prototype.getAiProviderRuntimeState = mockGetState;

      const caller = aiProviderRouter.createCaller(createMockContext());
      const result = await caller.getAiProviderRuntimeState({});

      expect(result).toEqual({
        ...mockRuntimeState,
        hiddenBuiltinModels: [],
        modelRedirects: {},
      });
    });

    it('should append user-scoped hidden builtin models without changing runtime state loading', async () => {
      const mockGetState = vi.fn().mockResolvedValue(mockRuntimeState);
      const hiddenBuiltinModels = [{ id: 'hidden-model', providerId: 'orvilo' }];
      vi.mocked(AiInfraRepos).prototype.getAiProviderRuntimeState = mockGetState;
      mockGetHiddenBuiltinModelsForUser.mockResolvedValue(hiddenBuiltinModels);

      const caller = aiProviderRouter.createCaller(createMockContext());
      const result = await caller.getAiProviderRuntimeState({});

      expect(result).toEqual({
        ...mockRuntimeState,
        hiddenBuiltinModels,
        modelRedirects: {},
      });
      expect(mockGetHiddenBuiltinModelsForUser).toHaveBeenCalledWith(mockUserId);
    });

    it('should never return stored provider credentials', async () => {
      vi.mocked(AiInfraRepos).prototype.getAiProviderRuntimeState = vi.fn().mockResolvedValue({
        ...mockRuntimeState,
        enabledAiProviders: [{ id: 'openai', source: 'builtin' as const }],
        runtimeConfig: {
          openai: {
            config: {},
            keyVaults: { apiKey: 'openai-secret', baseURL: 'https://example.com' },
            settings: { sdkType: 'openai' },
          },
        },
      });

      const caller = aiProviderRouter.createCaller(createMockContext());
      const result = await caller.getAiProviderRuntimeState({});

      expect(result.runtimeConfig.openai.keyVaults).toEqual({});
      expect(JSON.stringify(result)).not.toContain('openai-secret');
      expect(JSON.stringify(result)).not.toContain('example.com');
    });

    it('should remove hidden models and providers from the runtime state', async () => {
      const orviloProvider = { id: 'orvilo', source: 'builtin' as const };
      const openaiProvider = { id: 'openai', source: 'builtin' as const };
      const hiddenImageModel = {
        abilities: {},
        enabled: true,
        id: 'hidden-image',
        providerId: 'orvilo',
        type: 'image' as const,
      };
      const visibleChatModel = {
        abilities: {},
        enabled: true,
        id: 'visible-chat',
        providerId: 'orvilo',
        type: 'chat' as const,
      };
      const visibleImageModel = {
        abilities: {},
        enabled: true,
        id: 'visible-image',
        providerId: 'openai',
        type: 'image' as const,
      };
      const runtimeState: AiProviderRuntimeState = {
        enabledAiModels: [hiddenImageModel, visibleChatModel, visibleImageModel],
        enabledAiProviders: [orviloProvider, openaiProvider],
        enabledChatAiProviders: [orviloProvider],
        enabledImageAiProviders: [orviloProvider, openaiProvider],
        enabledVideoAiProviders: [],
        runtimeConfig: {},
      };
      vi.mocked(AiInfraRepos).prototype.getAiProviderRuntimeState = vi
        .fn()
        .mockResolvedValue(runtimeState);
      mockGetHiddenBuiltinModelsForUser.mockResolvedValue([
        { id: 'hidden-image', providerId: 'orvilo' },
      ]);

      const caller = aiProviderRouter.createCaller(createMockContext());
      const result = await caller.getAiProviderRuntimeState({});

      expect(result.enabledAiModels).toEqual([visibleChatModel, visibleImageModel]);
      expect(result.enabledChatAiProviders).toEqual([orviloProvider]);
      expect(result.enabledImageAiProviders).toEqual([openaiProvider]);
    });
  });
});
