import { getActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { connectorService } from '@/services/connector';
import type { StoreSetter } from '@/store/types';

import type { ToolStore } from '../../store';

type Setter = StoreSetter<ToolStore>;

export const createConnectorSlice = (set: Setter, get: () => ToolStore, _api?: unknown) =>
  new ConnectorActionImpl(set, get, _api);

export class ConnectorActionImpl {
  readonly #set: Setter;
  // A later request wins only after it succeeds; a failed refresh must not
  // discard an earlier valid response for the same scope.
  #connectorListRequestId = 0;
  #connectorListCommittedRequestIds = new Map<string | null, number>();
  #agentBoundListRequestId = 0;
  #agentBoundListCommittedRequestIds = new Map<string | null, number>();

  constructor(set: Setter, _get: () => ToolStore, _api?: unknown) {
    void _api;
    this.#set = set;
    void _get;
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
}

export type ConnectorAction = Pick<ConnectorActionImpl, keyof ConnectorActionImpl>;
