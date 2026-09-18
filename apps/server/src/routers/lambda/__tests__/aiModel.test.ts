import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiModelModel } from '@/database/models/aiModel';
import { AiInfraRepos } from '@/database/repositories/aiInfra';

import { aiModelRouter } from '../aiModel';

const mockGetHiddenBuiltinModelsForUser = vi.hoisted(() => vi.fn());

vi.mock('@/business/server/aiProvider', () => ({
  getHiddenBuiltinModelsForUser: mockGetHiddenBuiltinModelsForUser,
  getModelRedirects: vi.fn(async () => ({})),
}));
vi.mock('@/database/models/aiModel');
vi.mock('@/database/models/user');
vi.mock('@/database/repositories/aiInfra');
vi.mock('@/server/globalConfig', () => ({
  getServerGlobalConfig: vi.fn().mockReturnValue({
    aiProvider: {},
  }),
}));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    initWithEnvKey: vi.fn().mockResolvedValue({
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    }),
  },
}));

describe('aiModelRouter', () => {
  const mockCtx = {
    userId: 'test-user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHiddenBuiltinModelsForUser.mockResolvedValue([]);
  });

  it('should get ai provider model list', async () => {
    const mockModelList = [
      { id: 'model-1', name: 'Model 1' },
      { id: 'model-2', name: 'Model 2' },
    ];
    const mockGetList = vi.fn().mockResolvedValue(mockModelList);
    vi.mocked(AiInfraRepos).mockImplementation(function () {
      return {
        getAiProviderModelList: mockGetList,
      } as any;
    });

    const caller = aiModelRouter.createCaller(mockCtx);

    const result = await caller.getAiProviderModelList({ id: 'provider-1' });

    expect(result).toEqual(mockModelList);
    expect(mockGetList).toHaveBeenCalledWith('provider-1', {
      enabled: undefined,
      limit: undefined,
      offset: undefined,
      type: undefined,
    });
  });

  it('should get model reasoning config', async () => {
    const mockGet = vi.fn().mockResolvedValue({ gpt5_6ReasoningEffort: 'high' });
    vi.mocked(AiModelModel).mockImplementation(function () {
      return {
        getModelReasoningConfig: mockGet,
      } as any;
    });

    const caller = aiModelRouter.createCaller(mockCtx);

    const result = await caller.getAiModelReasoningConfig({
      id: 'gpt-5.6-sol',
      providerId: 'openai',
    });

    expect(mockGet).toHaveBeenCalledWith('gpt-5.6-sol', 'openai');
    expect(result).toEqual({ gpt5_6ReasoningEffort: 'high' });
  });

  it('should update model reasoning config', async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(AiModelModel).mockImplementation(function () {
      return {
        updateModelReasoningConfig: mockUpdate,
      } as any;
    });

    const caller = aiModelRouter.createCaller(mockCtx);

    await caller.updateAiModelReasoningConfig({
      id: 'gpt-5.6-sol',
      providerId: 'openai',
      value: { gpt5_6ReasoningEffort: 'xhigh', reasoningMode: 'pro' },
    });

    expect(mockUpdate).toHaveBeenCalledWith('gpt-5.6-sol', 'openai', {
      gpt5_6ReasoningEffort: 'xhigh',
      reasoningMode: 'pro',
    });
  });

  it('should reject invalid reasoning config values', async () => {
    const mockUpdate = vi.fn();
    vi.mocked(AiModelModel).mockImplementation(function () {
      return {
        updateModelReasoningConfig: mockUpdate,
      } as any;
    });

    const caller = aiModelRouter.createCaller(mockCtx);

    await expect(
      caller.updateAiModelReasoningConfig({
        id: 'gpt-5.6-sol',
        providerId: 'openai',
        value: { gpt5_6ReasoningEffort: 'ultra' } as any,
      }),
    ).rejects.toThrow();

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
