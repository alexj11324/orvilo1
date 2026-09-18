import { DEFAULT_PROVIDER } from '@orvilo/business-const';
import { DEFAULT_SETTINGS } from '@orvilo/config';
import { DEFAULT_MINI_MODEL, DEFAULT_MODEL } from '@orvilo/const';
import { ORVILO_DEFAULT_MODEL_LIST } from 'model-bank';
import { DEFAULT_MODEL_PROVIDER_LIST } from 'model-bank/modelProviders';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testService } from '~test-utils';

import { AiModelService, aiModelService } from './index';

const mockLambdaClient = vi.hoisted(() => ({
  aiModel: {
    getAiModelReasoningConfig: { query: vi.fn() },
    updateAiModelReasoningConfig: { mutate: vi.fn() },
  },
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: mockLambdaClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiModelService', () => {
  testService(AiModelService);

  describe('getAiModelReasoningConfig', () => {
    it('queries the reasoning config', async () => {
      await aiModelService.getAiModelReasoningConfig('gpt-5.2', 'openai');
      expect(mockLambdaClient.aiModel.getAiModelReasoningConfig.query).toHaveBeenCalledWith({
        id: 'gpt-5.2',
        providerId: 'openai',
      });
    });
  });

  describe('updateAiModelReasoningConfig', () => {
    it('calls the updateAiModelReasoningConfig mutation', async () => {
      const value = { gpt5_2ReasoningEffort: 'high' };
      await aiModelService.updateAiModelReasoningConfig('gpt-5.2', 'openai', value as any);
      expect(mockLambdaClient.aiModel.updateAiModelReasoningConfig.mutate).toHaveBeenCalledWith({
        id: 'gpt-5.2',
        providerId: 'openai',
        value,
      });
    });
  });
});

describe('Default model configuration', () => {
  it('DEFAULT_PROVIDER should be enabled in DEFAULT_MODEL_PROVIDER_LIST', () => {
    const match = DEFAULT_MODEL_PROVIDER_LIST.find((provider) => provider.id === DEFAULT_PROVIDER);
    expect(
      match,
      `DEFAULT_PROVIDER "${DEFAULT_PROVIDER}" not found in DEFAULT_MODEL_PROVIDER_LIST`,
    ).toBeDefined();
    expect(match!.enabled, `DEFAULT_PROVIDER "${DEFAULT_PROVIDER}" is not enabled`).toBe(true);
  });

  it('DEFAULT_PROVIDER should be enabled in DEFAULT_SETTINGS language model config', () => {
    const match = DEFAULT_SETTINGS.languageModel[DEFAULT_PROVIDER];
    expect(
      match,
      `DEFAULT_PROVIDER "${DEFAULT_PROVIDER}" not found in DEFAULT_SETTINGS language model config`,
    ).toBeDefined();
    expect(match!.enabled, `DEFAULT_PROVIDER "${DEFAULT_PROVIDER}" is not enabled`).toBe(true);
  });

  it('DEFAULT_MODEL should be enabled in ORVILO_DEFAULT_MODEL_LIST', () => {
    const match = ORVILO_DEFAULT_MODEL_LIST.find(
      (m) => m.id === DEFAULT_MODEL && m.providerId === DEFAULT_PROVIDER,
    );
    expect(
      match,
      `DEFAULT_MODEL "${DEFAULT_PROVIDER}/${DEFAULT_MODEL}" not found in ORVILO_DEFAULT_MODEL_LIST`,
    ).toBeDefined();
    expect(
      match!.enabled,
      `DEFAULT_MODEL "${DEFAULT_PROVIDER}/${DEFAULT_MODEL}" is not enabled`,
    ).toBe(true);
  });

  it('DEFAULT_MINI_MODEL should be enabled in ORVILO_DEFAULT_MODEL_LIST', () => {
    const match = ORVILO_DEFAULT_MODEL_LIST.find((m) => m.id === DEFAULT_MINI_MODEL);
    expect(
      match,
      `DEFAULT_MINI_MODEL "${DEFAULT_MINI_MODEL}" not found in ORVILO_DEFAULT_MODEL_LIST`,
    ).toBeDefined();
    expect(match!.enabled, `DEFAULT_MINI_MODEL "${DEFAULT_MINI_MODEL}" is not enabled`).toBe(true);
  });
});
