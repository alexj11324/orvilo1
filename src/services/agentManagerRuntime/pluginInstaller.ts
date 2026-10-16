import type { InstallPluginParams, InstallPluginState } from '@orvilo/agent-manager-runtime';
import type { ComposioAppType, OrviloSkillProviderType } from '@orvilo/const';
import { resolveConnectorCatalogItem } from '@orvilo/const';
import type { BuiltinToolResult } from '@orvilo/types';

import { getToolStoreState } from '@/store/tool';
import {
  builtinToolSelectors,
  composioStoreSelectors,
  orviloSkillStoreSelectors,
  pluginSelectors,
} from '@/store/tool/selectors';
import type { ComposioServer } from '@/store/tool/slices/composioStore/types';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore/types';
import type { OrviloSkillServer } from '@/store/tool/slices/orviloSkillStore/types';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';
import { getUserStoreState } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

/** Browser connection authorization and installation adapter. */
export class ClientPluginInstaller {
  constructor(
    private readonly enablePluginForAgent: (agentId: string, pluginId: string) => Promise<void>,
  ) {}
  async installPlugin(agentId: string, params: InstallPluginParams): Promise<BuiltinToolResult> {
    const { identifier, source } = params;

    try {
      const toolState = getToolStoreState();

      if (source === 'official') {
        const isComposioEnabled =
          typeof window !== 'undefined' &&
          window.global_serverConfigStore?.getState()?.serverConfig?.enableComposio;
        const isOrviloSkillEnabled =
          typeof window !== 'undefined' &&
          window.global_serverConfigStore?.getState()?.serverConfig?.enableOrviloSkill;
        const connector = resolveConnectorCatalogItem(identifier, {
          composio: Boolean(isComposioEnabled),
          orvilo: Boolean(isOrviloSkillEnabled),
        });

        if (connector?.type === 'composio') {
          const composioServer = composioStoreSelectors
            .getServers(toolState)
            .find((s) => s.identifier === identifier);
          return this.handleComposioInstall(
            agentId,
            identifier,
            connector.serverType,
            composioServer,
          );
        }

        if (connector?.type === 'orvilo') {
          const orviloSkillServer = orviloSkillStoreSelectors
            .getServers(toolState)
            .find((s) => s.identifier === identifier);
          return this.handleOrviloSkillInstall(
            agentId,
            identifier,
            connector.provider,
            orviloSkillServer,
          );
        }

        // Check if it's a builtin tool
        const builtinTools = builtinToolSelectors.metaList(toolState);
        const builtinTool = builtinTools.find((t) => t.identifier === identifier);

        if (builtinTool) {
          await this.enablePluginForAgent(agentId, identifier);

          return {
            content: `Successfully enabled builtin tool: ${builtinTool.meta?.title || identifier}`,
            state: {
              installed: true,
              pluginId: identifier,
              pluginName: builtinTool.meta?.title || identifier,
              success: true,
            } as InstallPluginState,
            success: true,
          };
        }

        return {
          content: `Official tool "${identifier}" not found.`,
          error: { message: 'Tool not found', type: 'NotFound' },
          state: {
            installed: false,
            pluginId: identifier,
            success: false,
          } as InstallPluginState,
          success: false,
        };
      }

      // Source is 'market' - MCP marketplace plugin
      return this.handleMarketPluginInstall(agentId, identifier);
    } catch (error) {
      const err = error as Error;
      return this.handleErrorWithState(error, 'Failed to install plugin', {
        error: err.message,
        installed: false,
        pluginId: identifier,
        success: false,
      } as InstallPluginState);
    }
  }

  private async handleComposioInstall(
    agentId: string,
    identifier: string,
    composioAppInfo: ComposioAppType,
    composioServer?: ComposioServer,
  ): Promise<BuiltinToolResult> {
    if (composioServer) {
      if (composioServer.status === ComposioServerStatus.ACTIVE) {
        await this.enablePluginForAgent(agentId, identifier);
        return {
          content: `Successfully enabled Composio tool: ${composioAppInfo.label}`,
          state: {
            installed: true,
            isComposio: true,
            pluginId: identifier,
            pluginName: composioAppInfo.label,
            serverStatus: 'connected',
            success: true,
          } as InstallPluginState,
          success: true,
        };
      } else if (composioServer.status === ComposioServerStatus.PENDING_AUTH) {
        if (composioServer.redirectUrl) {
          const authResult = await this.openOAuthWindowAndWait(
            composioServer.redirectUrl,
            identifier,
          );
          if (authResult.success) {
            await this.enablePluginForAgent(agentId, identifier);
            return {
              content: `Successfully connected and enabled Composio tool: ${composioAppInfo.label}`,
              state: {
                installed: true,
                isComposio: true,
                pluginId: identifier,
                pluginName: composioAppInfo.label,
                serverStatus: 'connected',
                success: true,
              } as InstallPluginState,
              success: true,
            };
          }
        }
        return {
          content: `OAuth authorization was cancelled or failed for Composio tool: ${composioAppInfo.label}. Please try again.`,
          state: {
            installed: false,
            isComposio: true,
            pluginId: identifier,
            pluginName: composioAppInfo.label,
            serverStatus: 'pending_auth',
            success: false,
          } as InstallPluginState,
          success: false,
        };
      }
    }

    // Server doesn't exist, create it
    const userId = userProfileSelectors.userId(getUserStoreState());
    if (!userId) {
      return {
        content: `Cannot connect Composio tool: User not logged in.`,
        error: { message: 'User not logged in', type: 'AuthRequired' },
        state: { installed: false, pluginId: identifier, success: false } as InstallPluginState,
        success: false,
      };
    }

    const newServer = await getToolStoreState().createComposioConnection({
      appSlug: composioAppInfo.appSlug,
      identifier,
      label: composioAppInfo.label,
    });

    if (newServer) {
      // Enable the plugin only once the connection is actually usable. Enabling
      // before OAuth completes would leave an enabled-but-unauthorized tool on
      // the agent if the user cancels the authorization.
      if (newServer.status === ComposioServerStatus.ACTIVE) {
        await this.enablePluginForAgent(agentId, identifier);
        await getToolStoreState().refreshComposioConnectionStatus(newServer.identifier);
        return {
          content: `Successfully connected and enabled Composio tool: ${composioAppInfo.label}`,
          state: {
            installed: true,
            isComposio: true,
            pluginId: identifier,
            pluginName: composioAppInfo.label,
            serverStatus: 'connected',
            success: true,
          } as InstallPluginState,
          success: true,
        };
      } else if (newServer.redirectUrl) {
        const authResult = await this.openOAuthWindowAndWait(
          newServer.redirectUrl,
          newServer.identifier,
        );
        if (authResult.success) {
          await this.enablePluginForAgent(agentId, identifier);
          return {
            content: `Successfully connected and enabled Composio tool: ${composioAppInfo.label}`,
            state: {
              installed: true,
              isComposio: true,
              pluginId: identifier,
              pluginName: composioAppInfo.label,
              serverStatus: 'connected',
              success: true,
            } as InstallPluginState,
            success: true,
          };
        }
      }
    }

    return {
      content: `Failed to connect Composio tool: ${composioAppInfo.label}`,
      error: { message: 'Failed to create Composio connection', type: 'ComposioError' },
      state: {
        installed: false,
        pluginId: identifier,
        success: false,
      } as InstallPluginState,
      success: false,
    };
  }

  private async handleOrviloSkillInstall(
    agentId: string,
    identifier: string,
    providerInfo: OrviloSkillProviderType,
    server?: OrviloSkillServer,
  ): Promise<BuiltinToolResult> {
    if (server?.status === OrviloSkillStatus.CONNECTED) {
      await this.enablePluginForAgent(agentId, identifier);
      return {
        content: `Successfully enabled OrviloSkill provider: ${providerInfo.label}`,
        state: {
          installed: true,
          isOrviloSkill: true,
          pluginId: identifier,
          pluginName: providerInfo.label,
          serverStatus: 'connected',
          success: true,
        } as InstallPluginState,
        success: true,
      };
    }

    // Need OAuth authorization
    // Skip redirectUri on desktop (app:// protocol) since the system browser can't navigate to it
    const redirectUri =
      typeof window !== 'undefined' && window.location.protocol.startsWith('http')
        ? `${window.location.origin}/oauth/callback/success?provider=${encodeURIComponent(identifier)}`
        : undefined;
    const authInfo = await getToolStoreState().getOrviloSkillAuthorizeUrl(identifier, {
      redirectUri,
    });

    if (!authInfo.authorizeUrl) {
      return {
        content: `OrviloSkill provider "${providerInfo.label}" requires OAuth authorization but no authorization URL is available.`,
        state: {
          installed: false,
          isOrviloSkill: true,
          pluginId: identifier,
          pluginName: providerInfo.label,
          serverStatus: 'not_connected',
          success: false,
        } as InstallPluginState,
        success: false,
      };
    }

    const authResult = await this.openOrviloSkillOAuthWindowAndWait(
      authInfo.authorizeUrl,
      identifier,
    );

    if (authResult.success) {
      await this.enablePluginForAgent(agentId, identifier);
      return {
        content: `Successfully connected and enabled OrviloSkill provider: ${providerInfo.label}`,
        state: {
          installed: true,
          isOrviloSkill: true,
          pluginId: identifier,
          pluginName: providerInfo.label,
          serverStatus: 'connected',
          success: true,
        } as InstallPluginState,
        success: true,
      };
    }

    return {
      content: `OAuth authorization was cancelled or failed for OrviloSkill provider: ${providerInfo.label}. Please try again.`,
      state: {
        installed: false,
        isOrviloSkill: true,
        pluginId: identifier,
        pluginName: providerInfo.label,
        serverStatus: 'not_connected',
        success: false,
      } as InstallPluginState,
      success: false,
    };
  }

  private async handleMarketPluginInstall(
    agentId: string,
    identifier: string,
  ): Promise<BuiltinToolResult> {
    const toolState = getToolStoreState();
    const isInstalled = pluginSelectors.isPluginInstalled(identifier)(toolState);

    if (isInstalled) {
      await this.enablePluginForAgent(agentId, identifier);
      const installedPlugin = pluginSelectors.getInstalledPluginById(identifier)(toolState);
      return {
        content: `Plugin "${installedPlugin?.manifest?.meta?.title || identifier}" is already installed. Enabled for current agent.`,
        state: {
          installed: true,
          pluginId: identifier,
          pluginName: installedPlugin?.manifest?.meta?.title || identifier,
          success: true,
        } as InstallPluginState,
        success: true,
      };
    }

    const installSuccess = await getToolStoreState().installMCPPlugin(identifier);

    if (installSuccess) {
      await this.enablePluginForAgent(agentId, identifier);
      await getToolStoreState().refreshPlugins();
      const freshToolState = getToolStoreState();
      const installedPlugin = pluginSelectors.getInstalledPluginById(identifier)(freshToolState);

      return {
        content: `Successfully installed and enabled MCP plugin "${installedPlugin?.manifest?.meta?.title || identifier}".`,
        state: {
          installed: true,
          pluginId: identifier,
          pluginName: installedPlugin?.manifest?.meta?.title || identifier,
          success: true,
        } as InstallPluginState,
        success: true,
      };
    }

    return {
      content: `Failed to install MCP plugin "${identifier}". Installation was cancelled or configuration is needed.`,
      state: {
        installed: false,
        pluginId: identifier,
        success: false,
      } as InstallPluginState,
      success: false,
    };
  }

  private openOAuthWindowAndWait(
    redirectUrl: string,
    identifier: string,
  ): Promise<{ cancelled: boolean; success: boolean }> {
    const checkAuthStatus = async (): Promise<boolean> => {
      try {
        await getToolStoreState().refreshComposioConnectionStatus(identifier);
        const freshToolStore = getToolStoreState();
        const server = composioStoreSelectors
          .getServers(freshToolStore)
          .find((s) => s.identifier === identifier);
        return server?.status === ComposioServerStatus.ACTIVE;
      } catch {
        return false;
      }
    };

    return new Promise((resolve) => {
      const WINDOW_CHECK_INTERVAL_MS = 500;
      const POLL_INTERVAL_MS = 1000;
      const POLL_TIMEOUT_MS = 300_000;

      let pollInterval: ReturnType<typeof setInterval> | null = null;
      let pollTimeout: ReturnType<typeof setTimeout> | null = null;
      let windowCheckInterval: ReturnType<typeof setInterval> | null = null;
      let resolved = false;

      const cleanup = () => {
        if (windowCheckInterval) clearInterval(windowCheckInterval);
        if (pollInterval) clearInterval(pollInterval);
        if (pollTimeout) clearTimeout(pollTimeout);
      };

      const resolveOnce = (result: { cancelled: boolean; success: boolean }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      const startFallbackPolling = () => {
        if (pollInterval) return;
        pollInterval = setInterval(async () => {
          const isConnected = await checkAuthStatus();
          if (isConnected) resolveOnce({ cancelled: false, success: true });
        }, POLL_INTERVAL_MS);
        pollTimeout = setTimeout(
          () => resolveOnce({ cancelled: true, success: false }),
          POLL_TIMEOUT_MS,
        );
      };

      const oauthWindow = window.open(redirectUrl, '_blank', 'width=600,height=700');

      if (oauthWindow) {
        windowCheckInterval = setInterval(async () => {
          try {
            if (oauthWindow.closed) {
              if (windowCheckInterval) clearInterval(windowCheckInterval);
              const isConnected = await checkAuthStatus();
              resolveOnce({ cancelled: !isConnected, success: isConnected });
            }
          } catch {
            if (windowCheckInterval) clearInterval(windowCheckInterval);
            startFallbackPolling();
          }
        }, WINDOW_CHECK_INTERVAL_MS);
      } else {
        startFallbackPolling();
      }
    });
  }

  private openOrviloSkillOAuthWindowAndWait(
    redirectUrl: string,
    provider: string,
  ): Promise<{ cancelled: boolean; success: boolean }> {
    const checkAuthStatus = async (): Promise<boolean> => {
      try {
        const server = await getToolStoreState().checkOrviloSkillStatus(provider);
        return server?.status === OrviloSkillStatus.CONNECTED;
      } catch {
        return false;
      }
    };

    return new Promise((resolve) => {
      const WINDOW_CHECK_INTERVAL_MS = 500;
      const POLL_INTERVAL_MS = 1000;
      const POLL_TIMEOUT_MS = 300_000;

      let pollInterval: ReturnType<typeof setInterval> | null = null;
      let pollTimeout: ReturnType<typeof setTimeout> | null = null;
      let windowCheckInterval: ReturnType<typeof setInterval> | null = null;
      let messageHandler: ((event: MessageEvent) => void) | null = null;
      let resolved = false;

      const cleanup = () => {
        if (windowCheckInterval) clearInterval(windowCheckInterval);
        if (pollInterval) clearInterval(pollInterval);
        if (pollTimeout) clearTimeout(pollTimeout);
        if (messageHandler) window.removeEventListener('message', messageHandler);
      };

      const resolveOnce = (result: { cancelled: boolean; success: boolean }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      messageHandler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'ORVILO_SKILL_AUTH_SUCCESS' && event.data?.provider === provider) {
          const server = await getToolStoreState().checkOrviloSkillStatus(provider);
          const isConnected = server?.status === OrviloSkillStatus.CONNECTED;
          resolveOnce({ cancelled: false, success: isConnected });
        }
      };

      window.addEventListener('message', messageHandler);

      const startFallbackPolling = () => {
        if (pollInterval) return;
        pollInterval = setInterval(async () => {
          const isConnected = await checkAuthStatus();
          if (isConnected) resolveOnce({ cancelled: false, success: true });
        }, POLL_INTERVAL_MS);
        pollTimeout = setTimeout(
          () => resolveOnce({ cancelled: true, success: false }),
          POLL_TIMEOUT_MS,
        );
      };

      const oauthWindow = window.open(redirectUrl, '_blank', 'width=600,height=700');

      if (oauthWindow) {
        windowCheckInterval = setInterval(async () => {
          try {
            if (oauthWindow.closed) {
              if (windowCheckInterval) clearInterval(windowCheckInterval);
              const isConnected = await checkAuthStatus();
              resolveOnce({ cancelled: !isConnected, success: isConnected });
            }
          } catch {
            if (windowCheckInterval) clearInterval(windowCheckInterval);
            startFallbackPolling();
          }
        }, WINDOW_CHECK_INTERVAL_MS);
      } else {
        startFallbackPolling();
      }
    });
  }

  private handleErrorWithState<T extends object>(
    error: unknown,
    context: string,
    state: T,
  ): BuiltinToolResult {
    const err = error as Error;
    return {
      content: `${context}: ${err.message}`,
      error: {
        body: error,
        message: err.message,
        type: 'RuntimeError',
      },
      state,
      success: false,
    };
  }
}
