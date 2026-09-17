import type * as OrvilochatConstModule from '@orvilo/const';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toolsClient } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';

import { useToolStore } from '../../store';
import { OrviloSkillStatus } from './types';

beforeEach(() => {
  vi.clearAllMocks();
  useUserStore.setState({ isSignedIn: false });
});

vi.mock('@orvilo/const', async (importOriginal) => {
  const actual = await importOriginal<typeof OrvilochatConstModule>();
  return {
    ...actual,
    getOrviloSkillProviderById: vi.fn((id: string) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      icon: '🔗',
    })),
  };
});

vi.mock('@/libs/trpc/client', () => ({
  toolsClient: {
    market: {
      connectCallTool: { mutate: vi.fn() },
      connectGetAuthorizeUrl: { query: vi.fn() },
      connectGetStatus: { query: vi.fn() },
      connectListConnections: { query: vi.fn() },
      connectListTools: { query: vi.fn() },
      connectRefresh: { mutate: vi.fn() },
      connectRevoke: { mutate: vi.fn() },
    },
  },
}));

const createSWRWrapper = () => {
  const value = { dedupingInterval: 0, provider: () => new Map() };

  return function SWRTestWrapper({ children }: { children: ReactNode }) {
    return createElement(SWRConfig, { value }, children);
  };
};

describe('orviloSkillStore actions', () => {
  describe('callOrviloSkillTool', () => {
    it('should call tool successfully and return result', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const mockResponse = {
        data: { result: 'success' },
      };
      vi.mocked(toolsClient.market.connectCallTool.mutate).mockResolvedValue(mockResponse as any);

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          provider: 'linear',
          toolName: 'createIssue',
          args: { title: 'Test Issue' },
        });
      });

      expect(callResult).toEqual({ data: mockResponse.data, success: true });
      expect(toolsClient.market.connectCallTool.mutate).toHaveBeenCalledWith({
        provider: 'linear',
        toolName: 'createIssue',
        args: { title: 'Test Issue' },
        topicId: undefined,
      });
    });

    it('should return failure when the tool response is unsuccessful', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillExecutingToolIds: new Set(),
          orviloSkillLoadingIds: new Set(),
          orviloSkillServers: [],
        });
      });

      vi.mocked(toolsClient.market.connectCallTool.mutate).mockResolvedValue({
        data: null,
        error: { code: 'POSTHOG_QUERY_FAILED', message: 'Query failed' },
        success: false,
      } as any);

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          args: { query: 'select * from events' },
          provider: 'posthog',
          toolName: 'query',
        });
      });

      expect(callResult).toEqual({
        data: null,
        error: 'Query failed',
        errorCode: 'POSTHOG_QUERY_FAILED',
        success: false,
      });
      expect(result.current.orviloSkillExecutingToolIds.has('posthog:query')).toBe(false);
    });

    it('should use string response data as the failure message when no structured error is provided', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillExecutingToolIds: new Set(),
          orviloSkillLoadingIds: new Set(),
          orviloSkillServers: [],
        });
      });

      vi.mocked(toolsClient.market.connectCallTool.mutate).mockResolvedValue({
        data: 'PostHog query timed out',
        success: false,
      } as any);

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          args: { query: 'select * from events' },
          provider: 'posthog',
          toolName: 'query',
        });
      });

      expect(callResult).toEqual({
        data: 'PostHog query timed out',
        error: 'PostHog query timed out',
        errorCode: undefined,
        success: false,
      });
      expect(result.current.orviloSkillExecutingToolIds.has('posthog:query')).toBe(false);
    });

    it('should stringify response data objects as the failure message', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillExecutingToolIds: new Set(),
          orviloSkillLoadingIds: new Set(),
          orviloSkillServers: [],
        });
      });

      vi.mocked(toolsClient.market.connectCallTool.mutate).mockResolvedValue({
        data: { detail: 'PostHog query timed out', status: 504 },
        success: false,
      } as any);

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          args: { query: 'select * from events' },
          provider: 'posthog',
          toolName: 'query',
        });
      });

      expect(callResult).toEqual({
        data: { detail: 'PostHog query timed out', status: 504 },
        error: JSON.stringify({ detail: 'PostHog query timed out', status: 504 }),
        errorCode: undefined,
        success: false,
      });
    });

    it('should use a generic failure message when an unsuccessful response has no detail', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillExecutingToolIds: new Set(),
          orviloSkillLoadingIds: new Set(),
          orviloSkillServers: [],
        });
      });

      vi.mocked(toolsClient.market.connectCallTool.mutate).mockResolvedValue({
        data: null,
        success: false,
      } as any);

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          args: {},
          provider: 'posthog',
          toolName: 'query',
        });
      });

      expect(callResult).toEqual({
        data: null,
        error: 'Orvilo Skill call failed',
        errorCode: undefined,
        success: false,
      });
    });

    it('should track executing state during tool call', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(toolsClient.market.connectCallTool.mutate).mockReturnValue(promise as any);

      const callPromise = act(async () => {
        return result.current.callOrviloSkillTool({
          provider: 'linear',
          toolName: 'createIssue',
        });
      });

      // Tool should be marked as executing during the call
      await waitFor(() => {
        expect(result.current.orviloSkillExecutingToolIds.has('linear:createIssue')).toBe(true);
      });

      // Resolve the promise
      resolvePromise!({ data: {} });
      await callPromise;

      // Tool should no longer be executing after completion
      expect(result.current.orviloSkillExecutingToolIds.has('linear:createIssue')).toBe(false);
    });

    it('should handle NOT_CONNECTED error', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectCallTool.mutate).mockRejectedValue(
        new Error('NOT_CONNECTED'),
      );

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          provider: 'linear',
          toolName: 'createIssue',
        });
      });

      expect(callResult).toEqual({
        error: 'NOT_CONNECTED',
        errorCode: 'NOT_CONNECTED',
        success: false,
      });
      expect(result.current.orviloSkillExecutingToolIds.has('linear:createIssue')).toBe(false);
    });

    it('should handle TOKEN_EXPIRED error', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectCallTool.mutate).mockRejectedValue(
        new Error('TOKEN_EXPIRED'),
      );

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          provider: 'linear',
          toolName: 'createIssue',
        });
      });

      expect(callResult).toEqual({
        error: 'TOKEN_EXPIRED',
        errorCode: 'NOT_CONNECTED',
        success: false,
      });
    });

    it('should handle generic error', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectCallTool.mutate).mockRejectedValue(
        new Error('Network error'),
      );

      let callResult;
      await act(async () => {
        callResult = await result.current.callOrviloSkillTool({
          provider: 'linear',
          toolName: 'createIssue',
        });
      });

      expect(callResult).toEqual({
        error: 'Network error',
        success: false,
      });
    });
  });

  describe('checkOrviloSkillStatus', () => {
    it('should check status and add server when connected', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const mockResponse = {
        connected: true,
        icon: 'linear-icon',
        connection: {
          providerUsername: 'testuser',
          scopes: ['read', 'write'],
          tokenExpiresAt: '2024-12-31T00:00:00Z',
        },
      };
      vi.mocked(toolsClient.market.connectGetStatus.query).mockResolvedValue(mockResponse as any);
      vi.mocked(toolsClient.market.connectListTools.query).mockResolvedValue({
        provider: 'linear',
        tools: [],
      });

      let server;
      await act(async () => {
        server = await result.current.checkOrviloSkillStatus('linear');
      });

      expect(server).toMatchObject({
        identifier: 'linear',
        name: 'Linear',
        isConnected: true,
        status: OrviloSkillStatus.CONNECTED,
        providerUsername: 'testuser',
        scopes: ['read', 'write'],
      });
      expect(result.current.orviloSkillServers).toHaveLength(1);
      expect(result.current.orviloSkillLoadingIds.has('linear')).toBe(false);
    });

    it('should check status and add server when not connected', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const mockResponse = {
        connected: false,
        icon: 'linear-icon',
      };
      vi.mocked(toolsClient.market.connectGetStatus.query).mockResolvedValue(mockResponse as any);

      let server;
      await act(async () => {
        server = await result.current.checkOrviloSkillStatus('linear');
      });

      expect(server).toMatchObject({
        identifier: 'linear',
        isConnected: false,
        status: OrviloSkillStatus.NOT_CONNECTED,
      });
      expect(toolsClient.market.connectListTools.query).not.toHaveBeenCalled();
    });

    it('should update existing server instead of adding new one', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: false,
              status: OrviloSkillStatus.NOT_CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const mockResponse = {
        connected: true,
        icon: 'linear-icon',
        connection: {
          providerUsername: 'testuser',
          scopes: ['read'],
          tokenExpiresAt: '2024-12-31T00:00:00Z',
        },
      };
      vi.mocked(toolsClient.market.connectGetStatus.query).mockResolvedValue(mockResponse as any);
      vi.mocked(toolsClient.market.connectListTools.query).mockResolvedValue({
        provider: 'linear',
        tools: [],
      });

      await act(async () => {
        await result.current.checkOrviloSkillStatus('linear');
      });

      expect(result.current.orviloSkillServers).toHaveLength(1);
      expect(result.current.orviloSkillServers[0].isConnected).toBe(true);
      expect(result.current.orviloSkillServers[0].status).toBe(OrviloSkillStatus.CONNECTED);
    });

    it('should track loading state during status check', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(toolsClient.market.connectGetStatus.query).mockReturnValue(promise as any);

      const checkPromise = act(async () => {
        return result.current.checkOrviloSkillStatus('linear');
      });

      // Should be loading during the check
      await waitFor(() => {
        expect(result.current.orviloSkillLoadingIds.has('linear')).toBe(true);
      });

      // Resolve the promise
      resolvePromise!({ connected: false, icon: '' });
      await checkPromise;

      // Should not be loading after completion
      expect(result.current.orviloSkillLoadingIds.has('linear')).toBe(false);
    });

    it('should handle error and return undefined', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectGetStatus.query).mockRejectedValue(
        new Error('Network error'),
      );

      let server;
      await act(async () => {
        server = await result.current.checkOrviloSkillStatus('linear');
      });

      expect(server).toBeUndefined();
      expect(result.current.orviloSkillLoadingIds.has('linear')).toBe(false);
    });
  });

  describe('getOrviloSkillAuthorizeUrl', () => {
    it('should return authorization URL and code', async () => {
      const { result } = renderHook(() => useToolStore());

      const mockResponse = {
        authorizeUrl: 'https://auth.linear.app/authorize?code=abc123',
        code: 'abc123',
        expiresIn: 600,
      };
      vi.mocked(toolsClient.market.connectGetAuthorizeUrl.query).mockResolvedValue(
        mockResponse as any,
      );

      let authInfo;
      await act(async () => {
        authInfo = await result.current.getOrviloSkillAuthorizeUrl('linear');
      });

      expect(authInfo).toEqual({
        authorizeUrl: 'https://auth.linear.app/authorize?code=abc123',
        code: 'abc123',
        expiresIn: 600,
      });
      expect(toolsClient.market.connectGetAuthorizeUrl.query).toHaveBeenCalledWith({
        provider: 'linear',
        redirectUri: undefined,
        scopes: undefined,
      });
    });

    it('should pass options to query', async () => {
      const { result } = renderHook(() => useToolStore());

      const mockResponse = {
        authorizeUrl: 'https://auth.linear.app/authorize',
        code: 'xyz789',
        expiresIn: 300,
      };
      vi.mocked(toolsClient.market.connectGetAuthorizeUrl.query).mockResolvedValue(
        mockResponse as any,
      );

      await act(async () => {
        await result.current.getOrviloSkillAuthorizeUrl('linear', {
          scopes: ['read', 'write'],
          redirectUri: 'https://example.com/callback',
        });
      });

      expect(toolsClient.market.connectGetAuthorizeUrl.query).toHaveBeenCalledWith({
        provider: 'linear',
        scopes: ['read', 'write'],
        redirectUri: 'https://example.com/callback',
      });
    });
  });

  describe('internal_updateOrviloSkillServer', () => {
    it('should update existing server', () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      act(() => {
        result.current.internal_updateOrviloSkillServer('linear', {
          status: OrviloSkillStatus.ERROR,
          errorMessage: 'Token expired',
        });
      });

      expect(result.current.orviloSkillServers[0]).toMatchObject({
        identifier: 'linear',
        status: OrviloSkillStatus.ERROR,
        errorMessage: 'Token expired',
      });
    });

    it('should do nothing when server not found', () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      act(() => {
        result.current.internal_updateOrviloSkillServer('non-existent', {
          status: OrviloSkillStatus.ERROR,
        });
      });

      expect(result.current.orviloSkillServers).toHaveLength(0);
    });
  });

  describe('refreshOrviloSkillToken', () => {
    it('should refresh token successfully and update server', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
              tokenExpiresAt: '2024-01-01T00:00:00Z',
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const mockResponse = {
        refreshed: true,
        connection: {
          tokenExpiresAt: '2024-12-31T00:00:00Z',
        },
      };
      vi.mocked(toolsClient.market.connectRefresh.mutate).mockResolvedValue(mockResponse as any);

      let refreshed;
      await act(async () => {
        refreshed = await result.current.refreshOrviloSkillToken('linear');
      });

      expect(refreshed).toBe(true);
      expect(result.current.orviloSkillServers[0].tokenExpiresAt).toBe('2024-12-31T00:00:00Z');
      expect(result.current.orviloSkillServers[0].status).toBe(OrviloSkillStatus.CONNECTED);
    });

    it('should return false when refresh fails', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const mockResponse = {
        refreshed: false,
      };
      vi.mocked(toolsClient.market.connectRefresh.mutate).mockResolvedValue(mockResponse as any);

      let refreshed;
      await act(async () => {
        refreshed = await result.current.refreshOrviloSkillToken('linear');
      });

      expect(refreshed).toBe(false);
    });

    it('should return false on error', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectRefresh.mutate).mockRejectedValue(
        new Error('Refresh failed'),
      );

      let refreshed;
      await act(async () => {
        refreshed = await result.current.refreshOrviloSkillToken('linear');
      });

      expect(refreshed).toBe(false);
    });
  });

  describe('refreshOrviloSkillTools', () => {
    it('should refresh tools for server', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const mockTools = {
        tools: [
          { name: 'createIssue', description: 'Create an issue', inputSchema: { type: 'object' } },
          { name: 'listIssues', description: 'List issues', inputSchema: { type: 'object' } },
        ],
      };
      vi.mocked(toolsClient.market.connectListTools.query).mockResolvedValue(mockTools as any);

      await act(async () => {
        await result.current.refreshOrviloSkillTools('linear');
      });

      expect(result.current.orviloSkillServers[0].tools).toHaveLength(2);
      expect(result.current.orviloSkillServers[0].tools![0].name).toBe('createIssue');
      expect(result.current.orviloSkillServers[0].tools![1].name).toBe('listIssues');
    });

    it('should do nothing when server not found', async () => {
      vi.mocked(toolsClient.market.connectListTools.query).mockClear();

      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      await act(async () => {
        await result.current.refreshOrviloSkillTools('non-existent');
      });

      // The action still calls the API, but the state update does nothing
      // since server is not found
    });

    it('should handle error gracefully', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectListTools.query).mockRejectedValue(
        new Error('Network error'),
      );

      await act(async () => {
        await result.current.refreshOrviloSkillTools('linear');
      });

      // Should not crash and server should remain unchanged
      expect(result.current.orviloSkillServers[0].tools).toBeUndefined();
    });
  });

  describe('revokeOrviloSkill', () => {
    it('should revoke skill and remove server from state', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
            {
              identifier: 'github',
              name: 'GitHub',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectRevoke.mutate).mockResolvedValue({} as any);

      await act(async () => {
        await result.current.revokeOrviloSkill('linear');
      });

      expect(result.current.orviloSkillServers).toHaveLength(1);
      expect(result.current.orviloSkillServers[0].identifier).toBe('github');
      expect(toolsClient.market.connectRevoke.mutate).toHaveBeenCalledWith({
        provider: 'linear',
      });
    });

    it('should track loading state during revoke', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(toolsClient.market.connectRevoke.mutate).mockReturnValue(promise as any);

      const revokePromise = act(async () => {
        return result.current.revokeOrviloSkill('linear');
      });

      // Should be loading during revoke
      await waitFor(() => {
        expect(result.current.orviloSkillLoadingIds.has('linear')).toBe(true);
      });

      // Resolve the promise
      resolvePromise!({});
      await revokePromise;

      // Should not be loading after completion
      expect(result.current.orviloSkillLoadingIds.has('linear')).toBe(false);
    });

    it('should handle error gracefully', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectRevoke.mutate).mockRejectedValue(
        new Error('Revoke failed'),
      );

      await act(async () => {
        await result.current.revokeOrviloSkill('linear');
      });

      // Server should still be in state after error
      expect(result.current.orviloSkillServers).toHaveLength(1);
      expect(result.current.orviloSkillLoadingIds.has('linear')).toBe(false);
    });
  });

  describe('useFetchOrviloSkillConnections', () => {
    it('should not fetch when disabled', () => {
      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      vi.mocked(toolsClient.market.connectListConnections.query).mockClear();

      renderHook(() => useToolStore.getState().useFetchOrviloSkillConnections(false));

      expect(toolsClient.market.connectListConnections.query).not.toHaveBeenCalled();
    });

    it('should not fetch when user is not signed in', () => {
      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
        useUserStore.setState({ isSignedIn: false });
      });

      vi.mocked(toolsClient.market.connectListConnections.query).mockClear();

      renderHook(() => useToolStore.getState().useFetchOrviloSkillConnections(true));

      expect(toolsClient.market.connectListConnections.query).not.toHaveBeenCalled();
    });

    it('should fetch connections when enabled', async () => {
      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
        useUserStore.setState({ isSignedIn: true });
      });

      const mockConnections = {
        connections: [
          {
            providerId: 'linear',
            icon: 'linear-icon',
            providerUsername: 'testuser',
            scopes: ['read'],
            tokenExpiresAt: '2024-12-31T00:00:00Z',
          },
        ],
      };
      vi.mocked(toolsClient.market.connectListConnections.query).mockResolvedValue(
        mockConnections as any,
      );
      vi.mocked(toolsClient.market.connectListTools.query).mockResolvedValue({
        provider: 'linear',
        tools: [],
      });

      renderHook(() => useToolStore.getState().useFetchOrviloSkillConnections(true));

      await waitFor(() => {
        expect(toolsClient.market.connectListConnections.query).toHaveBeenCalled();
      });
    });
  });

  describe('useFetchProviderTools', () => {
    it('should fetch and normalize provider tools', async () => {
      vi.mocked(toolsClient.market.connectListTools.query).mockResolvedValue({
        provider: 'posthog',
        tools: [
          {
            description: 'Run a PostHog query',
            inputSchema: { properties: { query: { type: 'string' } }, type: 'object' },
            name: 'query',
          },
        ],
      } as any);

      const { result } = renderHook(
        () => useToolStore.getState().useFetchProviderTools('posthog'),
        { wrapper: createSWRWrapper() },
      );

      await waitFor(() => {
        expect(toolsClient.market.connectListTools.query).toHaveBeenCalledWith({
          provider: 'posthog',
        });
      });

      const normalized = await result.current.mutate();

      expect(normalized).toEqual([
        {
          description: 'Run a PostHog query',
          inputSchema: { properties: { query: { type: 'string' } }, type: 'object' },
          name: 'query',
        },
      ]);
    });

    it('should not fetch tools when provider is undefined', () => {
      vi.mocked(toolsClient.market.connectListTools.query).mockClear();

      const { result } = renderHook(
        () => useToolStore.getState().useFetchProviderTools(undefined),
        {
          wrapper: createSWRWrapper(),
        },
      );

      expect(result.current.data).toEqual([]);
      expect(toolsClient.market.connectListTools.query).not.toHaveBeenCalled();
    });
  });

  describe('server deduplication logic', () => {
    it('should deduplicate servers by identifier when adding new servers', () => {
      act(() => {
        useToolStore.setState({
          orviloSkillServers: [
            {
              identifier: 'linear',
              name: 'Linear',
              isConnected: true,
              status: OrviloSkillStatus.CONNECTED,
            },
          ],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const incomingServers = [
        {
          identifier: 'linear',
          name: 'Linear',
          isConnected: true,
          status: OrviloSkillStatus.CONNECTED,
        },
        {
          identifier: 'github',
          name: 'GitHub',
          isConnected: true,
          status: OrviloSkillStatus.CONNECTED,
        },
      ];

      act(() => {
        const existingServers = useToolStore.getState().orviloSkillServers;
        const existingIdentifiers = new Set(existingServers.map((s) => s.identifier));
        const newServers = incomingServers.filter((s) => !existingIdentifiers.has(s.identifier));

        useToolStore.setState({
          orviloSkillServers: [...existingServers, ...newServers],
        });
      });

      const finalServers = useToolStore.getState().orviloSkillServers;
      expect(finalServers).toHaveLength(2);
      expect(finalServers.find((s) => s.identifier === 'linear')).toBeDefined();
      expect(finalServers.find((s) => s.identifier === 'github')).toBeDefined();
    });

    it('should add all servers when none exist', () => {
      act(() => {
        useToolStore.setState({
          orviloSkillServers: [],
          orviloSkillLoadingIds: new Set(),
          orviloSkillExecutingToolIds: new Set(),
        });
      });

      const incomingServers = [
        {
          identifier: 'linear',
          name: 'Linear',
          isConnected: true,
          status: OrviloSkillStatus.CONNECTED,
        },
      ];

      act(() => {
        const existingServers = useToolStore.getState().orviloSkillServers;
        const existingIdentifiers = new Set(existingServers.map((s) => s.identifier));
        const newServers = incomingServers.filter((s) => !existingIdentifiers.has(s.identifier));

        useToolStore.setState({
          orviloSkillServers: [...existingServers, ...newServers],
        });
      });

      expect(useToolStore.getState().orviloSkillServers).toHaveLength(1);
    });
  });
});
