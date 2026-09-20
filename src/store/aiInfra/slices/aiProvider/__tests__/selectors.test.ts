import { describe, expect, it } from 'vitest';

import type { AIProviderStoreState } from '@/store/aiInfra/initialState';

import { aiProviderSelectors } from '../selectors';

const mockState = {
  aiProviderRuntimeConfig: {
    provider1: {
      config: { enableResponseApi: true },
      keyVaults: {},
      settings: { searchMode: 'params' },
    },
    provider2: {
      keyVaults: {},
      settings: {},
    },
  },
  enabledEmbeddingModelList: [{ id: 'p1', name: 'P1' }],
  enabledImageModelList: [{ id: 'p2', name: 'P2' }],
  enabledVideoModelList: [{ id: 'p3', name: 'P3' }],
  isInitAiProviderRuntimeState: true,
} as unknown as AIProviderStoreState;

describe('aiProviderSelectors', () => {
  describe('enabledEmbeddingModelList', () => {
    it('should return the embedding model list', () => {
      expect(aiProviderSelectors.enabledEmbeddingModelList(mockState)).toEqual([
        { id: 'p1', name: 'P1' },
      ]);
    });

    it('should fall back to an empty list', () => {
      expect(
        aiProviderSelectors.enabledEmbeddingModelList({
          ...mockState,
          enabledEmbeddingModelList: undefined,
        }),
      ).toEqual([]);
    });
  });

  describe('enabledImageModelList', () => {
    it('should return the image model list', () => {
      expect(aiProviderSelectors.enabledImageModelList(mockState)).toEqual([
        { id: 'p2', name: 'P2' },
      ]);
    });
  });

  describe('enabledVideoModelList', () => {
    it('should return the video model list', () => {
      expect(aiProviderSelectors.enabledVideoModelList(mockState)).toEqual([
        { id: 'p3', name: 'P3' },
      ]);
    });
  });

  describe('providerConfigById', () => {
    it('should return the runtime config for a provider', () => {
      expect(aiProviderSelectors.providerConfigById('provider1')(mockState)).toEqual(
        mockState.aiProviderRuntimeConfig.provider1,
      );
    });

    it('should return undefined for an empty id', () => {
      expect(aiProviderSelectors.providerConfigById('')(mockState)).toBeUndefined();
    });

    it('should return undefined for a missing provider', () => {
      expect(aiProviderSelectors.providerConfigById('nope')(mockState)).toBeUndefined();
    });
  });

  describe('isProviderHasBuiltinSearch', () => {
    it('should return true when searchMode is configured', () => {
      expect(aiProviderSelectors.isProviderHasBuiltinSearch('provider1')(mockState)).toBe(true);
    });

    it('should return false when searchMode is missing', () => {
      expect(aiProviderSelectors.isProviderHasBuiltinSearch('provider2')(mockState)).toBe(false);
      expect(aiProviderSelectors.isProviderHasBuiltinSearch('nope')(mockState)).toBe(false);
    });
  });

  describe('isProviderHasBuiltinSearchConfig', () => {
    it('should return true when searchMode is a non-internal mode', () => {
      expect(aiProviderSelectors.isProviderHasBuiltinSearchConfig('provider1')(mockState)).toBe(
        true,
      );
    });

    it('should return false for internal mode or missing config', () => {
      const state = {
        ...mockState,
        aiProviderRuntimeConfig: {
          p: { keyVaults: {}, settings: { searchMode: 'internal' } },
        },
      } as unknown as AIProviderStoreState;

      expect(aiProviderSelectors.isProviderHasBuiltinSearchConfig('p')(state)).toBe(false);
      expect(aiProviderSelectors.isProviderHasBuiltinSearchConfig('nope')(state)).toBe(false);
    });
  });

  describe('isProviderEnableResponseApi', () => {
    it('should return true when config explicitly sets enableResponseApi to true', () => {
      const state = {
        ...mockState,
        aiProviderRuntimeConfig: {
          test: {
            config: { enableResponseApi: true },
            keyVaults: {},
            settings: {},
          },
        },
      } as unknown as AIProviderStoreState;
      expect(aiProviderSelectors.isProviderEnableResponseApi('test')(state)).toBe(true);
    });

    it('should return false when config explicitly sets enableResponseApi to false', () => {
      const state = {
        ...mockState,
        aiProviderRuntimeConfig: {
          test: {
            config: { enableResponseApi: false },
            keyVaults: {},
            settings: {},
          },
        },
      } as unknown as AIProviderStoreState;
      expect(aiProviderSelectors.isProviderEnableResponseApi('test')(state)).toBe(false);
    });

    it('should return true by default for openai provider', () => {
      const state = {
        ...mockState,
        aiProviderRuntimeConfig: {
          openai: {
            keyVaults: {},
            settings: {},
          },
        },
      } as unknown as AIProviderStoreState;
      expect(aiProviderSelectors.isProviderEnableResponseApi('openai')(state)).toBe(true);
    });

    it('should return false by default for non-openai provider', () => {
      const state = {
        ...mockState,
        aiProviderRuntimeConfig: {
          anthropic: {
            keyVaults: {},
            settings: {},
          },
        },
      } as unknown as AIProviderStoreState;
      expect(aiProviderSelectors.isProviderEnableResponseApi('anthropic')(state)).toBe(false);
    });

    it('should return false for provider without config', () => {
      expect(aiProviderSelectors.isProviderEnableResponseApi('non-existing')(mockState)).toBe(
        false,
      );
    });
  });

  describe('isInitAiProviderRuntimeState', () => {
    it('should reflect the init flag', () => {
      expect(aiProviderSelectors.isInitAiProviderRuntimeState(mockState)).toBe(true);
      expect(
        aiProviderSelectors.isInitAiProviderRuntimeState({
          ...mockState,
          isInitAiProviderRuntimeState: false,
        }),
      ).toBe(false);
    });
  });
});
