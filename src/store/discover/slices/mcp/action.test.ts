import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { discoverService } from '@/services/discover';
import { globalHelpers } from '@/store/global/helpers';

import { useDiscoverStore as useStore } from '../../store';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MCPAction', () => {
  describe('useFetchMcpDetail', () => {
    it('should fetch MCP detail when identifier is provided', async () => {
      const mockDetail = {
        identifier: 'test-mcp',
        name: 'Test MCP',
        description: 'A test MCP server',
      };

      vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockDetail as any);
      vi.spyOn(globalHelpers, 'getCurrentLanguage').mockReturnValue('en-US');

      const params = { identifier: 'test-mcp', version: '1.0.0' };
      const { result } = renderHook(() => useStore.getState().useFetchMcpDetail(params));

      await waitFor(() => {
        expect(result.current.data).toEqual(mockDetail);
      });

      expect(discoverService.getMcpDetail).toHaveBeenCalledWith(params);
    });

    it('should not fetch when identifier is undefined', () => {
      const { result } = renderHook(() =>
        useStore.getState().useFetchMcpDetail({ identifier: undefined }),
      );

      expect(result.current.data).toBeUndefined();
      expect(discoverService.getMcpDetail).not.toHaveBeenCalled();
    });
  });
});
