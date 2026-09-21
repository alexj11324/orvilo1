import { describe, expect, it } from 'vitest';

import { type AIProviderStoreState } from '@/store/aiInfra/initialState';

import { aiModelSelectors } from './selectors';

describe('aiModelSelectors', () => {
  const mockState: AIProviderStoreState = {
    builtinAiModelList: [],
    enabledAiModels: [
      {
        id: 'model1',
        providerId: 'provider1',
        abilities: {
          functionCall: true,
          vision: true,
          reasoning: true,
          imageOutput: true,
        },
        contextWindowTokens: 4000,
        settings: {
          disabledParams: ['temperature', 'top_p'],
        },
        type: 'chat',
      },
      {
        id: 'model4',
        providerId: 'provider2',
        abilities: {
          functionCall: false,
          vision: false,
          reasoning: false,
        },
        type: 'chat',
      },
    ],
    aiProviderRuntimeConfig: {},
    isInitAiProviderRuntimeState: false,
    modelReasoningConfigMap: {},
    modelReasoningConfigUpdatingKeys: [],
  };

  describe('model capability checks', () => {
    it('should check tool use support', () => {
      expect(aiModelSelectors.isModelSupportToolUse('model1', 'provider1')(mockState)).toBe(true);
      expect(aiModelSelectors.isModelSupportToolUse('model4', 'provider2')(mockState)).toBe(false);
    });

    it('should check vision support', () => {
      expect(aiModelSelectors.isModelSupportVision('model1', 'provider1')(mockState)).toBe(true);
      expect(aiModelSelectors.isModelSupportVision('model4', 'provider2')(mockState)).toBe(false);
    });

    it('should check reasoning support', () => {
      expect(aiModelSelectors.isModelSupportReasoning('model1', 'provider1')(mockState)).toBe(true);
      expect(aiModelSelectors.isModelSupportReasoning('model4', 'provider2')(mockState)).toBe(
        false,
      );
    });

    it('should check image output support', () => {
      expect(aiModelSelectors.isModelSupportImageOutput('model1', 'provider1')(mockState)).toBe(
        true,
      );
      // Missing ability defaults to false via `|| false` coercion.
      expect(aiModelSelectors.isModelSupportImageOutput('model4', 'provider2')(mockState)).toBe(
        false,
      );
      // Unknown model returns false instead of throwing.
      expect(aiModelSelectors.isModelSupportImageOutput('missing', 'provider1')(mockState)).toBe(
        false,
      );
    });
  });

  describe('context window checks', () => {
    it('should check if model has context window tokens', () => {
      expect(aiModelSelectors.isModelHasContextWindowToken('model1', 'provider1')(mockState)).toBe(
        true,
      );
      expect(aiModelSelectors.isModelHasContextWindowToken('model4', 'provider2')(mockState)).toBe(
        false,
      );
    });

    it('should get model context window tokens', () => {
      expect(aiModelSelectors.modelContextWindowTokens('model1', 'provider1')(mockState)).toBe(
        4000,
      );
      expect(
        aiModelSelectors.modelContextWindowTokens('model4', 'provider2')(mockState),
      ).toBeUndefined();
    });
  });

  describe('modelDisabledParams', () => {
    it('should return disabledParams when declared on the model card', () => {
      expect(aiModelSelectors.modelDisabledParams('model1', 'provider1')(mockState)).toEqual([
        'temperature',
        'top_p',
      ]);
    });

    it('should return undefined when the model has no settings', () => {
      expect(
        aiModelSelectors.modelDisabledParams('model4', 'provider2')(mockState),
      ).toBeUndefined();
    });

    it('should return undefined for an unknown model', () => {
      expect(
        aiModelSelectors.modelDisabledParams('missing', 'provider1')(mockState),
      ).toBeUndefined();
    });
  });

  describe('getModelCard', () => {
    it('should find model in enabledAiModels first', () => {
      const state: AIProviderStoreState = {
        ...mockState,
        enabledAiModels: [
          {
            id: 'test-model',
            providerId: 'provider-a',
            displayName: 'Enabled Model A',
            abilities: {},
            type: 'chat',
            pricing: {
              units: [{ name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' }],
            },
          },
        ],
        builtinAiModelList: [
          {
            id: 'test-model',
            providerId: 'provider-a',
            displayName: 'Builtin Model A',
            abilities: {},
            type: 'chat',
          },
        ],
      };
      const result = aiModelSelectors.getModelCard('test-model', 'provider-a')(state);
      expect(result).toBeDefined();
      expect(result?.displayName).toBe('Enabled Model A');
      expect((result?.pricing?.units?.[0] as any)?.rate).toBe(1);
    });

    it('should fallback to builtinAiModelList if not in enabledAiModels', () => {
      const state: AIProviderStoreState = {
        ...mockState,
        enabledAiModels: [],
        builtinAiModelList: [
          {
            id: 'test-model',
            providerId: 'provider-a',
            displayName: 'Builtin Model A',
            abilities: {},
            type: 'chat',
          },
        ],
      };
      const result = aiModelSelectors.getModelCard('test-model', 'provider-a')(state);
      expect(result).toBeDefined();
      expect(result?.displayName).toBe('Builtin Model A');
    });

    it('should return undefined if model is not found in either list', () => {
      const result = aiModelSelectors.getModelCard('non-existent', 'provider-a')(mockState);
      expect(result).toBeUndefined();
    });
  });
});
