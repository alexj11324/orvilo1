import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { discoverService } from '@/services/discover';
import { globalHelpers } from '@/store/global/helpers';

import { useDiscoverStore as useStore } from '../../store';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PluginAction', () => {
  describe('usePluginDetail', () => {
    it('should fetch plugin detail when identifier is provided', async () => {
      const mockDetail = {
        identifier: 'test-plugin',
        name: 'Test Plugin',
        description: 'A test plugin',
      };

      vi.spyOn(discoverService, 'getPluginDetail').mockResolvedValue(mockDetail as any);
      vi.spyOn(globalHelpers, 'getCurrentLanguage').mockReturnValue('en-US');

      const params = { identifier: 'test-plugin', withManifest: true };
      const { result } = renderHook(() => useStore.getState().usePluginDetail(params));

      await waitFor(() => {
        expect(result.current.data).toEqual(mockDetail);
      });

      expect(discoverService.getPluginDetail).toHaveBeenCalledWith(params);
    });

    it('should not fetch when identifier is undefined', () => {
      const { result } = renderHook(() =>
        useStore.getState().usePluginDetail({ identifier: undefined }),
      );

      expect(result.current.data).toBeUndefined();
      expect(discoverService.getPluginDetail).not.toHaveBeenCalled();
    });
  });
});
