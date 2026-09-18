import { toast } from '@lobehub/ui/base-ui';
import { act, renderHook, waitFor } from '@testing-library/react';
import type * as I18nextModule from 'i18next';
import { t } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SwrModule from '@/libs/swr';
import { mutate } from '@/libs/swr';
import { aiModelService } from '@/services/aiModel';
import { withSWR } from '~test-utils';

import { useAiInfraStore as useStore } from '../../store';
import { aiModelSelectors } from './selectors';

vi.mock('i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nextModule>();
  return {
    ...actual,
    t: vi.fn((key: string) => key),
  };
});

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('~base-ui-stubs')).baseUiStubs,
}));

vi.mock('@/libs/swr', async (importOriginal) => {
  const actual = await importOriginal<typeof SwrModule>();
  return {
    ...actual,
    mutate: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();

  // Reset store to initial state
  act(() => {
    useStore.setState({
      aiModelLoadingIds: [],
      modelReasoningConfigMap: {},
      modelReasoningConfigUpdatingKeys: [],
      refreshAiProviderRuntimeState: vi.fn(),
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});


  describe('internal_toggleAiModelLoading', () => {
    it('should add model id to loading list when loading is true', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.internal_toggleAiModelLoading('model-1', true);
      });

      expect(result.current.aiModelLoadingIds).toContain('model-1');
    });

    it('should remove model id from loading list when loading is false', () => {
      act(() => {
        useStore.setState({ aiModelLoadingIds: ['model-1', 'model-2'] });
      });

      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.internal_toggleAiModelLoading('model-1', false);
      });

      expect(result.current.aiModelLoadingIds).not.toContain('model-1');
      expect(result.current.aiModelLoadingIds).toContain('model-2');
    });

    it('should handle multiple loading states', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.internal_toggleAiModelLoading('model-1', true);
        result.current.internal_toggleAiModelLoading('model-2', true);
      });

      expect(result.current.aiModelLoadingIds).toEqual(['model-1', 'model-2']);

      act(() => {
        result.current.internal_toggleAiModelLoading('model-1', false);
      });

      expect(result.current.aiModelLoadingIds).toEqual(['model-2']);
    });
  });

  describe('updateModelReasoningConfig', () => {
    it('should optimistically merge the value and persist it via the service', async () => {
      act(() => {
        useStore.setState({
          modelReasoningConfigMap: { 'openai/gpt-5.2': { reasoningEffort: 'low' } },
        });
      });

      const { result } = renderHook(() => useStore());
      const serviceSpy = vi
        .spyOn(aiModelService, 'updateAiModelReasoningConfig')
        .mockResolvedValue(undefined as any);

      await act(async () => {
        await result.current.updateModelReasoningConfig('gpt-5.2', 'openai', {
          gpt5_2ReasoningEffort: 'high',
        });
      });

      expect(serviceSpy).toHaveBeenCalledWith('gpt-5.2', 'openai', {
        gpt5_2ReasoningEffort: 'high',
      });
      // merged with the previous value, not replaced
      expect(useStore.getState().modelReasoningConfigMap['openai/gpt-5.2']).toEqual({
        gpt5_2ReasoningEffort: 'high',
        reasoningEffort: 'low',
      });
      expect(useStore.getState().modelReasoningConfigUpdatingKeys).toEqual([]);
      expect(mutate).toHaveBeenCalledWith(['aiModel:reasoningConfig', 'openai', 'gpt-5.2']);
    });

    it('should clear the updating marker before revalidating', async () => {
      const { result } = renderHook(() => useStore());
      vi.spyOn(aiModelService, 'updateAiModelReasoningConfig').mockResolvedValue(undefined as any);

      // The fetch hook's onSuccess skips writes while the key is marked
      // updating, so revalidating before the marker clears would discard the
      // server-merged config (sibling fields preserved by the partial write)
      const updatingKeysAtMutate: string[][] = [];
      vi.mocked(mutate).mockImplementationOnce(async () => {
        updatingKeysAtMutate.push([...useStore.getState().modelReasoningConfigUpdatingKeys]);
        return undefined as any;
      });

      await act(async () => {
        await result.current.updateModelReasoningConfig('gpt-5.2', 'openai', {
          gpt5_2ReasoningEffort: 'high',
        });
      });

      expect(updatingKeysAtMutate).toEqual([[]]);
    });

    it('should rollback the optimistic value and toast on failure', async () => {
      act(() => {
        useStore.setState({
          modelReasoningConfigMap: { 'openai/gpt-5.2': { reasoningEffort: 'low' } },
        });
      });

      const { result } = renderHook(() => useStore());
      vi.spyOn(aiModelService, 'updateAiModelReasoningConfig').mockRejectedValue(
        new Error('Service error'),
      );

      await expect(async () => {
        await act(async () => {
          await result.current.updateModelReasoningConfig('gpt-5.2', 'openai', {
            gpt5_2ReasoningEffort: 'high',
          });
        });
      }).rejects.toThrow('Service error');

      expect(useStore.getState().modelReasoningConfigMap['openai/gpt-5.2']).toEqual({
        reasoningEffort: 'low',
      });
      expect(useStore.getState().modelReasoningConfigUpdatingKeys).toEqual([]);
      expect(toast.error).toHaveBeenCalledWith(t('reasoningEffort.updateFailed', { ns: 'chat' }));
    });

    it('should drop the key on failed rollback when it was not cached before', async () => {
      const { result } = renderHook(() => useStore());
      vi.spyOn(aiModelService, 'updateAiModelReasoningConfig').mockRejectedValue(
        new Error('Service error'),
      );

      await expect(async () => {
        await act(async () => {
          await result.current.updateModelReasoningConfig('gpt-5.2', 'openai', {
            gpt5_2ReasoningEffort: 'high',
          });
        });
      }).rejects.toThrow('Service error');

      // A leftover `[key]: undefined` would make ensureModelReasoningConfig
      // treat the key as cached and never fetch the saved server value
      expect('openai/gpt-5.2' in useStore.getState().modelReasoningConfigMap).toBe(false);
    });
  });

  describe('ensureModelReasoningConfig', () => {
    beforeEach(() => {
      vi.spyOn(aiModelSelectors, 'isModelHasReasoningExtendParams').mockReturnValue(() => true);
      // Make the runtime-state warm-up a no-op so tests exercise the fetch logic
      act(() => {
        useStore.setState({ isInitAiProviderRuntimeState: true });
      });
    });

    it('should skip the fetch for models without reasoning extend params', async () => {
      vi.spyOn(aiModelSelectors, 'isModelHasReasoningExtendParams').mockReturnValue(() => false);

      const { result } = renderHook(() => useStore());
      const serviceSpy = vi.spyOn(aiModelService, 'getAiModelReasoningConfig');

      await act(async () => {
        await result.current.ensureModelReasoningConfig('gpt-4o', 'openai');
      });

      expect(serviceSpy).not.toHaveBeenCalled();
    });

    it('should fetch and cache the config when the key is absent', async () => {
      const { result } = renderHook(() => useStore());
      const serviceSpy = vi
        .spyOn(aiModelService, 'getAiModelReasoningConfig')
        .mockResolvedValue({ reasoningEffort: 'high' });

      await act(async () => {
        await result.current.ensureModelReasoningConfig('gpt-5.2', 'openai');
      });

      expect(serviceSpy).toHaveBeenCalledWith('gpt-5.2', 'openai');
      expect(useStore.getState().modelReasoningConfigMap['openai/gpt-5.2']).toEqual({
        reasoningEffort: 'high',
      });
    });

    it('should keep the key for an empty config so it is not refetched', async () => {
      const { result } = renderHook(() => useStore());
      const serviceSpy = vi
        .spyOn(aiModelService, 'getAiModelReasoningConfig')
        .mockResolvedValue(undefined);

      await act(async () => {
        await result.current.ensureModelReasoningConfig('gpt-5.2', 'openai');
        await result.current.ensureModelReasoningConfig('gpt-5.2', 'openai');
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);
      expect('openai/gpt-5.2' in useStore.getState().modelReasoningConfigMap).toBe(true);
    });

    it('should not fetch when the config is already cached', async () => {
      act(() => {
        useStore.setState({
          modelReasoningConfigMap: { 'openai/gpt-5.2': { reasoningEffort: 'low' } },
        });
      });

      const { result } = renderHook(() => useStore());
      const serviceSpy = vi.spyOn(aiModelService, 'getAiModelReasoningConfig');

      await act(async () => {
        await result.current.ensureModelReasoningConfig('gpt-5.2', 'openai');
      });

      expect(serviceSpy).not.toHaveBeenCalled();
      expect(useStore.getState().modelReasoningConfigMap['openai/gpt-5.2']).toEqual({
        reasoningEffort: 'low',
      });
    });

    it('should swallow fetch failures', async () => {
      const { result } = renderHook(() => useStore());
      vi.spyOn(aiModelService, 'getAiModelReasoningConfig').mockRejectedValue(
        new Error('Service error'),
      );

      await act(async () => {
        await expect(
          result.current.ensureModelReasoningConfig('gpt-5.2', 'openai'),
        ).resolves.toBeUndefined();
      });

      expect('openai/gpt-5.2' in useStore.getState().modelReasoningConfigMap).toBe(false);
    });
  });

  describe('useFetchAiModelReasoningConfig', () => {
    it('should fetch the reasoning config and write it to the store map', async () => {
      vi.spyOn(aiModelService, 'getAiModelReasoningConfig').mockResolvedValue({
        gpt5_2ReasoningEffort: 'high',
      });

      const { result } = renderHook(
        () => useStore.getState().useFetchAiModelReasoningConfig('gpt-5.2', 'openai'),
        { wrapper: withSWR },
      );

      await waitFor(() => {
        expect(result.current.data).toEqual({ gpt5_2ReasoningEffort: 'high' });
      });

      expect(aiModelService.getAiModelReasoningConfig).toHaveBeenCalledWith('gpt-5.2', 'openai');
      expect(useStore.getState().modelReasoningConfigMap['openai/gpt-5.2']).toEqual({
        gpt5_2ReasoningEffort: 'high',
      });
    });

    it('should not fetch when model or provider is missing', () => {
      const serviceSpy = vi.spyOn(aiModelService, 'getAiModelReasoningConfig');

      renderHook(() => useStore.getState().useFetchAiModelReasoningConfig(undefined, 'openai'), {
        wrapper: withSWR,
      });

      expect(serviceSpy).not.toHaveBeenCalled();
    });

    it('should not clobber an in-flight optimistic value', async () => {
      act(() => {
        useStore.setState({
          modelReasoningConfigMap: { 'openai/gpt-5.2': { gpt5_2ReasoningEffort: 'high' } },
          modelReasoningConfigUpdatingKeys: ['openai/gpt-5.2'],
        });
      });

      vi.spyOn(aiModelService, 'getAiModelReasoningConfig').mockResolvedValue({
        gpt5_2ReasoningEffort: 'low',
      });

      renderHook(() => useStore.getState().useFetchAiModelReasoningConfig('gpt-5.2', 'openai'), {
        wrapper: withSWR,
      });

      await waitFor(() => {
        expect(aiModelService.getAiModelReasoningConfig).toHaveBeenCalled();
      });

      expect(useStore.getState().modelReasoningConfigMap['openai/gpt-5.2']).toEqual({
        gpt5_2ReasoningEffort: 'high',
      });
    });
  });

  describe('useFetchAiModelReasoningConfig', () => {
    it('resolves a missing config as null so SWR data is never undefined', async () => {
      // The server legitimately returns nothing when the user never customized
      // this model's reasoning params; `null` keeps that distinguishable from a
      // fetch that has not settled yet.
      vi.spyOn(aiModelService, 'getAiModelReasoningConfig').mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useStore.getState().useFetchAiModelReasoningConfig('test-model', 'test-provider'),
        { wrapper: withSWR },
      );

      await waitFor(() => expect(result.current.data).toBeNull());
      expect(aiModelService.getAiModelReasoningConfig).toHaveBeenCalledTimes(1);
      // The store map keeps its `| undefined` contract — null never leaks in.
      expect(
        useStore.getState().modelReasoningConfigMap['test-provider/test-model'],
      ).toBeUndefined();
    });
  });
});