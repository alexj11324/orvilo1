import isEqual from 'fast-deep-equal';
import { useMemo } from 'react';

import { useBuiltinHarnessOffered } from '@/features/HeterogeneousAgent/builtinHarness';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { type ResolvedDefaultAgent, resolveDefaultAgent } from './resolveDefaultAgent';
import { useDefaultAgentPreference } from './useDefaultAgentPreference';

/** The Agent entry points open when the user named none; see `resolveDefaultAgent`. */
export const useDefaultAgent = (): ResolvedDefaultAgent | undefined => useDefaultAgentState().agent;

/**
 * `useDefaultAgent` plus whether its answer is final. Until the Agent list has
 * loaded, an empty answer means “not known yet”, not “no Agent”.
 */
export const useDefaultAgentState = (): { agent?: ResolvedDefaultAgent; ready: boolean } => {
  const builtinOffered = useBuiltinHarnessOffered();
  const agents = useHomeStore(homeAgentListSelectors.allAgents, isEqual);
  const ready = useHomeStore(homeAgentListSelectors.isAgentListInit);
  const { agentId, orchestratorAgentId, loading } = useDefaultAgentPreference();

  const agent = useMemo(
    () =>
      resolveDefaultAgent({
        agents,
        builtinOffered,
        defaultAgentId: agentId,
        orchestratorAgentId,
      }),
    [agentId, agents, builtinOffered, orchestratorAgentId],
  );

  return { agent, ready: ready && !loading };
};
