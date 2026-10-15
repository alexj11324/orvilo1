import { isDesktop } from '@orvilo/const';
import { isLocalOrPrivateUrl } from '@orvilo/utils';

import { getActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import type { ConnectorToolPermission } from '@/database/schemas';
import { connectorService } from '@/services/connector';
import { mcpService } from '@/services/mcp';
import type { StoreSetter } from '@/store/types';

import type { ToolStore } from '../../store';

type Setter = StoreSetter<ToolStore>;

export const createConnectorSlice = (set: Setter, get: () => ToolStore, _api?: unknown) =>
  new ConnectorActionImpl(set, get, _api);

export class ConnectorActionImpl {
  readonly #set: Setter;
  readonly #get: () => ToolStore;
  // A later request wins only after it succeeds; a failed refresh must not
  // discard an earlier valid response for the same scope.
  #connectorListRequestId = 0;
  #connectorListCommittedRequestIds = new Map<string | null, number>();
  #agentBoundListRequestId = 0;
  #agentBoundListCommittedRequestIds = new Map<string | null, number>();

  constructor(set: Setter, get: () => ToolStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  /**
   * Whether the scope captured when a request was issued is still the active
   * one. Connector lists are workspace-scoped server-side (the request carries
   * the active workspace as a header), but the store bucket is a single global
   * one — so a late response must not be written after the scope moved on.
   *
   * Booting straight into a workspace URL is exactly that case: the tree mounts
   * once in personal context before the URL→store sync resolves the slug, so a
   * personal `list` query is already in flight when the workspace switch fires
   * its own. Whichever lands last wins, and when that is the personal one the
   * workspace's own tools vanish from the tool picker for the rest of the
   * session. In the open-source build there are no workspaces and
   * `getActiveWorkspaceId()` is always `null`, so this is a no-op.
   *
   * Dropping a response deliberately leaves the one-shot init flag alone
   * rather than marking the bucket loaded: a scope change remounts the
   * workspace context slot's subtree, so the consumers gated on that flag
   * re-issue their fetch under the new scope and the discarded result is not
   * one anybody still needs.
   */
  #isStillInScope = (scope: string | null): boolean => getActiveWorkspaceId() === scope;

  fetchConnectors = async (): Promise<void> => {
    const scope = getActiveWorkspaceId();
    const requestId = ++this.#connectorListRequestId;
    const data = await connectorService.list();
    const committedRequestId = this.#connectorListCommittedRequestIds.get(scope) ?? 0;
    if (!this.#isStillInScope(scope) || requestId <= committedRequestId) return;
    this.#connectorListCommittedRequestIds.set(scope, requestId);
    this.#set(
      { connectors: data as any, connectorsScopeId: scope, isConnectorsInit: true },
      false,
      'fetchConnectors',
    );
  };

  /**
   * Refresh the connector lists after a mutation. Always refreshes the base
   * list; also refreshes the agent-bound aggregate when it has been loaded (the
   * unified settings page), so a connector-detail action on an agent connector
   * (delete / sync / permission reset) updates that list too. On base-only
   * pages `isAgentBoundInit` is false, so this stays a single query.
   */
  #refreshConnectorLists = async (): Promise<void> => {
    const tasks = [this.fetchConnectors()];
    if (this.#get().isAgentBoundInit) tasks.push(this.fetchAgentBoundConnectors());
    await Promise.all(tasks);
  };

  /**
   * Fetch every agent-owned connector across all agents (the flat aggregate for
   * the unified connector-settings page). Each row is enriched
   * server-side with the owning agent's title/avatar. Scope-correct: a workspace
   * context only returns that workspace's agent connectors.
   */
  fetchAgentBoundConnectors = async (): Promise<void> => {
    const scope = getActiveWorkspaceId();
    const requestId = ++this.#agentBoundListRequestId;
    const data = await connectorService.listAgentBound();
    const committedRequestId = this.#agentBoundListCommittedRequestIds.get(scope) ?? 0;
    if (!this.#isStillInScope(scope) || requestId <= committedRequestId) return;
    this.#agentBoundListCommittedRequestIds.set(scope, requestId);
    this.#set(
      { agentBoundConnectors: data as any, isAgentBoundInit: true },
      false,
      'fetchAgentBoundConnectors',
    );
  };

  /**
   * Fetch an agent's own tools (agent-owned + mounted) for the "Agent Tools"
   * tab. Stored keyed by agentId.
   */
  fetchAgentConnectors = async (agentId: string): Promise<void> => {
    const scope = getActiveWorkspaceId();
    const data = await connectorService.listByAgent({ agentId });
    if (!this.#isStillInScope(scope)) return;
    this.#set(
      (s) => ({
        agentConnectors: { ...s.agentConnectors, [agentId]: data as any },
        agentConnectorsInit: { ...s.agentConnectorsInit, [agentId]: true },
      }),
      false,
      'fetchAgentConnectors',
    );
  };

  /** Copy a user connector into an agent-owned, independently editable row. */
  copyConnectorToAgent = async (connectorId: string, agentId: string): Promise<string> => {
    const { id } = await connectorService.copyToAgent({ agentId, connectorId });
    await this.fetchAgentConnectors(agentId);
    return id;
  };

  /** Mount (reference + lock) a user connector onto an agent. */
  mountConnectorToAgent = async (connectorId: string, agentId: string): Promise<void> => {
    await connectorService.mountToAgent({ agentId, connectorId });
    await Promise.all([this.fetchAgentConnectors(agentId), this.fetchConnectors()]);
  };

  /** Unmount / detach a connector from an agent (unmounts or deletes the agent row). */
  detachConnectorFromAgent = async (
    connectorId: string,
    agentId: string,
    mode: 'unmount' | 'delete',
  ): Promise<void> => {
    if (mode === 'unmount') {
      await connectorService.unmountFromAgent({ connectorId });
    } else {
      await connectorService.delete({ id: connectorId });
    }
    await Promise.all([this.fetchAgentConnectors(agentId), this.fetchConnectors()]);
  };

  /**
   * Fetch the connector with its decrypted user-set credentials for the edit
   * form. Does NOT update the store — caller uses the result directly.
   * Machine-managed OAuth tokens are excluded server-side.
   */
  getConnectorForEdit = async (id: string) => {
    return connectorService.getForEdit({ id });
  };

  /**
   * Create (or idempotently update) a connector. `isNew` is the server's
   * knowledge of whether the row was freshly created — callers that roll back
   * on a later sync failure must use it instead of a client-side cache check,
   * which is unreliable before `fetchConnectors` has completed.
   */
  createConnector = async (
    params: Parameters<typeof connectorService.create>[0],
  ): Promise<{ id: string; isNew: boolean }> => {
    this.#set({ connectorCreating: true }, false, 'createConnector/start');
    try {
      const created = await connectorService.create(params);
      await this.fetchConnectors();
      return { id: created.id, isNew: created.isNew };
    } finally {
      this.#set({ connectorCreating: false }, false, 'createConnector/end');
    }
  };

  /**
   * Begin the OAuth authorization-code flow for a custom connector and return
   * the authorize URL for the caller to open in a popup. Resolves the client
   * via pre-registration or DCR on the server.
   */
  startConnectorOAuth = async (id: string, attempt?: string): Promise<string> => {
    const { authorizationUrl } = await connectorService.startOAuth({ attempt, id });
    return authorizationUrl;
  };

  /** Connect the official GitHub MCP through the server-held GitHub App grant. */
  connectGitHubMcp = async (attempt?: string) => {
    const result = await connectorService.connectGitHubMcp({ attempt });
    if (result.status === 'connected') await this.#refreshConnectorLists();
    return result;
  };

  deleteConnector = async (id: string): Promise<void> => {
    await connectorService.delete({ id });
    await this.#refreshConnectorLists();
  };

  updateConnector = async (
    id: string,
    patch: {
      credentials?:
        | { token: string; type: 'bearer' }
        | { headers: Record<string, string>; type: 'header' }
        | null;
      isEnabled?: boolean;
      mcpServerUrl?: string;
      metadata?: Record<string, unknown>;
      name?: string;
      oidcConfig?: {
        clientId?: string;
        clientSecret?: string;
        scheme?: 'pre_registration' | 'dcr' | 'client_id_metadata_document';
      };
    },
  ): Promise<void> => {
    await connectorService.update({ id, patch: patch as any });
    await this.#refreshConnectorLists();
  };

  syncConnectorTools = async (id: string): Promise<void> => {
    this.#set(
      (s) => ({ connectorSyncing: { ...s.connectorSyncing, [id]: true } }),
      false,
      'syncConnectorTools/start',
    );
    try {
      const syncedLocally = await this.#syncLocalConnectorTools(id);
      if (!syncedLocally) await connectorService.syncTools({ id });
      await this.#refreshConnectorLists();
    } finally {
      this.#set(
        (s) => ({ connectorSyncing: { ...s.connectorSyncing, [id]: false } }),
        false,
        'syncConnectorTools/end',
      );
    }
  };

  /**
   * Desktop-only install/refresh path for connectors the cloud server cannot
   * reach itself: stdio MCP (must spawn on this machine) and local/private
   * network HTTP endpoints. The server-side `syncTools` would try to connect
   * FROM the cloud and fail with "Failed to start MCP service process" /
   * "fetch failed" (#16533), so the client lists the tools locally (via the
   * Electron main process, same path Test Connection uses) and reports them
   * through `syncToolsFromClientById`.
   *
   * Returns false when the connector is server-reachable (public HTTP) or when
   * not running in desktop — the caller falls back to the server-side sync.
   */
  #syncLocalConnectorTools = async (id: string): Promise<boolean> => {
    if (!isDesktop) return false;

    // `getForEdit` returns the decrypted user-set credentials (bearer/apikey/
    // header) needed to connect locally. OAuth2 tokens are machine-managed and
    // never leave the server — but OAuth against a localhost endpoint would be
    // server-unreachable anyway, so that combination stays on the server path.
    const detail = await connectorService.getForEdit({ id });
    const isStdio = detail.mcpConnectionType === 'stdio';
    const isLocalHttp = !!detail.mcpServerUrl && isLocalOrPrivateUrl(detail.mcpServerUrl);
    if (!isStdio && !isLocalHttp) return false;

    let api: Array<{ description?: string; name: string; parameters?: Record<string, unknown> }>;
    // This sync only runs on desktop and only for device-local endpoints —
    // the manifest probes the machine it runs on, which is an explicit
    // `local` scope, not an implicit default.
    const localScope = { kind: 'local' } as const;
    if (isStdio) {
      if (!detail.mcpStdioConfig?.command) throw new Error('Connector is missing stdio config');
      const manifest = await mcpService.getStdioMcpServerManifest(
        {
          args: detail.mcpStdioConfig.args ?? [],
          command: detail.mcpStdioConfig.command,
          env: detail.mcpStdioConfig.env ?? undefined,
          name: detail.identifier,
        },
        undefined,
        { scope: localScope },
      );
      api = manifest.api ?? [];
    } else {
      const credentials = detail.credentials;
      const auth =
        credentials?.type === 'bearer'
          ? { token: credentials.token, type: 'bearer' as const }
          : credentials?.type === 'apikey'
            ? { token: credentials.apiKey, type: 'bearer' as const }
            : undefined;
      // Custom headers live in metadata.customHeaders; legacy rows stored them
      // as a 'header' credential — merge both, mirroring the server-side
      // buildConnectorMcpParams.
      const headerCreds = credentials?.type === 'header' ? credentials.headers : undefined;
      const customHeaders = detail.metadata?.customHeaders as Record<string, string> | undefined;
      const headers =
        headerCreds || customHeaders ? { ...headerCreds, ...customHeaders } : undefined;
      const manifest = await mcpService.getStreamableMcpServerManifest(
        {
          auth,
          headers,
          identifier: detail.identifier,
          url: detail.mcpServerUrl!,
        },
        { scope: localScope },
      );
      api = manifest.api ?? [];
    }

    await connectorService.syncToolsFromClientById({
      id,
      tools: api.map((a) => ({
        description: a.description,
        inputSchema: a.parameters,
        toolName: a.name,
      })),
    });
    return true;
  };

  disconnectConnector = async (id: string): Promise<void> => {
    await connectorService.update({
      id,
      patch: { isEnabled: false },
    });
    await this.#refreshConnectorLists();
  };

  /**
   * Reset all tool permissions for a connector back to 'auto' (fully open).
   */
  resetConnectorPermissions = async (id: string): Promise<void> => {
    await connectorService.resetPermissions({ id });
    await this.#refreshConnectorLists();
  };

  /**
   * Sync tools from a client-provided list (for Orvilo OAuth skills / Composio
   * that already have their tool list available on the client side).
   * Idempotent — safe to call whenever the detail panel opens.
   */
  syncToolsFromClient = async (params: {
    identifier: string;
    name: string;
    sourceType: 'builtin' | 'custom' | 'marketplace';
    tools: Array<{ description?: string; inputSchema?: Record<string, unknown>; toolName: string }>;
  }): Promise<string> => {
    const result = await connectorService.syncToolsFromClient(params);
    await this.fetchConnectors();
    return result.connectorId;
  };

  /**
   * Bootstrap connector entry for a builtin tool (reads manifest server-side).
   * Idempotent — safe to call whenever the detail panel opens.
   * Returns the connectorId.
   */
  syncBuiltinTool = async (identifier: string): Promise<string> => {
    const result = await connectorService.syncBuiltinTool({ identifier });
    await this.fetchConnectors();
    return result.connectorId;
  };

  /**
   * Bootstrap connector entry for an installed marketplace plugin.
   * Idempotent — safe to call whenever the detail panel opens.
   * Returns the connectorId, or `null` for legacy customPlugin rows that own
   * an MCP endpoint (those go through the frontend migration flow instead).
   */
  syncPluginTools = async (identifier: string): Promise<string | null> => {
    const result = await connectorService.syncPluginTools({ identifier });
    await this.fetchConnectors();
    return result.connectorId;
  };

  updateToolPermission = async (
    toolId: string,
    permission: ConnectorToolPermission,
  ): Promise<void> => {
    // Optimistic update — patch the tool in whichever list holds it (base
    // connectors and agent-bound connectors are separate arrays).
    const patchTools = <
      T extends { tools: Array<{ id: string; permission: ConnectorToolPermission }> },
    >(
      list: T[],
    ): T[] =>
      list.map((c) => ({
        ...c,
        tools: c.tools.map((t) => (t.id === toolId ? { ...t, permission } : t)),
      }));
    this.#set(
      (s) => ({
        agentBoundConnectors: patchTools(s.agentBoundConnectors ?? []),
        connectors: patchTools(s.connectors),
      }),
      false,
      'updateToolPermission/optimistic',
    );

    try {
      await connectorService.updateToolPermission({ permission, toolId });
    } catch {
      // Roll back on error
      await this.#refreshConnectorLists();
    }
  };
}

export type ConnectorAction = Pick<ConnectorActionImpl, keyof ConnectorActionImpl>;
