import { type PluginManifest } from '@lobehub/market-sdk';
import {
  type ChatToolPayload,
  type CheckMcpInstallResult,
  type CustomPluginMetadata,
} from '@orvilo/types';
import { isLocalOrPrivateUrl, safeParseJSON } from '@orvilo/utils';
import { deserializeMcpIpcPayload, serializeMcpIpcPayload } from '@orvilo/utils/mcpIpcPayload';

import { type MCPToolCallResult } from '@/libs/mcp';
import { toolsClient } from '@/libs/trpc/client';
import { resolveLocalExecutionIdentity } from '@/services/localExecutionIdentity';
import {
  TargetRequiredError,
  UnsupportedDeviceOperationError,
} from '@/services/targetRequiredError';
import { ensureElectronIpc } from '@/utils/electron/ipc';

import { discoverService } from './discover';

/**
 * Execution-device scope for an MCP operation. `deviceId` binds the operation
 * to a registered device; `topicId` resolves the bound device persisted on the
 * conversation (`metadata.executionConfig.boundDeviceId`, legacy
 * `metadata.boundDeviceId`). When neither is present the scope is the legacy
 * viewer-local one — which now requires proven local device identity, never a
 * bare `isDesktop`.
 */
interface McpScopeOptions {
  /** Bound execution device this operation runs on. */
  deviceId?: string;
  signal?: AbortSignal;
  topicId?: string;
}

interface McpQueryScopeOptions {
  deviceId?: string;
  signal?: AbortSignal;
}

/**
 * Accept the legacy positional `AbortSignal` or the scope options object, so
 * existing callsites keep compiling behind the new contract.
 */
const normalizeScopeOptions = <T extends { deviceId?: string; signal?: AbortSignal }>(
  options?: AbortSignal | T,
): T => (options instanceof AbortSignal ? ({ signal: options } as T) : (options ?? ({} as T)));

/**
 * The device's own answer for an operation it cannot run through this client:
 * a bound remote device has no renderer-reachable MCP RPC yet (the gateway
 * tunnel is server-side), so this is `OPERATION_UNSUPPORTED` in result form —
 * never a silent empty result and never a wrong-machine fallback.
 */
const deviceScopedMcpUnsupported = (deviceId: string, identifier: string): MCPToolCallResult => {
  const message =
    `MCP server '${identifier}' runs on the bound device (${deviceId}), but this ` +
    'client has no device-RPC channel for MCP yet — the tool can only run inside ' +
    'an agent run dispatched to that device.';
  return {
    content: message,
    error: { code: 'OPERATION_UNSUPPORTED', deviceId, message },
    state: { content: [{ text: message, type: 'text' }], isError: true },
    success: false,
  };
};

class MCPService {
  /**
   * Whether this MCP operation may use the local Electron IPC transport: the
   * bound device must be this host's proven local device, or — for the legacy
   * unbound scope — this host must prove local identity. A bound foreign device
   * never resolves local.
   */
  async #resolveIsLocalTarget(boundDeviceId: string | undefined): Promise<boolean> {
    const { localDeviceId } = await resolveLocalExecutionIdentity();
    return boundDeviceId === undefined ? !!localDeviceId : boundDeviceId === localDeviceId;
  }

  /**
   * The execution device persisted on the conversation. Read lazily through a
   * dynamic import — a static store import would cycle back into this service.
   */
  async #topicBoundDeviceId(topicId: string | undefined): Promise<string | undefined> {
    if (!topicId) return;
    try {
      const { topicSelectors } = await import('@/store/chat/selectors');
      const { getChatStoreState } = await import('@/store/chat/store');
      const topic = topicSelectors.getTopicById(topicId)(getChatStoreState());
      return topic?.metadata?.executionConfig?.boundDeviceId ?? topic?.metadata?.boundDeviceId;
    } catch {
      return;
    }
  }

  /**
   * The execution-device scope for a device-only MCP endpoint (stdio, or an
   * http endpoint on the device's own localhost / LAN — those resolve in the
   * NETWORK SPACE of the connecting device, never the backend's or the
   * viewer's). Explicit `deviceId` beats the topic binding.
   */
  async #resolveDeviceScope(options: McpScopeOptions): Promise<string | undefined> {
    return options.deviceId ?? (await this.#topicBoundDeviceId(options.topicId));
  }

  async invokeMcpToolCall(payload: ChatToolPayload, options?: McpScopeOptions) {
    const { signal, topicId } = options ?? {};
    await discoverService.safeInjectMPToken();

    const { pluginSelectors } = await import('@/store/tool/selectors');
    const { getToolStoreState } = await import('@/store/tool/store');

    const s = getToolStoreState();
    const { identifier, arguments: args, apiName } = payload;

    // Connector-first: custom connectors execute server-side with their stored
    // (encrypted) OAuth token, so route them before the plugin path. The client
    // has no credentials, hence the dedicated `connector.callTool` endpoint —
    // which itself rejects device-only endpoints the cloud cannot reach.
    // Only connectors with a real MCP endpoint are routed here — Orvilo/Composio
    // skills synced into the connector store have no mcpServerUrl and keep their
    // original executor path.
    const { connectorSelectors } = await import('@/store/tool/slices/connector');
    const connector = connectorSelectors.connectorByIdentifier(identifier)(s);
    if (
      connector &&
      connector.isEnabled &&
      (connector.mcpServerUrl || connector.mcpConnectionType === 'stdio')
    ) {
      const { lambdaClient } = await import('@/libs/trpc/client');
      return (await lambdaClient.connector.callTool.mutate(
        { args, identifier, toolName: apiName },
        { signal },
      )) as MCPToolCallResult;
    }

    const installPlugin = pluginSelectors.getInstalledPluginById(identifier)(s);
    const customPlugin = pluginSelectors.getCustomPluginById(identifier)(s);

    const plugin = installPlugin || customPlugin;

    if (!plugin) return;

    const connection = plugin.customParams?.mcp;
    const settingsEntries = plugin.settings
      ? Object.entries(plugin.settings as Record<string, any>).filter(
          ([, value]) => value !== undefined && value !== null,
        )
      : [];
    const pluginSettings =
      settingsEntries.length > 0
        ? settingsEntries.reduce<Record<string, unknown>>((acc, [key, value]) => {
            acc[key] = value;

            return acc;
          }, {})
        : undefined;

    const params = {
      ...connection,
      name: identifier,
    } as any;

    if (connection?.type === 'http') {
      params.headers = {
        ...connection.headers,
        ...pluginSettings,
      };
    }

    if (connection?.type === 'stdio') {
      params.env = {
        ...connection?.env,
        ...pluginSettings,
      };
    }

    const isStdio = connection?.type === 'stdio';
    const isCloud = connection?.type === 'cloud';
    const isCustomPlugin = !!customPlugin;

    // Device-scoped endpoints need the connecting device's process table /
    // network space: stdio spawns a binary on it, localhost / LAN URLs only
    // resolve inside it. Anything else (public http) is a managed server-side
    // connection — the toolsClient relay is correct on every client.
    const isDeviceScoped =
      isStdio || (connection?.type === 'http' && isLocalOrPrivateUrl(params.url));

    // One scope per call — the device a query/install/auth check sees must be
    // the device the tool call executes on (never query-on-A, execute-on-B).
    const boundDeviceId = isDeviceScoped
      ? await this.#resolveDeviceScope({ deviceId: options?.deviceId, topicId })
      : undefined;
    const useLocalIpc = isDeviceScoped && (await this.#resolveIsLocalTarget(boundDeviceId));

    if (isDeviceScoped && !useLocalIpc) {
      if (boundDeviceId) return deviceScopedMcpUnsupported(boundDeviceId, identifier);
      throw new TargetRequiredError(`invokeMcpToolCall(${identifier}/${apiName})`);
    }

    // Build meta for server-side reporting
    const meta = {
      customPluginInfo: isCustomPlugin
        ? {
            avatar: plugin.manifest?.meta.avatar,
            description: plugin.manifest?.meta.description,
            name: plugin.manifest?.meta.title,
          }
        : undefined,
      isCustomPlugin,
      sessionId: topicId,
      version: plugin.manifest?.version || 'unknown',
    };

    const data = {
      // For desktop IPC, always pass a record/object for tool "arguments"
      // (IPC layer serializes the whole payload into a JSON envelope).
      args: useLocalIpc ? (safeParseJSON(args) ?? {}) : args,
      env: connection?.type === 'stdio' ? params.env : (pluginSettings ?? connection?.env),
      meta,
      params,
      toolName: apiName,
    };

    let result: MCPToolCallResult | undefined;

    // For cloud type, call via cloud gateway
    if (isCloud) {
      // Parse args
      const apiParams = safeParseJSON(args) || {};

      // Call cloud gateway via tools market endpoint
      // Server will automatically get user access token from database
      // and format the result to MCPToolCallResult
      // Server-side also handles telemetry reporting
      result = await toolsClient.market.callCloudMcpEndpoint.mutate({
        apiParams,
        identifier,
        meta,
        toolName: apiName,
      });
    } else if (useLocalIpc && isStdio) {
      // stdio spawns on the (proven) local device via IPC in the main process.
      // Note: IPC doesn't support AbortSignal yet
      const serialized = serializeMcpIpcPayload(data);
      const serializedResult = await ensureElectronIpc().mcp.callTool(serialized as any);
      result = deserializeMcpIpcPayload(serializedResult) as any;
    } else if (useLocalIpc) {
      // localhost / LAN http endpoint: same rule, the local device's network —
      // `callHttpTool` is the http counterpart of the stdio `callTool` IPC.
      const serialized = serializeMcpIpcPayload(data);
      const serializedResult = await ensureElectronIpc().mcp.callHttpTool(serialized as any);
      result = deserializeMcpIpcPayload(serializedResult) as any;
    } else {
      // For other types, use the toolsClient
      result = await toolsClient.mcp.callTool.mutate(data, { signal });
    }

    return result;
  }

  async getStreamableMcpServerManifest(
    params: {
      auth?: {
        accessToken?: string;
        token?: string;
        type: 'none' | 'bearer' | 'oauth2';
      };
      headers?: Record<string, string>;
      identifier: string;
      metadata?: CustomPluginMetadata;
      url: string;
    },
    options?: AbortSignal | McpQueryScopeOptions,
  ) {
    const { deviceId, signal } = normalizeScopeOptions<McpQueryScopeOptions>(options);

    // A localhost / LAN URL must be probed in the NETWORK SPACE of the
    // connecting device — on the proven-local device via IPC (the backend's
    // fetch cannot reach the viewer's localhost). On a bound remote device no
    // client-side device-RPC exists yet → structured unsupported. On web
    // without a bound device there is no such network → TargetRequiredError.
    if (isLocalOrPrivateUrl(params.url)) {
      if (await this.#resolveIsLocalTarget(deviceId)) {
        // Note: IPC doesn't support AbortSignal yet
        const serialized = serializeMcpIpcPayload(params);
        const serializedResult = await ensureElectronIpc().mcp.getStreamableMcpServerManifest(
          serialized as any,
        );
        return deserializeMcpIpcPayload(serializedResult) as any;
      }
      if (deviceId) {
        throw new UnsupportedDeviceOperationError(
          deviceId,
          'getStreamableMcpServerManifest',
          'local/private MCP endpoints must be probed on the bound device',
        );
      }
      throw new TargetRequiredError('getStreamableMcpServerManifest(local/private url)');
    }

    // Otherwise use toolsClient (via server relay) — a public endpoint is a
    // managed server-side connection, same scope on every client.
    return toolsClient.mcp.getStreamableMcpServerManifest.query(params, { signal });
  }

  async getStdioMcpServerManifest(
    stdioParams: {
      args?: string[];
      command: string;
      env?: Record<string, string>;
      name: string;
    },
    metadata?: CustomPluginMetadata,
    options?: AbortSignal | McpQueryScopeOptions,
  ) {
    const { deviceId } = normalizeScopeOptions<McpQueryScopeOptions>(options);

    // stdio probes the device that will run the command: the proven-local
    // device over IPC, a bound remote device is unsupported (no device RPC).
    if (!(await this.#resolveIsLocalTarget(deviceId))) {
      if (deviceId) {
        throw new UnsupportedDeviceOperationError(
          deviceId,
          'getStdioMcpServerManifest',
          'stdio manifests must be probed on the device that runs the command',
        );
      }
      throw new TargetRequiredError('getStdioMcpServerManifest');
    }

    // Note: IPC doesn't support AbortSignal yet
    const serialized = serializeMcpIpcPayload({ ...stdioParams, metadata });
    const serializedResult = await ensureElectronIpc().mcp.getStdioMcpServerManifest(
      serialized as any,
    );
    return deserializeMcpIpcPayload(serializedResult) as any;
  }

  /**
   * Check MCP plugin installation status — the dependencies live on the device
   * that will run the server, so the check runs in that device's scope.
   * @param manifest MCP plugin manifest
   * @param options AbortSignal, or `{ deviceId, signal }` scope
   * @returns Installation check result
   */
  async checkInstallation(
    manifest: PluginManifest,
    options?: AbortSignal | McpQueryScopeOptions,
  ): Promise<CheckMcpInstallResult> {
    const { deviceId } = normalizeScopeOptions<McpQueryScopeOptions>(options);

    if (!(await this.#resolveIsLocalTarget(deviceId))) {
      if (deviceId) {
        throw new UnsupportedDeviceOperationError(
          deviceId,
          'checkInstallation',
          'installation checks must run on the device that will run the server',
        );
      }
      throw new TargetRequiredError('checkInstallation');
    }

    // Pass all deployment options to main process for checking
    // Note: IPC doesn't support AbortSignal yet
    const serialized = serializeMcpIpcPayload({
      deploymentOptions: manifest.deploymentOptions as any,
    });
    const serializedResult = await ensureElectronIpc().mcp.validMcpServerInstallable(
      serialized as any,
    );
    return deserializeMcpIpcPayload(serializedResult) as any;
  }
}

export const mcpService = new MCPService();
