import { getOrviloSkillProviderById } from '@orvilo/const';
import { produce } from 'immer';
import { type SWRResponse } from 'swr';
import useSWR from 'swr';

import { toolKeys } from '@/libs/swr/keys';
import { toolsClient } from '@/libs/trpc/client';
import { type StoreSetter } from '@/store/types';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';
import { setNamespace } from '@/utils/storeDebug';

import { type ToolStore } from '../../store';
import { type OrviloSkillStoreState } from './initialState';
import {
  type CallOrviloSkillToolParams,
  type CallOrviloSkillToolResult,
  type OrviloSkillServer,
  type OrviloSkillTool,
} from './types';
import { OrviloSkillStatus } from './types';

const n = setNamespace('orviloSkillStore');

/**
 * Orvilo Skill Store Actions
 */

type Setter = StoreSetter<ToolStore>;
export const createOrviloSkillStoreSlice = (set: Setter, get: () => ToolStore, _api?: unknown) =>
  new OrviloSkillStoreActionImpl(set, get, _api);

export class OrviloSkillStoreActionImpl {
  readonly #get: () => ToolStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => ToolStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  callOrviloSkillTool = async (
    params: CallOrviloSkillToolParams,
  ): Promise<CallOrviloSkillToolResult> => {
    const { provider, toolName, args, topicId } = params;
    const toolId = `${provider}:${toolName}`;

    this.#set(
      produce((draft: OrviloSkillStoreState) => {
        draft.orviloSkillExecutingToolIds.add(toolId);
      }),
      false,
      n('callOrviloSkillTool/start'),
    );

    try {
      const response = await toolsClient.market.connectCallTool.mutate({
        args,
        provider,
        toolName,
        topicId,
      });

      this.#set(
        produce((draft: OrviloSkillStoreState) => {
          draft.orviloSkillExecutingToolIds.delete(toolId);
        }),
        false,
        n('callOrviloSkillTool/success'),
      );

      if (response.success === false) {
        const responseError = (response as any).error;
        let dataMessage: string | undefined;

        if (typeof response.data === 'string') {
          dataMessage = response.data;
        } else if (response.data !== undefined && response.data !== null) {
          dataMessage = JSON.stringify(response.data);
        }

        return {
          data: response.data,
          error: responseError?.message || dataMessage || 'Orvilo Skill call failed',
          errorCode: responseError?.code,
          success: false,
        };
      }

      return { data: response.data, success: true };
    } catch (error) {
      console.error('[OrviloSkill] Failed to call tool:', error);

      this.#set(
        produce((draft: OrviloSkillStoreState) => {
          draft.orviloSkillExecutingToolIds.delete(toolId);
        }),
        false,
        n('callOrviloSkillTool/error'),
      );

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('NOT_CONNECTED') || errorMessage.includes('TOKEN_EXPIRED')) {
        return {
          error: errorMessage,
          errorCode: 'NOT_CONNECTED',
          success: false,
        };
      }

      return {
        error: errorMessage,
        success: false,
      };
    }
  };

  checkOrviloSkillStatus = async (provider: string): Promise<OrviloSkillServer | undefined> => {
    this.#set(
      produce((draft: OrviloSkillStoreState) => {
        draft.orviloSkillLoadingIds.add(provider);
      }),
      false,
      n('checkOrviloSkillStatus/start'),
    );

    try {
      const response = await toolsClient.market.connectGetStatus.query({ provider });
      // Get provider config from local definition for correct display name
      const providerConfig = getOrviloSkillProviderById(provider);

      const server: OrviloSkillServer = {
        cachedAt: Date.now(),
        icon: response.icon,
        identifier: provider,
        isConnected: response.connected,
        // Use local config label (e.g., "Linear") instead of API's providerName
        name: providerConfig?.label || provider,
        providerUsername: response.connection?.providerUsername,
        scopes: response.connection?.scopes,
        status: response.connected ? OrviloSkillStatus.CONNECTED : OrviloSkillStatus.NOT_CONNECTED,
        tokenExpiresAt: response.connection?.tokenExpiresAt,
      };

      this.#set(
        produce((draft: OrviloSkillStoreState) => {
          const existingIndex = draft.orviloSkillServers.findIndex(
            (s) => s.identifier === provider,
          );
          if (existingIndex >= 0) {
            draft.orviloSkillServers[existingIndex] = server;
          } else {
            draft.orviloSkillServers.push(server);
          }
          draft.orviloSkillLoadingIds.delete(provider);
        }),
        false,
        n('checkOrviloSkillStatus/success'),
      );

      if (server.isConnected) {
        this.#get().refreshOrviloSkillTools(provider);
      }

      return server;
    } catch (error) {
      console.error('[OrviloSkill] Failed to check status:', error);

      this.#set(
        produce((draft: OrviloSkillStoreState) => {
          draft.orviloSkillLoadingIds.delete(provider);
        }),
        false,
        n('checkOrviloSkillStatus/error'),
      );

      return undefined;
    }
  };

  getOrviloSkillAuthorizeUrl = async (
    provider: string,
    options?: { redirectUri?: string; scopes?: string[] },
  ): Promise<{ authorizeUrl: string; code: string; expiresIn: number }> => {
    const response = await toolsClient.market.connectGetAuthorizeUrl.query({
      provider,
      redirectUri: options?.redirectUri,
      scopes: options?.scopes,
    });

    return {
      authorizeUrl: response.authorizeUrl,
      code: response.code,
      expiresIn: response.expiresIn,
    };
  };

  internal_updateOrviloSkillServer = (
    provider: string,
    update: Partial<OrviloSkillServer>,
  ): void => {
    this.#set(
      produce((draft: OrviloSkillStoreState) => {
        const serverIndex = draft.orviloSkillServers.findIndex((s) => s.identifier === provider);
        if (serverIndex >= 0) {
          draft.orviloSkillServers[serverIndex] = {
            ...draft.orviloSkillServers[serverIndex],
            ...update,
          };
        }
      }),
      false,
      n('internal_updateOrviloSkillServer'),
    );
  };

  refreshOrviloSkillToken = async (provider: string): Promise<boolean> => {
    try {
      const response = await toolsClient.market.connectRefresh.mutate({ provider });

      if (response.refreshed) {
        this.#get().internal_updateOrviloSkillServer(provider, {
          status: OrviloSkillStatus.CONNECTED,
          tokenExpiresAt: response.connection?.tokenExpiresAt,
        });
      }

      return response.refreshed;
    } catch (error) {
      console.error('[OrviloSkill] Failed to refresh token:', error);
      return false;
    }
  };

  refreshOrviloSkillTools = async (provider: string): Promise<void> => {
    try {
      const response = await toolsClient.market.connectListTools.query({ provider });

      this.#set(
        produce((draft: OrviloSkillStoreState) => {
          const serverIndex = draft.orviloSkillServers.findIndex((s) => s.identifier === provider);
          if (serverIndex >= 0) {
            draft.orviloSkillServers[serverIndex].tools = response.tools as OrviloSkillTool[];
          }
        }),
        false,
        n('refreshOrviloSkillTools/success'),
      );
    } catch (error) {
      console.error('[OrviloSkill] Failed to refresh tools:', error);
    }
  };

  revokeOrviloSkill = async (provider: string): Promise<void> => {
    this.#set(
      produce((draft: OrviloSkillStoreState) => {
        draft.orviloSkillLoadingIds.add(provider);
      }),
      false,
      n('revokeOrviloSkill/start'),
    );

    try {
      await toolsClient.market.connectRevoke.mutate({ provider });

      this.#set(
        produce((draft: OrviloSkillStoreState) => {
          draft.orviloSkillServers = draft.orviloSkillServers.filter(
            (s) => s.identifier !== provider,
          );
          draft.orviloSkillLoadingIds.delete(provider);
        }),
        false,
        n('revokeOrviloSkill/success'),
      );
    } catch (error) {
      console.error('[OrviloSkill] Failed to revoke:', error);

      this.#set(
        produce((draft: OrviloSkillStoreState) => {
          draft.orviloSkillLoadingIds.delete(provider);
        }),
        false,
        n('revokeOrviloSkill/error'),
      );
    }
  };

  useFetchOrviloSkillConnections = (enabled: boolean): SWRResponse<OrviloSkillServer[]> => {
    const isSignedIn = useUserStore(authSelectors.isLogin);

    return useSWR<OrviloSkillServer[]>(
      enabled && isSignedIn ? toolKeys.orviloSkillConnections() : null,
      async () => {
        const response = await toolsClient.market.connectListConnections.query();

        // Debug logging

        return response.connections.map((conn: any) => {
          // Debug logging for each connection

          // Get provider config from local definition for correct display name
          const providerConfig = getOrviloSkillProviderById(conn.providerId);
          return {
            cachedAt: Date.now(),
            icon: conn.icon,
            identifier: conn.providerId,
            isConnected: true,
            // Use local config label (e.g., "Linear") instead of API's providerName (which is user's name on that service)
            name: providerConfig?.label || conn.providerId,
            providerUsername: conn.providerUsername,
            scopes: conn.scopes,
            status: OrviloSkillStatus.CONNECTED,
            tokenExpiresAt: conn.tokenExpiresAt,
          };
        });
      },
      {
        onSuccess: (data) => {
          if (data.length > 0) {
            this.#set(
              produce((draft: OrviloSkillStoreState) => {
                const existingIds = new Set(draft.orviloSkillServers.map((s) => s.identifier));
                const newServers = data.filter((s) => !existingIds.has(s.identifier));
                draft.orviloSkillServers = [...draft.orviloSkillServers, ...newServers];
              }),
              false,
              n('useFetchOrviloSkillConnections'),
            );

            for (const server of data) {
              this.#get().refreshOrviloSkillTools(server.identifier);
            }
          }
        },
        revalidateOnFocus: false,
        shouldRetryOnError: false,
      },
    );
  };

  useFetchProviderTools = (provider: string | undefined): SWRResponse<OrviloSkillTool[]> => {
    return useSWR<OrviloSkillTool[]>(
      provider ? toolKeys.orviloSkillTools(provider) : null,
      async () => {
        const response = await toolsClient.market.connectListTools.query({ provider: provider! });
        return (response.tools || []).map((tool: any) => ({
          description: tool.description,
          inputSchema: tool.inputSchema,
          name: tool.name,
        }));
      },
      {
        fallbackData: [],
        revalidateOnFocus: false,
      },
    );
  };
}

export type OrviloSkillStoreAction = Pick<
  OrviloSkillStoreActionImpl,
  keyof OrviloSkillStoreActionImpl
>;
