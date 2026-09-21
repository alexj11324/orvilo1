import { type PluginItem } from '@lobehub/market-sdk';
import { type ToolManifest } from '@orvilo/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { discoverService } from '@/services/discover';
import { mcpService } from '@/services/mcp';
import { pluginService } from '@/services/plugin';
import { type CheckMcpInstallResult } from '@/types/plugins';
import { MCPInstallStep } from '@/types/plugins';

import { useToolStore } from '../../store';

vi.mock('@/libs/trpc/client', () => ({
  asyncClient: {},
  lambdaClient: {
    market: {
      getMcpDetail: { query: vi.fn() },
      getMcpManifest: { query: vi.fn() },
      registerClientInMarketplace: {
        mutate: vi.fn().mockResolvedValue({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        }),
      },
      registerM2MToken: { query: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
  toolsClient: {
    market: {
      callCloudMcpEndpoint: { mutate: vi.fn() },
    },
    mcp: {
      callTool: { mutate: vi.fn() },
      getStreamableMcpServerManifest: { query: vi.fn() },
    },
  },
}));

// Mock sleep to speed up tests
vi.mock('@/utils/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('zustand/traditional');

beforeEach(() => {
  vi.clearAllMocks();

  vi.spyOn(discoverService, 'injectMPToken').mockResolvedValue(undefined);
  vi.spyOn(discoverService, 'registerClient').mockResolvedValue({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  });

  // Reset store state
  act(() => {
    useToolStore.setState(
      {
        mcpInstallProgress: {},
        mcpInstallAbortControllers: {},
        mcpTestAbortControllers: {},
        mcpTestLoading: {},
        mcpTestErrors: {},
        refreshPlugins: vi.fn(),
        updateInstallLoadingState: vi.fn(),
      },
      false,
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.resetModules();
});

describe('mcpStore actions', () => {
  describe('updateMCPInstallProgress', () => {
    it('should update install progress for an identifier', () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        result.current.updateMCPInstallProgress('test-plugin', {
          progress: 50,
          step: MCPInstallStep.GETTING_SERVER_MANIFEST,
        });
      });

      expect(result.current.mcpInstallProgress['test-plugin']).toEqual({
        progress: 50,
        step: MCPInstallStep.GETTING_SERVER_MANIFEST,
      });
    });

    it('should clear install progress when progress is undefined', () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        result.current.updateMCPInstallProgress('test-plugin', {
          progress: 50,
          step: MCPInstallStep.INSTALLING_PLUGIN,
        });
      });

      act(() => {
        result.current.updateMCPInstallProgress('test-plugin', undefined);
      });

      expect(result.current.mcpInstallProgress['test-plugin']).toBeUndefined();
    });
  });

  describe('cancelInstallMCPPlugin', () => {
    it('should abort the installation and clear progress', async () => {
      const { result } = renderHook(() => useToolStore());
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');

      act(() => {
        useToolStore.setState({
          mcpInstallAbortControllers: { 'test-plugin': abortController },
          mcpInstallProgress: {
            'test-plugin': { progress: 50, step: MCPInstallStep.CHECKING_INSTALLATION },
          },
        });
      });

      await act(async () => {
        await result.current.cancelInstallMCPPlugin('test-plugin');
      });

      expect(abortSpy).toHaveBeenCalled();
      expect(result.current.mcpInstallAbortControllers['test-plugin']).toBeUndefined();
      expect(result.current.mcpInstallProgress['test-plugin']).toBeUndefined();
    });

    it('should handle cancel when no AbortController exists', async () => {
      const { result } = renderHook(() => useToolStore());

      await act(async () => {
        await result.current.cancelInstallMCPPlugin('non-existent-plugin');
      });

      // Should not throw error
      expect(result.current.mcpInstallAbortControllers['non-existent-plugin']).toBeUndefined();
    });
  });

  describe('cancelMcpConnectionTest', () => {
    it('should abort the connection test and clear state', () => {
      const { result } = renderHook(() => useToolStore());
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');

      act(() => {
        useToolStore.setState({
          mcpTestAbortControllers: { 'test-plugin': abortController },
          mcpTestLoading: { 'test-plugin': true },
          mcpTestErrors: { 'test-plugin': 'Some error' },
        });
      });

      act(() => {
        result.current.cancelMcpConnectionTest('test-plugin');
      });

      expect(abortSpy).toHaveBeenCalled();
      expect(result.current.mcpTestLoading['test-plugin']).toBe(false);
      expect(result.current.mcpTestAbortControllers['test-plugin']).toBeUndefined();
      expect(result.current.mcpTestErrors['test-plugin']).toBeUndefined();
    });

    it('should handle cancel when no AbortController exists', () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        result.current.cancelMcpConnectionTest('non-existent-plugin');
      });

      // Should not throw error
      expect(result.current.mcpTestAbortControllers['non-existent-plugin']).toBeUndefined();
    });
  });

  describe('testMcpConnection', () => {
    const mockManifest: ToolManifest = {
      api: [],
      gateway: '',
      identifier: 'test-plugin',
      meta: {
        avatar: 'https://example.com/avatar.png',
        description: 'Test plugin',
        title: 'Test Plugin',
      },
      type: 'standalone',
      version: '1',
    };

    describe('HTTP connection', () => {
      it('should successfully test HTTP connection', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'getStreamableMcpServerManifest').mockResolvedValue(mockManifest);

        let testResult;
        await act(async () => {
          testResult = await result.current.testMcpConnection({
            identifier: 'test-plugin',
            connection: {
              type: 'http',
              url: 'https://example.com/mcp',
            },
            metadata: {
              avatar: 'https://example.com/avatar.png',
              description: 'Test plugin',
            },
          });
        });

        expect(testResult).toEqual({
          success: true,
          manifest: mockManifest,
        });
        expect(result.current.mcpTestLoading['test-plugin']).toBe(false);
        expect(result.current.mcpTestErrors['test-plugin']).toBeUndefined();
      });

      it('should handle HTTP connection error', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'getStreamableMcpServerManifest').mockRejectedValue(
          new Error('Connection failed'),
        );

        let testResult;
        await act(async () => {
          testResult = await result.current.testMcpConnection({
            identifier: 'test-plugin',
            connection: {
              type: 'http',
              url: 'https://example.com/mcp',
            },
          });
        });

        expect(testResult).toEqual({
          success: false,
          error: 'Connection failed',
        });
        expect(result.current.mcpTestLoading['test-plugin']).toBe(false);
        expect(result.current.mcpTestErrors['test-plugin']).toBe('Connection failed');
      });

      it('should throw error when URL is missing for HTTP connection', async () => {
        const { result } = renderHook(() => useToolStore());

        let testResult;
        await act(async () => {
          testResult = await result.current.testMcpConnection({
            identifier: 'test-plugin',
            connection: {
              type: 'http',
            } as any,
          });
        });

        expect(testResult).toEqual({
          success: false,
          error: 'URL is required for HTTP connection',
        });
      });
    });

    describe('STDIO connection', () => {
      it('should successfully test STDIO connection', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'getStdioMcpServerManifest').mockResolvedValue(mockManifest);

        let testResult;
        await act(async () => {
          testResult = await result.current.testMcpConnection({
            identifier: 'test-plugin',
            connection: {
              type: 'stdio',
              command: 'node',
              args: ['server.js'],
            },
          });
        });

        expect(testResult).toEqual({
          success: true,
          manifest: mockManifest,
        });
        expect(result.current.mcpTestLoading['test-plugin']).toBe(false);
      });

      it('should handle STDIO connection error', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'getStdioMcpServerManifest').mockRejectedValue(
          new Error('Command not found'),
        );

        let testResult;
        await act(async () => {
          testResult = await result.current.testMcpConnection({
            identifier: 'test-plugin',
            connection: {
              type: 'stdio',
              command: 'invalid-command',
            },
          });
        });

        expect(testResult).toEqual({
          success: false,
          error: 'Command not found',
        });
        expect(result.current.mcpTestErrors['test-plugin']).toBe('Command not found');
      });

      it('should throw error when command is missing for STDIO connection', async () => {
        const { result } = renderHook(() => useToolStore());

        let testResult;
        await act(async () => {
          testResult = await result.current.testMcpConnection({
            identifier: 'test-plugin',
            connection: {
              type: 'stdio',
            } as any,
          });
        });

        expect(testResult).toEqual({
          success: false,
          error: 'Command is required for STDIO connection',
        });
      });
    });

    describe('cancellation', () => {
      it('should handle cancellation during test', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'getStreamableMcpServerManifest').mockImplementation(
          async (params, signal) => {
            // Simulate cancellation
            signal?.dispatchEvent(new Event('abort'));
            throw new Error('Aborted');
          },
        );

        let testResult;
        await act(async () => {
          testResult = await result.current.testMcpConnection({
            identifier: 'test-plugin',
            connection: {
              type: 'http',
              url: 'https://example.com/mcp',
            },
          });
        });

        expect(testResult).toEqual({
          success: false,
          error: 'Aborted',
        });
      });
    });

    it('should handle invalid connection type', async () => {
      const { result } = renderHook(() => useToolStore());

      let testResult;
      await act(async () => {
        testResult = await result.current.testMcpConnection({
          identifier: 'test-plugin',
          connection: {
            type: 'invalid' as any,
          },
        });
      });

      expect(testResult).toEqual({
        success: false,
        error: 'Invalid MCP connection type',
      });
    });
  });

  describe('uninstallMCPPlugin', () => {
    it('should uninstall plugin and refresh plugins', async () => {
      const { result } = renderHook(() => useToolStore());
      const uninstallSpy = vi.spyOn(pluginService, 'uninstallPlugin').mockResolvedValue(undefined);

      await act(async () => {
        await result.current.uninstallMCPPlugin('test-plugin');
      });

      expect(uninstallSpy).toHaveBeenCalledWith('test-plugin');
      expect(result.current.refreshPlugins).toHaveBeenCalled();
    });
  });

  describe('installMCPPlugin', () => {
    const mockPlugin: PluginItem = {
      identifier: 'test-plugin',
      name: 'Test Plugin',
      manifestUrl: 'https://example.com/manifest.json',
      icon: 'https://example.com/icon.png',
      description: 'Test description',
    } as PluginItem;

    const mockManifest = {
      name: 'Test Plugin',
      version: '1.0.0',
      deploymentOptions: [
        {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      ],
    };

    const mockCheckResult: CheckMcpInstallResult = {
      success: true,
      platform: 'darwin',
      allDependenciesMet: true,
      connection: {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      },
    };

    const mockServerManifest: ToolManifest = {
      api: [],
      gateway: '',
      identifier: 'test-plugin',
      meta: {
        avatar: 'https://example.com/icon.png',
        description: 'Test description',
        title: 'Test Plugin',
      },
      type: 'standalone',
      version: '1',
    };

    beforeEach(() => {
      vi.spyOn(discoverService, 'getMCPPluginManifest').mockResolvedValue(mockManifest as any);
      vi.spyOn(mcpService, 'checkInstallation').mockResolvedValue(mockCheckResult);
      vi.spyOn(mcpService, 'getStdioMcpServerManifest').mockResolvedValue(mockServerManifest);
      vi.spyOn(pluginService, 'installPlugin').mockResolvedValue(undefined);
      vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
    });

    describe('normal installation flow', () => {
      it('should successfully install MCP plugin', async () => {
        const { result } = renderHook(() => useToolStore());

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin');
        });

        expect(installResult).toBe(true);
        expect(discoverService.getMCPPluginManifest).toHaveBeenCalledWith('test-plugin', {
          install: true,
        });
        expect(mcpService.checkInstallation).toHaveBeenCalled();
        expect(mcpService.getStdioMcpServerManifest).toHaveBeenCalled();
        expect(pluginService.installPlugin).toHaveBeenCalled();
        expect(result.current.refreshPlugins).toHaveBeenCalled();
      });

      it('should update progress through installation steps', async () => {
        const { result } = renderHook(() => useToolStore());

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        const progressUpdates: any[] = [];
        const updateProgressSpy = vi
          .spyOn(result.current, 'updateMCPInstallProgress')
          .mockImplementation((identifier, progress) => {
            progressUpdates.push({ identifier, progress });
          });

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin');
        });

        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(
          progressUpdates.some((p) => p.progress?.step === MCPInstallStep.FETCHING_MANIFEST),
        ).toBe(true);
        expect(
          progressUpdates.some((p) => p.progress?.step === MCPInstallStep.CHECKING_INSTALLATION),
        ).toBe(true);
        expect(
          progressUpdates.some((p) => p.progress?.step === MCPInstallStep.GETTING_SERVER_MANIFEST),
        ).toBe(true);
        expect(
          progressUpdates.some((p) => p.progress?.step === MCPInstallStep.INSTALLING_PLUGIN),
        ).toBe(true);
        expect(progressUpdates.some((p) => p.progress?.step === MCPInstallStep.COMPLETED)).toBe(
          true,
        );

        updateProgressSpy.mockRestore();
      });

      it('should fetch plugin detail if not in store', async () => {
        const { result } = renderHook(() => useToolStore());

        act(() => {});

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin');
        });

        expect(discoverService.getMcpDetail).toHaveBeenCalledWith({ identifier: 'test-plugin' });
      });

      it('should return early if plugin not found', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(null as any);

        act(() => {});

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('non-existent-plugin');
        });

        expect(installResult).toBeUndefined();
        expect(mcpService.checkInstallation).not.toHaveBeenCalled();
      });
    });

    describe('dependencies check', () => {
      it('should pause installation when dependencies not met', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'checkInstallation').mockResolvedValue({
          ...mockCheckResult,
          allDependenciesMet: false,
          systemDependencies: [
            {
              name: 'node',
              installed: false,
              meetRequirement: false,
            },
          ],
        });

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin');
        });

        expect(installResult).toBe(false);
        expect(pluginService.installPlugin).not.toHaveBeenCalled();
      });

      it('should skip dependencies check when skipDepsCheck is true', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'checkInstallation').mockResolvedValue({
          ...mockCheckResult,
          allDependenciesMet: false,
        });

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin', {
            skipDepsCheck: true,
          });
        });

        expect(installResult).toBe(true);
        expect(pluginService.installPlugin).toHaveBeenCalled();
      });
    });

    describe('configuration requirement', () => {
      it('should pause installation when configuration is needed', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'checkInstallation').mockResolvedValue({
          ...mockCheckResult,
          needsConfig: true,
          configSchema: {
            type: 'object',
            properties: {
              apiKey: { type: 'string' },
            },
          },
        });

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin');
        });

        expect(installResult).toBe(false);
        expect(pluginService.installPlugin).not.toHaveBeenCalled();
      });
    });

    describe('cloudEndPoint support', () => {
      it('should create cloud type connection when cloudEndPoint is available on web', async () => {
        const { result } = renderHook(() => useToolStore());

        const mockManifestWithCloudEndpoint = {
          ...mockManifest,
          cloudEndPoint: true,
          tools: [
            {
              name: 'testTool',
              description: 'Test tool description',
              inputSchema: {
                type: 'object',
                properties: {
                  param: { type: 'string' },
                },
              },
            },
          ],
          author: 'Test Author',
          createdAt: '2024-01-01T00:00:00Z',
          homepage: 'https://example.com',
          manifestUrl: 'https://example.com/manifest.json',
          icon: 'https://example.com/icon.png',
          description: 'Test description',
          tags: ['test'],
          deploymentOptions: [
            {
              connection: {
                type: 'stdio',
                configSchema: {
                  type: 'object',
                  properties: {
                    API_KEY: { type: 'string' },
                  },
                },
              },
              installationMethod: 'uv',
            },
          ],
        };

        vi.spyOn(discoverService, 'getMCPPluginManifest').mockResolvedValue(
          mockManifestWithCloudEndpoint as any,
        );

        // Mock isDesktop to false (web environment)
        const originalIsDesktop = (await import('@orvilo/const')).isDesktop;
        vi.spyOn(await import('@orvilo/const'), 'isDesktop', 'get').mockReturnValue(false);

        // Create plugin with haveCloudEndpoint field
        const mockPluginWithCloudEndpoint = {
          ...mockPlugin,
          haveCloudEndpoint: true,
        } as any;

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(
            mockPluginWithCloudEndpoint as any,
          );
        });

        const installPluginSpy = vi.spyOn(pluginService, 'installPlugin');

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin');
        });

        expect(installResult).toBe(true);

        // Should create cloud type connection
        expect(installPluginSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            customParams: expect.objectContaining({
              mcp: expect.objectContaining({
                type: 'cloud',
                cloudEndPoint: true,
              }),
            }),
          }),
        );

        // Should NOT call stdio connection
        expect(mcpService.getStdioMcpServerManifest).not.toHaveBeenCalled();
        // Should NOT call checkInstallation (skipped for cloud)
        expect(mcpService.checkInstallation).not.toHaveBeenCalled();

        // Restore original isDesktop
        vi.spyOn(await import('@orvilo/const'), 'isDesktop', 'get').mockReturnValue(
          originalIsDesktop,
        );
      });

      it('should use stdio deployment when cloudEndPoint is not available', async () => {
        const { result } = renderHook(() => useToolStore());

        // No cloudEndPoint in manifest
        const mockManifestWithoutCloudEndpoint = {
          ...mockManifest,
          deploymentOptions: [
            {
              connection: {
                type: 'stdio',
              },
              installationMethod: 'uv',
            },
          ],
        };

        vi.spyOn(discoverService, 'getMCPPluginManifest').mockResolvedValue(
          mockManifestWithoutCloudEndpoint as any,
        );

        // Mock isDesktop to false (web environment)
        const originalIsDesktop = (await import('@orvilo/const')).isDesktop;
        vi.spyOn(await import('@orvilo/const'), 'isDesktop', 'get').mockReturnValue(false);

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin');
        });

        expect(installResult).toBe(true);
        // Should fall back to stdio
        expect(mcpService.checkInstallation).toHaveBeenCalled();
        expect(mcpService.getStdioMcpServerManifest).toHaveBeenCalled();

        // Restore original isDesktop
        vi.spyOn(await import('@orvilo/const'), 'isDesktop', 'get').mockReturnValue(
          originalIsDesktop,
        );
      });
    });

    describe('resume mode', () => {
      it('should resume installation with previous config info', async () => {
        const { result } = renderHook(() => useToolStore());

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
          useToolStore.setState({
            mcpInstallProgress: {
              'test-plugin': {
                progress: 50,
                step: MCPInstallStep.CONFIGURATION_REQUIRED,
                manifest: mockManifest,
                connection: mockCheckResult.connection,
                checkResult: mockCheckResult,
              },
            },
          });
        });

        const config = { apiKey: 'test-key' };

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin', { resume: true, config });
        });

        expect(discoverService.getMCPPluginManifest).not.toHaveBeenCalled();
        expect(mcpService.checkInstallation).not.toHaveBeenCalled();
        expect(mcpService.getStdioMcpServerManifest).toHaveBeenCalledWith(
          expect.objectContaining({
            env: config,
          }),
          expect.any(Object),
          expect.any(AbortSignal),
        );
      });

      it('should return early if config info not found in resume mode', async () => {
        const { result } = renderHook(() => useToolStore());

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
          useToolStore.setState({
            mcpInstallProgress: {},
          });
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin', { resume: true });
        });

        expect(installResult).toBeUndefined();
      });
    });

    describe('HTTP connection', () => {
      it('should install HTTP MCP plugin', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'checkInstallation').mockResolvedValue({
          ...mockCheckResult,
          connection: {
            type: 'http',
            url: 'https://example.com/mcp',
          },
        });

        vi.spyOn(mcpService, 'getStreamableMcpServerManifest').mockResolvedValue(
          mockServerManifest,
        );

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin');
        });

        expect(mcpService.getStreamableMcpServerManifest).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://example.com/mcp',
            identifier: 'test-plugin',
          }),
          expect.any(AbortSignal),
        );
      });
    });

    describe('version handling', () => {
      it('should use larger version from manifest and data', async () => {
        const { result } = renderHook(() => useToolStore());

        const manifestWithVersion = {
          ...mockManifest,
          version: '1.5.0',
        };

        const serverManifestWithVersion: ToolManifest = {
          api: [],
          gateway: '',
          identifier: 'test-plugin',
          meta: {
            avatar: 'https://example.com/icon.png',
            description: 'Test description',
            title: 'Test Plugin',
          },
          type: 'standalone',
          version: '1',
        };

        vi.spyOn(discoverService, 'getMCPPluginManifest').mockResolvedValue(
          manifestWithVersion as any,
        );
        vi.spyOn(mcpService, 'getStdioMcpServerManifest').mockResolvedValue(
          serverManifestWithVersion,
        );

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        const installPluginSpy = vi.spyOn(pluginService, 'installPlugin');

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin');
        });

        expect(installPluginSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            manifest: expect.objectContaining({
              version: '1.5.0',
            }),
          }),
        );
      });
    });

    describe('cancellation', () => {
      it('should handle cancellation during installation', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'checkInstallation').mockImplementation(async () => {
          // Cancel after check
          setTimeout(() => {
            result.current.cancelInstallMCPPlugin('test-plugin');
          }, 10);

          await new Promise((resolve) => setTimeout(resolve, 20));

          return mockCheckResult;
        });

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin');
        });

        // Should not install if cancelled
        expect(pluginService.installPlugin).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle structured MCP error', async () => {
        const { result } = renderHook(() => useToolStore());

        // Create proper TRPC error with data property
        const mcpError: any = new Error('MCP Error');
        mcpError.data = {
          errorData: {
            type: 'CONNECTION_ERROR',
            message: 'Failed to connect to MCP server',
            metadata: {
              step: 'connection',
              timestamp: Date.now(),
            },
          },
        };

        vi.spyOn(mcpService, 'getStdioMcpServerManifest').mockRejectedValue(mcpError);

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin');
        });

        const progress = result.current.mcpInstallProgress['test-plugin'];
        expect(progress?.step).toBe(MCPInstallStep.ERROR);
        expect(progress?.errorInfo).toMatchObject({
          type: 'CONNECTION_ERROR',
          message: 'Failed to connect to MCP server',
          metadata: expect.objectContaining({
            step: 'connection',
          }),
        });
      });

      it('should handle generic error', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'getStdioMcpServerManifest').mockRejectedValue(
          new Error('Generic error'),
        );

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        await act(async () => {
          await result.current.installMCPPlugin('test-plugin');
        });

        expect(result.current.mcpInstallProgress['test-plugin']).toMatchObject({
          step: MCPInstallStep.ERROR,
          errorInfo: {
            type: 'UNKNOWN_ERROR',
            message: 'Generic error',
          },
        });
      });

      it('should return undefined if manifest not retrieved', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'getStdioMcpServerManifest').mockResolvedValue(undefined as any);

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin');
        });

        expect(installResult).toBeUndefined();
        expect(pluginService.installPlugin).not.toHaveBeenCalled();
      });

      it('should return undefined if installation check fails', async () => {
        const { result } = renderHook(() => useToolStore());

        vi.spyOn(mcpService, 'checkInstallation').mockResolvedValue({
          ...mockCheckResult,
          success: false,
        });

        act(() => {
          vi.spyOn(discoverService, 'getMcpDetail').mockResolvedValue(mockPlugin as any);
        });

        let installResult;
        await act(async () => {
          installResult = await result.current.installMCPPlugin('test-plugin');
        });

        expect(installResult).toBeUndefined();
        expect(mcpService.getStdioMcpServerManifest).not.toHaveBeenCalled();
      });
    });
  });
});
