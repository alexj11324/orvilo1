import { useBuiltinHarnessOffered } from '@/features/HeterogeneousAgent/builtinHarness';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors/builtinAgentSelectors';

import { useDefaultAgent } from './useDefaultAgent';

/**
 * The Agent that picks up work nobody was named for — running an unassigned
 * Issue, a task created from a template, a new topic opened from a menu. It is
 * the inbox Agent while the built-in harness is offered and the user's default
 * Agent otherwise; `undefined` means there is no Agent to hand the work to.
 */
export const useFallbackAgentId = (): string | undefined => {
  const builtinOffered = useBuiltinHarnessOffered();
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const defaultAgent = useDefaultAgent();

  return builtinOffered ? inboxAgentId : defaultAgent?.agentId;
};
