import { type PluginManifest } from '@lobehub/market-sdk';

import { lambdaClient } from '@/libs/trpc/client';
import { globalHelpers } from '@/store/global/helpers';
import {
  type AssistantListResponse,
  type AssistantMarketSource,
  type AssistantQueryParams,
  type DiscoverAssistantDetail,
  type DiscoverMcpDetail,
  type DiscoverPluginDetail,
  type McpListResponse,
  type McpQueryParams,
} from '@/types/discover';
import { type MCPPluginListParams } from '@/types/plugins';

class DiscoverService {
  private _isRetrying = false;
  private _tokenRefreshPromise: Promise<void> | null = null;

  private isMarketTrustedClientEnabled = (): boolean => {
    if (typeof window === 'undefined' || !window.global_serverConfigStore) return false;
    try {
      const state = window.global_serverConfigStore.getState();
      return state.serverConfig.enableMarketTrustedClient || false;
    } catch {
      return false;
    }
  };

  safeInjectMPToken = async () => {
    // If trusted client is enabled, authentication is handled by backend
    // No need to inject M2M token from client side
    if (this.isMarketTrustedClientEnabled()) return;

    try {
      await this.injectMPToken();
    } catch (error) {
      // Log error but don't block the request
      console.warn('Failed to inject MP token, continuing without it:', error);
    }
  };

  getAssistantDetail = async (params: {
    identifier: string;
    locale?: string;
    source?: AssistantMarketSource;
    version?: string;
  }): Promise<DiscoverAssistantDetail | undefined> => {
    const locale = globalHelpers.getCurrentLanguage();
    return lambdaClient.market.getAssistantDetail.query({
      identifier: params.identifier,
      locale,
      source: params.source,
      version: params.version,
    });
  };

  getAssistantList = async (params: AssistantQueryParams = {}): Promise<AssistantListResponse> => {
    await this.safeInjectMPToken();

    const locale = globalHelpers.getCurrentLanguage();
    return lambdaClient.market.getAssistantList.query(
      {
        ...params,
        locale,
        page: params.page ? Number(params.page) : 1,
        pageSize: params.pageSize ? Number(params.pageSize) : 20,
      },
      { context: { showNotification: false } },
    );
  };

  // ============================== MCP Market ==============================

  getAgentsByPlugin = async (params: {
    locale?: string;
    page?: number;
    pageSize?: number;
    pluginId: string;
  }): Promise<AssistantListResponse> => {
    const locale = globalHelpers.getCurrentLanguage();
    return lambdaClient.market.getAgentsByPlugin.query({
      ...params,
      locale,
      page: params.page ? Number(params.page) : 1,
      pageSize: params.pageSize ? Number(params.pageSize) : 20,
    });
  };

  getMcpDetail = async (params: {
    identifier: string;
    locale?: string;
    version?: string;
  }): Promise<DiscoverMcpDetail> => {
    const locale = globalHelpers.getCurrentLanguage();
    return lambdaClient.market.getMcpDetail.query({
      ...params,
      locale,
    });
  };

  getMcpList = async (params: McpQueryParams = {}): Promise<McpListResponse> => {
    await this.safeInjectMPToken();

    const locale = globalHelpers.getCurrentLanguage();
    return lambdaClient.market.getMcpList.query({
      ...params,
      locale,
      page: params.page ? Number(params.page) : 1,
      pageSize: params.pageSize ? Number(params.pageSize) : 20,
    });
  };

  getMCPPluginList = async (params: MCPPluginListParams): Promise<McpListResponse> => {
    await this.safeInjectMPToken();

    const locale = globalHelpers.getCurrentLanguage();

    return lambdaClient.market.getMcpList.query({
      ...params,
      locale,
      page: params.page ? Number(params.page) : 1,
      pageSize: params.pageSize ? Number(params.pageSize) : 21,
    });
  };

  getMCPPluginManifest = async (
    identifier: string,
    options: { install?: boolean } = {},
  ): Promise<PluginManifest> => {
    const locale = globalHelpers.getCurrentLanguage();

    return lambdaClient.market.getMcpManifest.query({
      identifier,
      install: options.install,
      locale,
    });
  };

  registerClient = () => {
    return lambdaClient.market.registerClientInMarketplace.mutate({});
  };

  // ============================== Plugin Market ==============================

  getPluginDetail = async (params: {
    identifier: string;
    locale?: string;
    withManifest?: boolean;
  }): Promise<DiscoverPluginDetail | undefined> => {
    const locale = globalHelpers.getCurrentLanguage();
    return lambdaClient.market.getPluginDetail.query({
      ...params,
      locale,
    });
  };

  // ============================== Helpers ==============================

  async injectMPToken() {
    if (typeof localStorage === 'undefined') return;

    // Check server-set status flag cookie
    const tokenStatus = this.getTokenStatusFromCookie();
    if (tokenStatus === 'active') return;

    // If a token refresh is already in progress, wait for it to complete
    if (this._tokenRefreshPromise) {
      await this._tokenRefreshPromise;
      return;
    }

    // Create a new refresh promise and execute
    this._tokenRefreshPromise = this._doRefreshToken();
    try {
      await this._tokenRefreshPromise;
    } finally {
      this._tokenRefreshPromise = null;
    }
  }

  private async _doRefreshToken() {
    let clientId: string;
    let clientSecret: string;

    // 1. Get client information from localStorage
    const item = localStorage.getItem('_mpc');
    if (!item) {
      // 2. If not exists, register client
      const clientInfo = await this.registerClient();
      clientId = clientInfo.clientId;
      clientSecret = clientInfo.clientSecret;

      // 3. Base64 encode and save to localStorage
      const clientData = JSON.stringify({ clientId, clientSecret });
      const encodedData = btoa(clientData);
      localStorage.setItem('_mpc', encodedData);
    } else {
      // 4. If exists, decode to get client information
      try {
        const decodedData = atob(item);
        const clientData = JSON.parse(decodedData);
        clientId = clientData.clientId;
        clientSecret = clientData.clientSecret;
      } catch (error) {
        console.error('Failed to decode client data:', error);
        // If decoding fails, re-register
        const clientInfo = await this.registerClient();
        clientId = clientInfo.clientId;
        clientSecret = clientInfo.clientSecret;

        const clientData = JSON.stringify({ clientId, clientSecret });
        const encodedData = btoa(clientData);
        localStorage.setItem('_mpc', encodedData);
      }
    }

    // 5. Get access token (server will automatically set HTTP-Only cookie)
    try {
      const result = await lambdaClient.market.registerM2MToken.query({
        clientId,
        clientSecret,
      });

      // Check server response result
      if (!result.success) {
        console.warn(
          'Token registration failed, client credentials may be invalid. Clearing and retrying...',
        );

        // Clear related local storage data
        localStorage.removeItem('_mpc');

        // Re-execute the complete registration process (but only retry once)
        if (!this._isRetrying) {
          this._isRetrying = true;
          try {
            await this._doRefreshToken();
          } finally {
            this._isRetrying = false;
          }
        } else {
          console.error('Failed to re-register after credential invalidation');
        }

        return;
      }

      // 6. Wait for cookie to be set by browser
      // The Set-Cookie header processing may have a tiny delay
      await this._waitForCookieSet();
    } catch (error) {
      console.error('Failed to register M2M token:', error);
    }
  }

  private async _waitForCookieSet(maxRetries = 10, interval = 10): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      if (this.getTokenStatusFromCookie() === 'active') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    // If cookie still not set after retries, continue anyway
    // The request might still work if the cookie was set but we couldn't detect it
    console.warn('Cookie may not be fully set, proceeding anyway');
  }

  private getTokenStatusFromCookie(): string | null {
    if (typeof document === 'undefined') return null;

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'mp_token_status') {
        return value;
      }
    }
    return null;
  }
}

export const discoverService = new DiscoverService();
