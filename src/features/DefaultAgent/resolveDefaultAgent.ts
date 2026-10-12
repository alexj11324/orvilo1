import { isAgentRuntimeOffered } from '@/features/HeterogeneousAgent/builtinHarness';

export interface DefaultAgentCandidate {
  heterogeneousType?: string | null;
  id: string;
  type?: string;
}

export type DefaultAgentSource = 'default' | 'first' | 'orchestrator';

export interface ResolvedDefaultAgent {
  agentId: string;
  source: DefaultAgentSource;
}

interface ResolveDefaultAgentParams {
  agents: readonly DefaultAgentCandidate[];
  builtinOffered: boolean;
  defaultAgentId?: string | null;
  orchestratorAgentId?: string | null;
}

/**
 * The Agent an entry point opens when the user named none: the saved default,
 * else the Orchestrator, else the first listed Agent. A saved pointer is
 * honoured only while it names a listed Agent on an offered runtime, so a
 * deleted or withheld Agent falls through instead of opening a dead page.
 * `undefined` means there is nothing to open and the caller should prompt the
 * user to connect an Agent.
 */
export const resolveDefaultAgent = ({
  agents,
  builtinOffered,
  defaultAgentId,
  orchestratorAgentId,
}: ResolveDefaultAgentParams): ResolvedDefaultAgent | undefined => {
  const offered = agents.filter(
    (agent) =>
      (agent.type ?? 'agent') === 'agent' &&
      isAgentRuntimeOffered(agent.heterogeneousType, builtinOffered),
  );
  const listed = (id?: string | null) => !!id && offered.some((agent) => agent.id === id);

  if (listed(defaultAgentId)) return { agentId: defaultAgentId!, source: 'default' };
  if (listed(orchestratorAgentId)) return { agentId: orchestratorAgentId!, source: 'orchestrator' };
  return offered[0] && { agentId: offered[0].id, source: 'first' };
};
