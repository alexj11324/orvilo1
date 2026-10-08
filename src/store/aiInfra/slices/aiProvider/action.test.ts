import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiProviderService } from '@/services/aiProvider';
import { useAiInfraStore } from '@/store/aiInfra';

describe('AiProviderAction', () => {
  describe('createNewAiProvider', () => {
    afterEach(() => vi.restoreAllMocks());

    it('propagates a failed write without refreshing', async () => {
      const error = new Error('create failed');
      vi.spyOn(aiProviderService, 'createAiProvider').mockRejectedValue(error);
      const refresh = vi.spyOn(useAiInfraStore.getState(), 'refreshAiProviderList');
      await expect(
        useAiInfraStore.getState().createNewAiProvider({ id: 'custom', name: 'Custom' }),
      ).rejects.toBe(error);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('does not report a committed provider as uncreated when refresh fails', async () => {
      vi.spyOn(aiProviderService, 'createAiProvider').mockResolvedValue({} as never);
      vi.spyOn(useAiInfraStore.getState(), 'refreshAiProviderList').mockRejectedValue(
        new Error('refresh failed'),
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        useAiInfraStore.getState().createNewAiProvider({ id: 'custom', name: 'Custom' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('ensureAiProviderRuntimeStateReady', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
      useAiInfraStore.setState({ isInitAiProviderRuntimeState: false });
    });

    it('resolves immediately without refreshing when the runtime-state is already loaded', async () => {
      const refresh = vi.fn(async () => {});
      useAiInfraStore.setState({
        isInitAiProviderRuntimeState: true,
        refreshAiProviderRuntimeState: refresh,
      });

      await useAiInfraStore.getState().ensureAiProviderRuntimeStateReady();

      expect(refresh).not.toHaveBeenCalled();
    });

    it('triggers a refresh and awaits it when the runtime-state is not loaded', async () => {
      const refresh = vi.fn(async () => {});
      useAiInfraStore.setState({
        isInitAiProviderRuntimeState: false,
        refreshAiProviderRuntimeState: refresh,
      });

      await useAiInfraStore.getState().ensureAiProviderRuntimeStateReady();

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('falls back after the timeout when the refresh never settles', async () => {
      vi.useFakeTimers();
      // A refresh that never resolves — e.g. still gated behind an unresolved
      // auth session. The caller must not be blocked forever.
      const refresh = vi.fn(() => new Promise<void>(() => {}));
      useAiInfraStore.setState({
        isInitAiProviderRuntimeState: false,
        refreshAiProviderRuntimeState: refresh,
      });

      const pending = useAiInfraStore.getState().ensureAiProviderRuntimeStateReady(1000);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(pending).resolves.toBeUndefined();
    });

    it('does not reject when the refresh throws', async () => {
      const refresh = vi.fn(async () => {
        throw new Error('network down');
      });
      useAiInfraStore.setState({
        isInitAiProviderRuntimeState: false,
        refreshAiProviderRuntimeState: refresh,
      });

      await expect(
        useAiInfraStore.getState().ensureAiProviderRuntimeStateReady(),
      ).resolves.toBeUndefined();
    });
  });
});
