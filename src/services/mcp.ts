import { type PluginManifest } from '@lobehub/market-sdk';
import {
  type ChatToolPayload,
  type CheckMcpInstallResult,
  type CustomPluginMetadata,
  type DeviceActionSubject,
} from '@orvilo/types';
import { isLocalOrPrivateUrl, safeParseJSON } from '@orvilo/utils';
import { deserializeMcpIpcPayload, serializeMcpIpcPayload } from '@orvilo/utils/mcpIpcPayload';

import { type MCPToolCallResult } from '@/libs/mcp';
import { toolsClient } from '@/libs/trpc/client';
import { resolveLocalExecutionIdentity } from '@/services/localExecutionIdentity';
import {
  TargetQueryFailedError,
  TargetRequiredError,
  UnsupportedDeviceOperationError,
} from '@/services/targetRequiredError';
import { ensureElectronIpc } from '@/utils/electron/ipc';

import { discoverService } from './discover';

/**
 * Explicit execution-device scope for a device-MCP operation. Every public
 * call names exactly one scope — a call carrying NO execution context never
 * resolves to the local host, and this host's own device id is only ever
 * evidence that the target IS this machine — never an authorization or a
 * default choice:
 *
 * - `{kind:'local'}` — this host's proven local device (settings installs,
 *   connector sync, connection tests). Identity is still re-verified; an
 *   unprovable local device fails as `TARGET_REQUIRED`, never silently local.
 * - `{kind:'device'}` — a named registered device. Local transport only when
 *   the id matches this host's proven id; a foreign device has no client-side
 *   MCP device-RPC yet → honest `OPERATION_UNSUPPORTED`.
 * - `{kind:'topic'}` — a run/conversation: the persisted device binding
 *   (`metadata.executionConfig.boundDeviceId`, legacy `metadata.boundDeviceId`)
 *   decides. Bound → that device; authoritatively unbound → the client-executor
 *   run's own proven local device; UNREADABLE (cache miss AND authoritative
 *   fetch failed) → `TARGET_QUERY_FAILED`, never "unbound".
 */
export type McpDeviceScope =
  { deviceId: string; kind: 'device' } | { kind: 'local' } | { kind: 'topic'; topicId: string };

/**
 * Stable scope fragment for per-operation cache keys — install, manifest,
 * tool discovery, connection check, auth check and tool call keyed under the
 * SAME scope never collide across devices/conversations.
 */
export const mcpScopeCacheKey = (scope: McpDeviceScope | undefined): string => {
  if (!scope) return 'scope:none';
  switch (scope.kind) {
    case 'device': {
      return `device:${scope.deviceId}`;
    }
    case 'local': {
      return 'device:this';
    }
    case 'topic': {
      return `topic:${scope.topicId}`;
    }
  }
};

interface McpScopeOptions {
  /** Legacy positional device id — equivalent to `{kind:'device', deviceId}`. */
  deviceId?: string;
  /** The operation's explicit scope; wins over every legacy field. */
  scope?: McpDeviceScope;
  signal?: AbortSignal;
  /**
   * Optional execution subject for provenance — a `resource` subject pins its
   * `resource.deviceId` as the device scope; a `run` subject contributes to
   * cache-key namespacing.
   */
  subject?: DeviceActionSubject;
  /** Legacy conversation id — equivalent to `{kind:'topic', topicId}`. */
  topicId?: string;
}

interface McpQueryScopeOptions {
  deviceId?: string;
  scope?: McpDeviceScope;
  signal?: AbortSignal;
  subject?: DeviceActionSubject;
}

/**
 * Accept the legacy positional `AbortSignal` or the scope options object, so
 * existing callsites keep compiling behind the new contract.
 */
const normalizeScopeOptions = <T extends { signal?: AbortSignal }>(options?: AbortSignal | T): T =>
  options instanceof AbortSignal ? ({ signal: options } as T) : (options ?? ({} as T));

/**
 * Resolve the caller-facing options to the single explicit scope. An explicit
 * `scope` wins; a `resource` subject pins its device; the legacy `deviceId` /
 * `topicId` fields map onto the union for call-site compatibility.
 */
const normalizeMcpScope = (
  options?: McpQueryScopeOptions | McpScopeOptions,
): McpDeviceScope | undefined =>
  options?.scope ??
  (options?.subject?.kind === 'resource'
    ? { deviceId: options.subject.resource.deviceId, kind: 'device' }
    : options?.deviceId
      ? { deviceId: options.deviceId, kind: 'device' }
      : options?.topicId
        ? { kind: 'topic', topicId: options.topicId }
        : undefined);

/**
 * The topic's persisted device binding as a tri-state — `unknown` means the
 * binding could not be read (cache miss AND authoritative fetch failed or
 * denied), which is NEVER "unbound": unbound is an explicit answer.
 */
type TopicDeviceBinding =
  { deviceId: string; status: 'bound' } | { status: 'unbound' } | { status: 'unknown' };

/**
 * The operation's resolved execution target. `unset` = the call carried no
 * execution context at all — device-scoped endpoints must fail on it, never
 * default to the local host.
 */
type McpResolvedTarget =
  | { deviceId: string; kind: 'device' }
  | { kind: 'local' }
  | { kind: 'query-failed' }
  | { kind: 'unset' };

/**
 * The device's own answer for an operation it cannot run through this client:
 * a bound remote device has no renderer-reachable MCP RPC yet (the gateway
 * tunnel is server-side only, inside dispatched runs), so this is
 * `OPERATION_UNSUPPORTED` in result form — never a silent empty result and
 * never a wrong-machine fallback.
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

/**
 * The scope named a conversation but its device binding could not be verified
 * (display-cache miss AND the authoritative `getTopicDetail` read failed or
 * denied). `TARGET_QUERY_FAILED` is the honest answer — retry the lookup —
 * never the local machine as a stand-in and never a fake success.
 */
const mcpTargetQueryFailed = (identifier: string, operation: string): MCPToolCallResult => {
  const message =
    `The execution device for MCP server '${identifier}' could not be verified ` +
    `for this ${operation}: the conversation's device binding is unreadable. ` +
    'Retry once the binding resolves — no other machine may answer instead.';
  return {
    content: message,
    error: { code: 'TARGET_QUERY_FAILED', message },
    state: { content: [{ text: message, type: 'text' }], isError: true },
    success: false,
  };
};

class MCPService {
  /**
   * The ONLY authorization for the local IPC transport: the resolved target
   * must BE this host's proven local device. `localDeviceId` is evidence of
   * sameness — never a default and never an authorization on its own.
   */
  async #canUseLocalIpc(target: McpResolvedTarget): Promise<boolean> {
    const { localDeviceId } = await resolveLocalExecutionIdentity();
    if (!localDeviceId) return false;
    if (target.kind === 'local') return true;
    if (target.kind === 'device') return target.deviceId === localDeviceId;
    return false;
  }

  /**
   * The execution device persisted on the conversation — the topic store is
   * only a DISPLAY cache: a missing row or a thrown read is `unknown`, not
   * "unbound". `unknown` escalates to the authoritative `getTopicDetail`
   * query; only a verified bound / unbound answer ever comes back as such.
   */
  async #topicDeviceBinding(topicId: string): Promise<TopicDeviceBinding> {
    try {
      const { topicSelectors } = await import('@/store/chat/selectors');
      const { getChatStoreState } = await import('@/store/chat/store');
      const topic = topicSelectors.getTopicById(topicId)(getChatStoreState());
      if (topic) {
        const boundDeviceId =
          topic.metadata?.executionConfig?.boundDeviceId ?? topic.metadata?.boundDeviceId;
        return boundDeviceId ? { deviceId: boundDeviceId, status: 'bound' } : { status: 'unbound' };
      }
    } catch {
      // The display cache is unavailable — escalate to the authoritative read.
    }

    try {
      const { lambdaClient } = await import('@/libs/trpc/client');
      const detail = await lambdaClient.topic.getTopicDetail.query({ id: topicId });
      if (!detail) return { status: 'unknown' };
      const boundDeviceId =
        detail.metadata?.executionConfig?.boundDeviceId ?? detail.metadata?.boundDeviceId;
      return boundDeviceId ? { deviceId: boundDeviceId, status: 'bound' } : { status: 'unbound' };
    } catch {
      return { status: 'unknown' };
    }
  }

  /**
   * Resolve the caller's explicit scope to a transport target. `topic` scope
   * consults the persisted binding: bound → that device; authoritatively
   * unbound → the client-executor run's own local device; unreadable →
   * `query-failed` (never "unbound").
   */
  async #resolveTarget(scope: McpDeviceScope | undefined): Promise<McpResolvedTarget> {
    if (!scope) return { kind: 'unset' };
    if (scope.kind === 'local') return { kind: 'local' };
    if (scope.kind === 'device') return { deviceId: scope.deviceId, kind: 'device' };
    const binding = await this.#topicDeviceBinding(scope.topicId);
    if (binding.status === 'bound') return { deviceId: binding.deviceId, kind: 'device' };
    if (binding.status === 'unbound') return { kind: 'local' };
    return { kind: 'query-failed' };
  }

  /**
   * Terminal failure for a device-scoped query the local IPC could not serve:
   * a foreign device → `OPERATION_UNSUPPORTED` (no client MCP device-RPC yet),
   * an unreadable binding → `TARGET_QUERY_FAILED`, an unproven local target or
   * a missing scope → `TARGET_REQUIRED`. Never a wrong-machine fallback.
   */
  #throwForUnresolvedTarget(target: McpResolvedTarget, operation: string): never {
    if (target.kind === 'device') {
      throw new UnsupportedDeviceOperationError(
        target.deviceId,
        operation,
        'device-scoped MCP endpoints must be probed on the bound device',
      );
    }
    if (target.kind === 'query-failed') {
      throw new TargetQueryFailedError(
        operation,
        "the conversation's device binding could not be read",
      );
    }
    throw new TargetRequiredError(operation);
  }

  async invokeMcpToolCall(payload: ChatToolPayload, options?: McpScopeOptions) {
    const { signal, topicId: legacyTopicId } = options ?? {};
    // The execution subject this call answers for: explicit scope wins, else
    // the legacy conversation id names a `topic` scope.
    const scope = normalizeMcpScope(options);
    const topicId = legacyTopicId ?? (scope?.kind === 'topic' ? scope.topicId : undefined);
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
    // A call carrying no execution context resolves `unset` — it never
    // defaults to the local host.
    const target = isDeviceScoped ? await this.#resolveTarget(scope) : undefined;
    const useLocalIpc = isDeviceScoped && !!target && (await this.#canUseLocalIpc(target));

    if (isDeviceScoped && !useLocalIpc && target) {
      if (target.kind === 'device') return deviceScopedMcpUnsupported(target.deviceId, identifier);
      if (target.kind === 'query-failed')
        return mcpTargetQueryFailed(identifier, `invokeMcpToolCall(${apiName})`);
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
    const resolvedOptions = normalizeScopeOptions<McpQueryScopeOptions>(options);
    const { signal } = resolvedOptions;

    // A localhost / LAN URL must be probed in the NETWORK SPACE of the
    // connecting device — on the proven-local device via IPC (the backend's
    // fetch cannot reach the viewer's localhost). A bound remote device has no
    // client-side device-RPC yet → structured unsupported. An unreadable
    // binding or a missing scope fails the same way every device-scoped
    // endpoint does — never the local host as a stand-in.
    if (isLocalOrPrivateUrl(params.url)) {
      const target = await this.#resolveTarget(normalizeMcpScope(resolvedOptions));
      if (await this.#canUseLocalIpc(target)) {
        // Note: IPC doesn't support AbortSignal yet
        const serialized = serializeMcpIpcPayload(params);
        const serializedResult = await ensureElectronIpc().mcp.getStreamableMcpServerManifest(
          serialized as any,
        );
        return deserializeMcpIpcPayload(serializedResult) as any;
      }
      this.#throwForUnresolvedTarget(target, 'getStreamableMcpServerManifest');
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
    const resolvedOptions = normalizeScopeOptions<McpQueryScopeOptions>(options);

    // stdio probes the device that will run the command: the proven-local
    // device over IPC, a bound remote device is unsupported (no device RPC),
    // an unreadable binding or missing scope is a failed query — never a
    // silent local probe on a machine the operation does not target.
    const target = await this.#resolveTarget(normalizeMcpScope(resolvedOptions));
    if (!(await this.#canUseLocalIpc(target))) {
      this.#throwForUnresolvedTarget(target, 'getStdioMcpServerManifest');
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
   * that will run the server, so the check runs in that device's scope. The
   * scope is explicit: `{kind:'local'}` for settings flows, `{kind:'device'}`
   * or `{kind:'topic'}` when the install targets another machine; a call with
   * no execution context fails `TARGET_REQUIRED`, never defaults local.
   * @param manifest MCP plugin manifest
   * @param options AbortSignal, or `{ scope, signal }`
   * @returns Installation check result
   */
  async checkInstallation(
    manifest: PluginManifest,
    options?: AbortSignal | McpQueryScopeOptions,
  ): Promise<CheckMcpInstallResult> {
    const resolvedOptions = normalizeScopeOptions<McpQueryScopeOptions>(options);

    const target = await this.#resolveTarget(normalizeMcpScope(resolvedOptions));
    if (!(await this.#canUseLocalIpc(target))) {
      this.#throwForUnresolvedTarget(target, 'checkInstallation');
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
