import { isAgentRuntimeOffered } from '@/features/HeterogeneousAgent/builtinHarness';

import type { DefaultAgentCandidate } from './resolveDefaultAgent';

interface ResolveOfferedAgentIdParams {
  /** An Agent remembered from earlier: the last one sent to, a composer pick. */
  agentId?: string | null;
  agents: readonly DefaultAgentCandidate[];
  builtinOffered: boolean;
  defaultAgentId?: string;
}

/**
 * The Agent a remembered id may still address. While the built-in harness is
 * withheld, only a listed Agent on an offered runtime is kept; anything else
 * (a built-in Agent, one with no runtime stamp, one no longer listed) hands
 * over to the default Agent, and so does having remembered none.
 */
export const resolveOfferedAgentId = ({
  agentId,
  agents,
  builtinOffered,
  defaultAgentId,
}: ResolveOfferedAgentIdParams): string | undefined => {
  if (builtinOffered) return agentId ?? undefined;

  const listed = agentId ? agents.find((agent) => agent.id === agentId) : undefined;
  return listed && isAgentRuntimeOffered(listed.heterogeneousType, false)
    ? listed.id
    : defaultAgentId;
};
