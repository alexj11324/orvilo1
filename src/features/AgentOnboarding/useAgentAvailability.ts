import isEqual from 'fast-deep-equal';

import { collectConnectedHarnessTypes } from '@/features/ChatInput/ActionBar/Agent/localHarnessRows';
import { useFetchOnboardingAgent } from '@/store/agent/useFetchOnboardingAgent';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useFetchProviderBindings, useProviderBindingStore } from '@/store/providerBinding';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import { resolveAgentAvailability } from './availability';

export const useAgentAvailability = () => {
  const isLogin = useUserStore(authSelectors.isLogin);
  const agentList = useHomeStore(homeAgentListSelectors.allAgents, isEqual);
  const agents = useHomeStore((s) => s.useFetchAgentList)(isLogin);
  const bindings = useProviderBindingStore((s) => s.bindings);
  const providers = useFetchProviderBindings();
  const personalAvailability = resolveAgentAvailability({
    bindings,
    connectedTypes: collectConnectedHarnessTypes(agentList),
  });
  const setup = useUserStore((s) => s.onboarding?.setup);
  const needsWorkspaceAgent =
    !personalAvailability.usable && !!setup?.firstAgentId && !!setup.workspaceId;
  const resumed = useFetchOnboardingAgent(
    needsWorkspaceAgent,
    setup?.firstAgentId,
    setup?.workspaceId,
  );
  const availability = resolveAgentAvailability({
    bindings,
    connectedTypes: collectConnectedHarnessTypes(
      resumed.data?.agent ? [...agentList, resumed.data.agent] : agentList,
    ),
  });
  return {
    availability,
    error: agents.error ?? providers.error ?? resumed.error,
    ready:
      agents.data !== undefined &&
      providers.data !== undefined &&
      (!needsWorkspaceAgent || resumed.data !== undefined),
    retry: async () => {
      await Promise.all([
        agents.mutate(),
        providers.mutate(),
        ...(needsWorkspaceAgent ? [resumed.mutate()] : []),
      ]);
    },
    retrying: agents.isValidating || providers.isValidating,
  };
};
