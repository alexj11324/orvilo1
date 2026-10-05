import { type ChatToolPayload, type ToolManifest } from '@orvilo/types';
import superjson from 'superjson';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mcpService } from './mcp';

const mockElectronIpc = {
  mcp: {
    callTool: vi.fn(),
    callHttpTool: vi.fn(),
    getStreamableMcpServerManifest: vi.fn(),
    getStdioMcpServerManifest: vi.fn(),
    validMcpServerInstallable: vi.fn(),
  },
};

// Bound execution devices persisted on conversations.
const mockTopicBindings = vi.hoisted(() => new Map<string, string | undefined>());

// The authoritative topic read — reached when the display cache misses. Keyed
// by topicId -> bound deviceId; `null` = topic not found/not owned (binding
// unreadable), a thrown rejection = fetch failed.
const mockTopicDetail = vi.hoisted(() => ({
  getTopicDetail: vi.fn(),
}));

// The server-side device RPC surface (`lambdaClient.device.*`) — the
// tunnel a foreign-device scope takes: query + tool-call procs forward the
// request to the named device over the gateway relay.
const mockDeviceLambda = vi.hoisted(() => ({
  callMcpTool: vi.fn(),
  checkMcpInstallable: vi.fn(),
  getStdioMcpServerManifest: vi.fn(),
  getStreamableMcpServerManifest: vi.fn(),
}));

// Local execution identity — `{localDeviceId}` means this host proved its own
// device id through the gateway handshake; `{}` is an unproven host.
const mockLocalIdentity = vi.hoisted(() => ({
  resolveLocalExecutionIdentity: vi.fn(),
}));

// Mock dependencies
vi.mock('@orvilo/const', () => ({
  CURRENT_VERSION: '1.0.0',
  isDesktop: false,
}));

vi.mock('@orvilo/utils', () => ({
  isLocalOrPrivateUrl: vi.fn((url: string) => {
    return url.includes('127.0.0.1') || url.includes('localhost') || url.includes('192.168.');
  }),
  safeParseJSON: vi.fn((str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }),
}));

vi.mock('./discover', () => ({
  discoverService: {
    safeInjectMPToken: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    device: {
      callMcpTool: { mutate: mockDeviceLambda.callMcpTool },
      checkMcpInstallable: { query: mockDeviceLambda.checkMcpInstallable },
      getStdioMcpServerManifest: { query: mockDeviceLambda.getStdioMcpServerManifest },
      getStreamableMcpServerManifest: { query: mockDeviceLambda.getStreamableMcpServerManifest },
    },
    topic: {
      getTopicDetail: { query: mockTopicDetail.getTopicDetail },
    },
  },
  toolsClient: {
    market: {
      callCloudMcpEndpoint: {
        mutate: vi.fn(),
      },
    },
    mcp: {
      callTool: {
        mutate: vi.fn(),
      },
      getStreamableMcpServerManifest: {
        query: vi.fn(),
      },
    },
  },
}));

vi.mock('@/utils/electron/ipc', () => ({
  ensureElectronIpc: () => mockElectronIpc,
}));

// Mock tool store
const mockGetToolStoreState = vi.fn();
const mockPluginSelectors = {
  getInstalledPluginById: vi.fn(),
  getCustomPluginById: vi.fn(),
};

vi.mock('@/store/tool/store', () => ({
  getToolStoreState: () => mockGetToolStoreState(),
}));

vi.mock('@/store/tool/selectors', () => ({
  pluginSelectors: mockPluginSelectors,
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    // The topic store is a DISPLAY cache: an id not paged in returns
    // `undefined` (cache MISS), which must escalate to the authoritative
    // `getTopicDetail` — it is never an answer on its own.
    getTopicById: (id: string) => () =>
      mockTopicBindings.has(id)
        ? { metadata: { executionConfig: { boundDeviceId: mockTopicBindings.get(id) } } }
        : undefined,
  },
}));

vi.mock('@/store/chat/store', () => ({
  getChatStoreState: () => ({}),
}));

vi.mock('@/services/localExecutionIdentity', () => ({
  requireProvenLocalDeviceId: vi.fn(async () => 'local-device'),
  resolveLocalExecutionIdentity: mockLocalIdentity.resolveLocalExecutionIdentity,
}));

describe('MCPService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetToolStoreState.mockReturnValue({});
    mockTopicBindings.clear();
    mockTopicDetail.getTopicDetail.mockResolvedValue(null);
    // Default: this host is a proven local execution device.
    mockLocalIdentity.resolveLocalExecutionIdentity.mockResolvedValue({
      localDeviceId: 'local-device',
    });
  });

  describe('invokeMcpToolCall', () => {
    it('should invoke tool call with installed plugin', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      const mockPlugin = {
        customParams: {
          mcp: {
            type: 'sse',
            name: 'test-plugin',
            env: { API_KEY: 'test-key' },
          },
        },
        settings: { timeout: 5000 },
        manifest: {
          meta: {
            avatar: '🧪',
            description: 'Test plugin',
            title: 'Test Plugin',
          },
          version: '1.0.0',
        },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      const mockResult = 'test result';
      vi.mocked(toolsClient.mcp.callTool.mutate).mockResolvedValue(mockResult);

      const payload: ChatToolPayload = {
        id: 'tool-call-1',
        identifier: 'test-plugin',
        apiName: 'testMethod',
        arguments: '{"param": "value"}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, { topicId: 'topic-1' });

      expect(result).toEqual(mockResult);
      expect(toolsClient.mcp.callTool.mutate).toHaveBeenCalledWith(
        {
          args: '{"param": "value"}',
          env: { timeout: 5000 },
          params: {
            type: 'sse',
            name: 'test-plugin',
            env: { API_KEY: 'test-key' },
          },
          meta: {
            customPluginInfo: undefined,
            isCustomPlugin: false,
            sessionId: 'topic-1',
            version: '1.0.0',
          },
          toolName: 'testMethod',
        },
        { signal: undefined },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should invoke tool call with custom plugin', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      const mockCustomPlugin = {
        customParams: {
          mcp: {
            type: 'streamable',
            name: 'custom-plugin',
          },
        },
        manifest: {
          meta: {
            avatar: '🎨',
            description: 'Custom plugin',
            title: 'Custom Plugin',
          },
          version: '2.0.0',
        },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => null);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => mockCustomPlugin);

      const mockResult = 'custom result';
      vi.mocked(toolsClient.mcp.callTool.mutate).mockResolvedValue(mockResult);

      const payload: ChatToolPayload = {
        id: 'tool-call-2',
        identifier: 'custom-plugin',
        apiName: 'customMethod',
        arguments: '{}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, {});

      expect(result).toEqual(mockResult);
      expect(toolsClient.mcp.callTool.mutate).toHaveBeenCalled();
    });

    it('should use the local IPC transport for a stdio plugin on the local device', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      const mockStdioPlugin = {
        customParams: {
          mcp: {
            type: 'stdio',
            command: 'node',
            args: ['script.js'],
          },
        },
        settings: {},
        manifest: {
          meta: { title: 'Stdio Plugin' },
          version: '1.0.0',
        },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockStdioPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      mockElectronIpc.mcp.callTool.mockResolvedValue('stdio result');

      const payload: ChatToolPayload = {
        id: 'tool-call-3',
        identifier: 'stdio-plugin',
        apiName: 'execute',
        arguments: '{"input": "test"}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, {
        scope: { kind: 'local' },
      });

      expect(result).toEqual('stdio result');
      expect(mockElectronIpc.mcp.callTool).toHaveBeenCalled();
      expect(toolsClient.mcp.callTool.mutate).not.toHaveBeenCalled();
    });

    it('should reject a stdio tool call when no device identity is proven', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');
      // An unproven host (no handshake identity) — e.g. a web client with no
      // bound device. stdio can never fall back to the server relay.
      mockLocalIdentity.resolveLocalExecutionIdentity.mockResolvedValue({});

      const mockStdioPlugin = {
        customParams: {
          mcp: { type: 'stdio', command: 'node', args: ['script.js'] },
        },
        manifest: { meta: { title: 'Stdio Plugin' }, version: '1.0.0' },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockStdioPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      const payload: ChatToolPayload = {
        id: 'tool-call-3b',
        identifier: 'stdio-plugin',
        apiName: 'execute',
        arguments: '{}',
        type: 'standalone',
      };

      await expect(mcpService.invokeMcpToolCall(payload, {})).rejects.toThrow(
        'requires an execution device',
      );
      expect(toolsClient.mcp.callTool.mutate).not.toHaveBeenCalled();
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });

    it('should tunnel a device-only call to the bound remote device over the server relay', async () => {
      const { lambdaClient, toolsClient } = await import('@/libs/trpc/client');
      mockTopicBindings.set('topic-remote', 'remote-device-1');

      const mockStdioPlugin = {
        customParams: {
          mcp: { type: 'stdio', command: 'node', args: ['script.js'] },
        },
        manifest: { meta: { title: 'Stdio Plugin' }, version: '1.0.0' },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockStdioPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      mockDeviceLambda.callMcpTool.mockResolvedValue({
        content: 'remote result',
        success: true,
      });

      const payload: ChatToolPayload = {
        id: 'tool-call-3c',
        identifier: 'stdio-plugin',
        apiName: 'execute',
        arguments: '{}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, { topicId: 'topic-remote' });

      expect(result).toMatchObject({ content: 'remote result', success: true });
      expect(lambdaClient.device.callMcpTool.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          apiName: 'execute',
          arguments: '{}',
          deviceId: 'remote-device-1',
          identifier: 'stdio-plugin',
          params: {
            args: ['script.js'],
            command: 'node',
            env: {},
            name: 'stdio-plugin',
            type: 'stdio',
          },
        }),
        { signal: undefined },
      );
      expect(toolsClient.mcp.callTool.mutate).not.toHaveBeenCalled();
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });

    it('should surface a device-relay transport failure naming the bound device — never a fake success', async () => {
      mockTopicBindings.set('topic-remote-fail', 'remote-device-1');

      const mockStdioPlugin = {
        customParams: {
          mcp: { type: 'stdio', command: 'node', args: ['script.js'] },
        },
        manifest: { meta: { title: 'Stdio Plugin' }, version: '1.0.0' },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockStdioPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      mockDeviceLambda.callMcpTool.mockResolvedValue({
        content: 'device unreachable',
        error: 'device unreachable',
        errorCode: 'DEVICE_NOT_CONNECTED',
        success: false,
      });

      const payload: ChatToolPayload = {
        id: 'tool-call-3d',
        identifier: 'stdio-plugin',
        apiName: 'execute',
        arguments: '{}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, {
        topicId: 'topic-remote-fail',
      });

      expect(result).toMatchObject({
        error: { code: 'DEVICE_NOT_CONNECTED', deviceId: 'remote-device-1' },
        success: false,
      });
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });

    it('should use the local IPC transport for a localhost http endpoint', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      const mockHttpPlugin = {
        customParams: {
          mcp: { type: 'http', url: 'http://localhost:3000/mcp' },
        },
        manifest: { meta: { title: 'Http Plugin' }, version: '1.0.0' },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockHttpPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      mockElectronIpc.mcp.callHttpTool.mockResolvedValue('http result');

      const payload: ChatToolPayload = {
        id: 'tool-call-3d',
        identifier: 'http-plugin',
        apiName: 'run',
        arguments: '{}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, {
        scope: { kind: 'local' },
      });

      // The endpoint resolves in the local device's network space — never the
      // backend's relay.
      expect(result).toEqual('http result');
      expect(mockElectronIpc.mcp.callHttpTool).toHaveBeenCalled();
      expect(toolsClient.mcp.callTool.mutate).not.toHaveBeenCalled();
    });

    it('should return undefined when plugin is not found', async () => {
      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => null);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      const payload: ChatToolPayload = {
        id: 'tool-call-4',
        identifier: 'non-existent-plugin',
        apiName: 'method',
        arguments: '{}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, {});

      expect(result).toBeUndefined();
    });

    it('should handle tool call errors and report them', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      const mockPlugin = {
        customParams: {
          mcp: {
            type: 'sse',
          },
        },
        manifest: {
          meta: { title: 'Error Plugin' },
          version: '1.0.0',
        },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      const mockError = new Error('Tool call failed');
      vi.mocked(toolsClient.mcp.callTool.mutate).mockRejectedValue(mockError);

      const payload: ChatToolPayload = {
        id: 'tool-call-5',
        identifier: 'error-plugin',
        apiName: 'failMethod',
        arguments: '{}',
        type: 'standalone',
      };

      await expect(mcpService.invokeMcpToolCall(payload, {})).rejects.toThrow('Tool call failed');

      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should call toolsClient.market.callCloudMcpEndpoint for cloud type', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      // Use cloud type which now reports from server-side
      const mockPlugin = {
        customParams: {
          mcp: { type: 'cloud' },
        },
        manifest: {
          meta: { title: 'Cloud Plugin' },
          version: '1.0.0',
        },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      // Mock the toolsClient for cloud type
      const mockResult = {
        content: 'response data',
        state: {
          content: [{ text: 'response data', type: 'text' as const }],
        },
        success: true,
      };
      vi.mocked(toolsClient.market.callCloudMcpEndpoint.mutate).mockResolvedValue(mockResult);

      const payload: ChatToolPayload = {
        id: 'tool-call-6',
        identifier: 'cloud-plugin',
        apiName: 'cloudMethod',
        arguments: '{"key": "value"}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, { topicId: 'topic-123' });

      expect(result).toEqual(mockResult);
      expect(toolsClient.market.callCloudMcpEndpoint.mutate).toHaveBeenCalledWith({
        apiParams: { key: 'value' },
        identifier: 'cloud-plugin',
        meta: {
          customPluginInfo: undefined,
          isCustomPlugin: false,
          sessionId: 'topic-123',
          version: '1.0.0',
        },
        toolName: 'cloudMethod',
      });
    });

    it('should handle abort signal', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      const mockPlugin = {
        customParams: {
          mcp: { type: 'sse' },
        },
        manifest: {
          meta: { title: 'Abort Test Plugin' },
          version: '1.0.0',
        },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => mockPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);

      const abortController = new AbortController();
      const mockResult = 'result';
      vi.mocked(toolsClient.mcp.callTool.mutate).mockResolvedValue(mockResult);

      const payload: ChatToolPayload = {
        id: 'tool-call-7',
        identifier: 'abort-plugin',
        apiName: 'method',
        arguments: '{}',
        type: 'standalone',
      };

      const result = await mcpService.invokeMcpToolCall(payload, {
        signal: abortController.signal,
      });

      expect(toolsClient.mcp.callTool.mutate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signal: abortController.signal,
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('should pass meta to server for custom plugin', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');

      const mockCustomPlugin = {
        customParams: {
          mcp: {
            type: 'streamable',
            command: 'npm run plugin',
          },
        },
        manifest: {
          meta: {
            avatar: '🔧',
            description: 'Custom tool description',
            title: 'Custom Tool',
          },
          version: '3.0.0',
        },
      };

      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => null);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => mockCustomPlugin);

      vi.mocked(toolsClient.mcp.callTool.mutate).mockResolvedValue('ok');

      const payload: ChatToolPayload = {
        id: 'tool-call-8',
        identifier: 'custom-tool',
        apiName: 'customAction',
        arguments: '{}',
        type: 'standalone',
      };

      await mcpService.invokeMcpToolCall(payload, { topicId: 'topic-123' });

      // Verify meta is passed to server
      expect(toolsClient.mcp.callTool.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: {
            customPluginInfo: {
              avatar: '🔧',
              description: 'Custom tool description',
              name: 'Custom Tool',
            },
            isCustomPlugin: true,
            sessionId: 'topic-123',
            version: '3.0.0',
          },
        }),
        expect.anything(),
      );
    });
  });

  describe('getStreamableMcpServerManifest', () => {
    it('should probe a localhost URL over the local device IPC', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');
      const mockManifest: ToolManifest = {
        identifier: 'streamable-server',
        version: '1',
        meta: { title: 'Streamable MCP Server', avatar: '🌐' },
        api: [
          {
            name: 'test',
            description: 'Test API',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      mockElectronIpc.mcp.getStreamableMcpServerManifest.mockResolvedValue(mockManifest);

      const params = {
        identifier: 'streamable-server',
        url: 'http://127.0.0.1:3000/manifest',
        auth: { type: 'none' as const },
      };

      const result = await mcpService.getStreamableMcpServerManifest(params, {
        scope: { kind: 'local' },
      });

      // 127.0.0.1 resolves in the CONNECTING device's network space: the
      // proven local device probes it over IPC, never the backend relay.
      expect(result).toEqual(mockManifest);
      expect(mockElectronIpc.mcp.getStreamableMcpServerManifest).toHaveBeenCalled();
      expect(toolsClient.mcp.getStreamableMcpServerManifest.query).not.toHaveBeenCalled();
    });

    it('should reject a localhost probe without proven local identity', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');
      mockLocalIdentity.resolveLocalExecutionIdentity.mockResolvedValue({});

      const params = {
        identifier: 'streamable-server',
        url: 'http://127.0.0.1:3000/manifest',
        auth: { type: 'none' as const },
      };

      await expect(mcpService.getStreamableMcpServerManifest(params)).rejects.toThrow(
        'requires an execution device',
      );
      expect(toolsClient.mcp.getStreamableMcpServerManifest.query).not.toHaveBeenCalled();
      expect(mockElectronIpc.mcp.getStreamableMcpServerManifest).not.toHaveBeenCalled();
    });

    it('should use toolsClient for remote URLs', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');
      const mockManifest: ToolManifest = {
        identifier: 'remote-server',
        version: '1',
        meta: { title: 'Remote MCP Server', avatar: '🌍' },
        api: [
          {
            name: 'remoteTest',
            description: 'Remote Test API',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      vi.mocked(toolsClient.mcp.getStreamableMcpServerManifest.query).mockResolvedValue(
        mockManifest,
      );

      const params = {
        identifier: 'remote-server',
        url: 'https://api.example.com/manifest',
        auth: { type: 'bearer' as const, token: 'abc123' },
        headers: { 'X-Custom': 'header' },
      };

      const abortController = new AbortController();
      const result = await mcpService.getStreamableMcpServerManifest(
        params,
        abortController.signal,
      );

      expect(result).toEqual(mockManifest);
      expect(toolsClient.mcp.getStreamableMcpServerManifest.query).toHaveBeenCalledWith(params, {
        signal: abortController.signal,
      });
    });

    it('should handle different URL formats correctly', async () => {
      const mockManifest: ToolManifest = {
        identifier: 'server',
        version: '1',
        meta: { title: 'URL Test Server', avatar: '🔗' },
        api: [
          {
            name: 'urlTest',
            description: 'URL Test API',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      mockElectronIpc.mcp.getStreamableMcpServerManifest.mockResolvedValue(mockManifest);

      const params = {
        identifier: 'server',
        url: 'http://localhost:8080/manifest',
        auth: { type: 'none' as const },
      };

      const result = await mcpService.getStreamableMcpServerManifest(params, {
        scope: { kind: 'local' },
      });

      // localhost is device-scoped: on the proven local device it goes over
      // IPC rather than the server relay.
      expect(result).toEqual(mockManifest);
      expect(mockElectronIpc.mcp.getStreamableMcpServerManifest).toHaveBeenCalled();
    });

    it('should handle OAuth2 authentication', async () => {
      const { toolsClient } = await import('@/libs/trpc/client');
      const mockManifest: ToolManifest = {
        identifier: 'oauth-server',
        version: '1',
        meta: { title: 'OAuth Server', avatar: '🔐' },
        api: [
          {
            name: 'oauthTest',
            description: 'OAuth Test API',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      vi.mocked(toolsClient.mcp.getStreamableMcpServerManifest.query).mockResolvedValue(
        mockManifest,
      );

      const params = {
        identifier: 'oauth-server',
        url: 'https://api.oauth.com/manifest',
        auth: {
          type: 'oauth2' as const,
          accessToken: 'access_token_123',
        },
        metadata: {
          avatar: '🔐',
          description: 'OAuth secured API',
          name: 'OAuth API',
        },
      };

      const result = await mcpService.getStreamableMcpServerManifest(params);

      expect(result).toEqual(mockManifest);
      expect(toolsClient.mcp.getStreamableMcpServerManifest.query).toHaveBeenCalledWith(
        params,
        expect.any(Object),
      );
    });
  });

  describe('getStdioMcpServerManifest', () => {
    it('should call ipc mcp.getStdioMcpServerManifest with stdio parameters', async () => {
      const mockManifest: ToolManifest = {
        identifier: 'stdio-server',
        version: '1',
        meta: { title: 'Stdio Server', avatar: '📦' },
        api: [
          {
            name: 'stdioTest',
            description: 'Stdio Test API',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      vi.mocked(mockElectronIpc.mcp.getStdioMcpServerManifest).mockResolvedValue(
        superjson.serialize(mockManifest) as any,
      );

      const stdioParams = {
        command: 'node',
        args: ['server.js', '--port', '3000'],
        env: { NODE_ENV: 'production', API_KEY: 'secret' },
        name: 'stdio-server',
      };

      const metadata = {
        avatar: '📦',
        description: 'Stdio API',
        name: 'Stdio Server',
      };

      const result = await mcpService.getStdioMcpServerManifest(stdioParams, metadata, {
        scope: { kind: 'local' },
      });

      expect(result).toEqual(mockManifest);
      const callArg = vi.mocked(mockElectronIpc.mcp.getStdioMcpServerManifest).mock.calls[0][0];
      expect(superjson.deserialize(callArg as any)).toEqual({ ...stdioParams, metadata });
    });

    it('should handle abort signal for stdio manifest', async () => {
      const mockManifest: ToolManifest = {
        identifier: 'python-server',
        version: '1',
        meta: { title: 'Stdio Server', avatar: '🐍' },
        api: [
          {
            name: 'pythonTest',
            description: 'Python Test API',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      vi.mocked(mockElectronIpc.mcp.getStdioMcpServerManifest).mockResolvedValue(
        superjson.serialize(mockManifest) as any,
      );

      const stdioParams = {
        command: 'python',
        args: ['app.py'],
        name: 'python-server',
      };

      const abortController = new AbortController();
      await mcpService.getStdioMcpServerManifest(stdioParams, undefined, {
        scope: { kind: 'local' },
        signal: abortController.signal,
      });

      // IPC client does not support AbortSignal yet
      const callArg = vi.mocked(mockElectronIpc.mcp.getStdioMcpServerManifest).mock.calls[0][0];
      expect(superjson.deserialize(callArg as any)).toEqual({
        ...stdioParams,
        metadata: undefined,
      });
    });

    it('should work without optional parameters', async () => {
      const mockManifest: ToolManifest = {
        identifier: 'npm-server',
        version: '1',
        meta: { title: 'Simple Server', avatar: '📦' },
        api: [
          {
            name: 'npmTest',
            description: 'NPM Test API',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      vi.mocked(mockElectronIpc.mcp.getStdioMcpServerManifest).mockResolvedValue(
        superjson.serialize(mockManifest) as any,
      );

      const stdioParams = {
        command: 'npm',
        name: 'npm-server',
      };

      const result = await mcpService.getStdioMcpServerManifest(stdioParams, undefined, {
        scope: { kind: 'local' },
      });

      expect(result).toEqual(mockManifest);
      const callArg = vi.mocked(mockElectronIpc.mcp.getStdioMcpServerManifest).mock.calls[0][0];
      expect(superjson.deserialize(callArg as any)).toEqual({
        ...stdioParams,
        metadata: undefined,
      });
    });
  });

  describe('checkInstallation', () => {
    it('should check MCP plugin installation status', async () => {
      const mockInstallResult = {
        platform: 'linux',
        success: true,
        packageInstalled: true,
      };
      vi.mocked(mockElectronIpc.mcp.validMcpServerInstallable).mockResolvedValue(
        superjson.serialize(mockInstallResult) as any,
      );

      const manifest = {
        identifier: 'test-plugin',
        meta: { title: 'Test Plugin' },
        version: '1.0.0',
        deploymentOptions: [
          {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'test-plugin'],
          },
        ],
      };

      const result = await mcpService.checkInstallation(manifest as any, {
        scope: { kind: 'local' },
      });

      expect(result).toEqual(mockInstallResult);
      const callArg = vi.mocked(mockElectronIpc.mcp.validMcpServerInstallable).mock.calls[0][0];
      expect(superjson.deserialize(callArg as any)).toEqual({
        deploymentOptions: manifest.deploymentOptions,
      });
    });

    it('should handle installation check with abort signal', async () => {
      const mockInstallResult = {
        platform: 'linux',
        success: false,
        packageInstalled: false,
        systemDependencies: [
          { name: 'node', installed: false, meetRequirement: false },
          { name: 'npm', installed: false, meetRequirement: false },
        ],
      };
      vi.mocked(mockElectronIpc.mcp.validMcpServerInstallable).mockResolvedValue(
        superjson.serialize(mockInstallResult) as any,
      );

      const manifest = {
        identifier: 'complex-plugin',
        meta: { title: 'Complex Plugin' },
        version: '2.0.0',
        deploymentOptions: [
          {
            type: 'sse',
            url: 'https://plugin.example.com',
          },
        ],
      };

      const abortController = new AbortController();
      const result = await mcpService.checkInstallation(manifest as any, {
        scope: { kind: 'local' },
        signal: abortController.signal,
      });

      expect(result).toEqual(mockInstallResult);
      // IPC client does not support AbortSignal yet
      const callArg = vi.mocked(mockElectronIpc.mcp.validMcpServerInstallable).mock.calls[0][0];
      expect(superjson.deserialize(callArg as any)).toEqual({
        deploymentOptions: manifest.deploymentOptions,
      });
    });

    it('should handle multiple deployment options', async () => {
      const mockInstallResult = {
        platform: 'linux',
        success: true,
        packageInstalled: true,
        isRecommended: true,
      };
      vi.mocked(mockElectronIpc.mcp.validMcpServerInstallable).mockResolvedValue(
        superjson.serialize(mockInstallResult) as any,
      );

      const manifest = {
        identifier: 'multi-deploy-plugin',
        meta: { title: 'Multi Deploy Plugin' },
        version: '3.0.0',
        deploymentOptions: [
          {
            type: 'stdio',
            command: 'node',
            args: ['index.js'],
          },
          {
            type: 'streamable',
            url: 'https://api.example.com',
          },
          {
            type: 'sse',
            url: 'https://sse.example.com',
          },
        ],
      };

      const result = await mcpService.checkInstallation(manifest as any, {
        scope: { kind: 'local' },
      });

      expect(result).toEqual(mockInstallResult);
      const callArg = vi.mocked(mockElectronIpc.mcp.validMcpServerInstallable).mock.calls[0][0];
      expect(superjson.deserialize(callArg as any)).toEqual({
        deploymentOptions: manifest.deploymentOptions,
      });
    });
  });

  describe('explicit device scope (F05 — unknown scope is never local)', () => {
    /**
     * Two devices share this client: A is THIS host (proven local, `IPC`
     * transport) and B is a remote registered device. Device-A/IPC calls are
     * the "spawn/request count" — any scope ambiguity that resolves to local
     * would make device A execute a request meant for B.
     */
    const deviceA = 'local-device'; // proven-local (mockLocalIdentity default)
    const deviceB = 'device-b';

    const stdioPlugin = {
      customParams: {
        mcp: { type: 'stdio', command: 'node', args: ['server.js'] },
      },
      manifest: { meta: { title: 'Stdio Plugin' }, version: '1.0.0' },
    };

    const stdioPayload: ChatToolPayload = {
      id: 'call-1',
      identifier: 'stdio-plugin',
      apiName: 'execute',
      arguments: '{}',
      type: 'standalone',
    };

    beforeEach(() => {
      mockPluginSelectors.getInstalledPluginById.mockReturnValue(() => stdioPlugin);
      mockPluginSelectors.getCustomPluginById.mockReturnValue(() => null);
    });

    it('controlling device B answers for B — install/manifest/call all tunnel to B, never touch A', async () => {
      // The conversation is bound to B (authoritative read says B). Every
      // operation under that scope executes on B through the server-side
      // device RPC relay — A's IPC counters stay at zero.
      mockTopicDetail.getTopicDetail.mockResolvedValue({
        metadata: { executionConfig: { boundDeviceId: deviceB } },
      });
      mockDeviceLambda.callMcpTool.mockResolvedValue({ content: 'ok', success: true });
      mockDeviceLambda.getStdioMcpServerManifest.mockResolvedValue({ api: [] });
      mockDeviceLambda.checkMcpInstallable.mockResolvedValue({ success: true });
      const scope = { kind: 'topic', topicId: 'topic-b' } as const;

      const callResult = await mcpService.invokeMcpToolCall(stdioPayload, { scope });
      expect(callResult).toMatchObject({ success: true });
      expect(mockDeviceLambda.callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: deviceB }),
        expect.anything(),
      );

      await mcpService.getStdioMcpServerManifest(
        { args: ['server.js'], command: 'node', name: 'stdio-plugin' },
        undefined,
        { scope },
      );
      expect(mockDeviceLambda.getStdioMcpServerManifest).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: deviceB }),
        expect.anything(),
      );

      await mcpService.checkInstallation(stdioPlugin.manifest as any, { scope });
      expect(mockDeviceLambda.checkMcpInstallable).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: deviceB }),
        expect.anything(),
      );

      // Device A (the local host) never spawned a process and never answered
      // a request — its IPC counters stay at zero.
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
      expect(mockElectronIpc.mcp.getStdioMcpServerManifest).not.toHaveBeenCalled();
      expect(mockElectronIpc.mcp.validMcpServerInstallable).not.toHaveBeenCalled();
    });

    it('an old device client still answers OPERATION_UNSUPPORTED — the relay never fabricates', async () => {
      // A device running a pre-MCP-RPC client rejects honestly; the server's
      // PRECONDITION_FAILED/cause.data.code=OPERATION_UNSUPPORTED propagates
      // verbatim so the UI offers upgrade, not retry.
      mockTopicDetail.getTopicDetail.mockResolvedValue({
        metadata: { executionConfig: { boundDeviceId: deviceB } },
      });
      const unsupported = Object.assign(
        new Error('This device client does not support MCP manifest queries'),
        {
          data: { code: 'PRECONDITION_FAILED', cause: { data: { code: 'OPERATION_UNSUPPORTED' } } },
        },
      );
      mockDeviceLambda.getStdioMcpServerManifest.mockRejectedValue(unsupported);

      await expect(
        mcpService.getStdioMcpServerManifest(
          { args: ['server.js'], command: 'node', name: 'stdio-plugin' },
          undefined,
          { scope: { kind: 'topic', topicId: 'topic-b-old' } },
        ),
      ).rejects.toThrow('does not support MCP manifest queries');
      expect(mockElectronIpc.mcp.getStdioMcpServerManifest).not.toHaveBeenCalled();
    });

    it('cleared topic cache → authoritative binding decides (B), never A', async () => {
      // Display cache miss (topic not in the store) — the authoritative read
      // reports the binding: B. A cache miss is never "unbound".
      mockTopicDetail.getTopicDetail.mockResolvedValue({
        metadata: { boundDeviceId: deviceB },
      });
      mockDeviceLambda.callMcpTool.mockResolvedValue({ content: 'ok', success: true });

      const result = await mcpService.invokeMcpToolCall(stdioPayload, {
        scope: { kind: 'topic', topicId: 'topic-cleared-cache' },
      });
      expect(result).toMatchObject({ success: true });
      expect(mockDeviceLambda.callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: deviceB }),
        expect.anything(),
      );
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });

    it('revoked permission / vanished topic → TARGET_QUERY_FAILED, never local', async () => {
      // The topic no longer resolves (revoked access, deleted, or a workspace
      // switch hid it): the authoritative read returns null. That is a failed
      // query — NOT an unbound answer, and never a local fallback.
      mockTopicDetail.getTopicDetail.mockResolvedValue(null);

      const result = await mcpService.invokeMcpToolCall(stdioPayload, {
        scope: { kind: 'topic', topicId: 'topic-gone' },
      });
      expect(result).toMatchObject({
        error: { code: 'TARGET_QUERY_FAILED' },
        success: false,
      });
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();

      // A thrown fetch is equally a failed query.
      mockTopicDetail.getTopicDetail.mockRejectedValue(new Error('denied'));
      const denied = await mcpService.invokeMcpToolCall(stdioPayload, {
        scope: { kind: 'topic', topicId: 'topic-denied' },
      });
      expect(denied).toMatchObject({
        error: { code: 'TARGET_QUERY_FAILED' },
        success: false,
      });
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });

    it('a topic that authoritatively has NO binding uses the local device', async () => {
      // Unbound IS a real answer: the topic is cached and carries no pin —
      // the run's own executor (this host) is the target.
      mockTopicBindings.set('topic-unbound', undefined);
      mockElectronIpc.mcp.callTool.mockResolvedValue('local result');

      const result = await mcpService.invokeMcpToolCall(stdioPayload, {
        scope: { kind: 'topic', topicId: 'topic-unbound' },
      });
      expect(result).toEqual('local result');
      expect(mockElectronIpc.mcp.callTool).toHaveBeenCalled();
    });

    it('B disconnected mid-flight still answers for B — never re-picked to A', async () => {
      // The binding targets B whether or not B is currently connected — the
      // call tunnels to B and the transport failure names B; it never
      // re-targets to this host.
      mockTopicBindings.set('topic-b-offline', deviceB);
      mockDeviceLambda.callMcpTool.mockResolvedValue({
        content: 'device unreachable',
        error: 'device unreachable',
        errorCode: 'DEVICE_NOT_CONNECTED',
        success: false,
      });
      const result = await mcpService.invokeMcpToolCall(stdioPayload, {
        scope: { kind: 'topic', topicId: 'topic-b-offline' },
      });
      expect(result).toMatchObject({
        error: { code: 'DEVICE_NOT_CONNECTED', deviceId: deviceB },
        success: false,
      });
      expect(mockDeviceLambda.callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: deviceB }),
        expect.anything(),
      );
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });

    it('a scope naming THIS host runs local IPC; a foreign device never does', async () => {
      mockElectronIpc.mcp.callTool.mockResolvedValue('local result');

      // {kind:'device', deviceId:A} — the host's own id is evidence that the
      // target IS this machine → local IPC.
      const same = await mcpService.invokeMcpToolCall(stdioPayload, {
        scope: { deviceId: deviceA, kind: 'device' },
      });
      expect(same).toEqual('local result');

      mockElectronIpc.mcp.callTool.mockClear();
      // {kind:'device', deviceId:B} — foreign → the server relay carries it
      // to B; A's IPC stays untouched.
      mockDeviceLambda.callMcpTool.mockResolvedValue({ content: 'ok', success: true });
      const foreign = await mcpService.invokeMcpToolCall(stdioPayload, {
        scope: { deviceId: deviceB, kind: 'device' },
      });
      expect(foreign).toMatchObject({ success: true });
      expect(mockDeviceLambda.callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: deviceB }),
        expect.anything(),
      );
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });

    it('no execution context at all → TARGET_REQUIRED (never default-local)', async () => {
      // The regression: a device-scoped call with no scope used to land on
      // the local host. Now it refuses outright — A's counters stay at 0.
      await expect(mcpService.invokeMcpToolCall(stdioPayload, {})).rejects.toThrow(
        'requires an execution device',
      );
      await expect(
        mcpService.getStdioMcpServerManifest(
          { command: 'node', name: 'stdio-plugin' },
          undefined,
          {},
        ),
      ).rejects.toThrow('requires an execution device');
      await expect(mcpService.checkInstallation(stdioPlugin.manifest as any, {})).rejects.toThrow(
        'requires an execution device',
      );

      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
      expect(mockElectronIpc.mcp.getStdioMcpServerManifest).not.toHaveBeenCalled();
      expect(mockElectronIpc.mcp.validMcpServerInstallable).not.toHaveBeenCalled();
    });

    it('a DeviceActionSubject resource pins its deviceId as the scope', async () => {
      const subject = {
        kind: 'resource' as const,
        resource: { deviceId: deviceB, relativePath: 'x', rootRef: '/' },
      };
      mockDeviceLambda.callMcpTool.mockResolvedValue({ content: 'ok', success: true });
      const result = await mcpService.invokeMcpToolCall(stdioPayload, { subject });
      expect(result).toMatchObject({ success: true });
      expect(mockDeviceLambda.callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: deviceB }),
        expect.anything(),
      );
      expect(mockElectronIpc.mcp.callTool).not.toHaveBeenCalled();
    });
  });
});
