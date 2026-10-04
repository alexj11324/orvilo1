import { useClientDataSWR } from '@/libs/swr';
import { getOnboardingWorkspaceAgent } from '@/services/agentOnboarding';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

export const useFetchOnboardingAgent = (
  enabled: boolean,
  agentId?: string,
  workspaceId?: string,
) => {
  const owner = useUserStore(userProfileSelectors.userId);
  return useClientDataSWR(
    enabled && owner && agentId && workspaceId
      ? ['onboardingAgent', owner, agentId, workspaceId]
      : null,
    () => getOnboardingWorkspaceAgent(agentId!, workspaceId!),
  );
};
