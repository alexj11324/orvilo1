import { isBuiltinAgentAvailable } from '@orvilo/builtin-agents';

import { isAgentRuntimeOffered } from '@/features/HeterogeneousAgent/builtinHarness';

interface ResolveRuntimeAccessParams {
  builtinAgentSlug?: string | null;
  builtinOffered: boolean;
  /** The Agent that took the inbox Agent's place, when one exists. */
  defaultAgentId?: string;
  /** The route names a built-in Agent, by slug or by id. */
  isBuiltinAgent: boolean;
  /** The routed Agent's list entry; `undefined` when it is not listed. */
  listed?: { heterogeneousType?: string | null };
  /** The lists this verdict depends on have loaded. */
  ready: boolean;
}

export type RuntimeAccess =
  { kind: 'forward'; agentId: string } | { kind: 'open' | 'pending' | 'withheld' };

/**
 * What the agent route does with an Agent whose runtime may not be offered.
 *
 * - `pending` until the lists have loaded, so a withheld Agent never mounts
 *   for a moment first.
 * - `forward` for a built-in route: generic entry points (the Agent nav row, a
 *   hotkey, a menu) land there, so it hands over to the default Agent.
 * - `withheld` for any other Agent on a runtime that is not offered, and for a
 *   built-in route with no Agent to hand over to.
 */
export const resolveRuntimeAccess = ({
  builtinAgentSlug,
  builtinOffered,
  defaultAgentId,
  isBuiltinAgent,
  listed,
  ready,
}: ResolveRuntimeAccessParams): RuntimeAccess => {
  if (!isBuiltinAgentAvailable(builtinAgentSlug)) return { kind: 'open' };
  if (builtinOffered) return { kind: 'open' };
  if (!ready) return { kind: 'pending' };
  if (isBuiltinAgent)
    return defaultAgentId ? { agentId: defaultAgentId, kind: 'forward' } : { kind: 'withheld' };

  return {
    kind: listed && !isAgentRuntimeOffered(listed.heterogeneousType, false) ? 'withheld' : 'open',
  };
};
