import {
  getActiveWorkspaceId,
  useActiveWorkspaceId,
} from '@/business/client/hooks/useActiveWorkspaceId';
import { useUserStore } from '@/store/user';

export const useOrchestratorPreference = () => {
  const workspaceId = useActiveWorkspaceId();
  const fetch = useUserStore((s) => s.useFetchWorkspaceUserPreference);
  const scoped = fetch();
  const personalId = useUserStore((s) => s.preference.orchestratorAgentId);
  return {
    agentId: workspaceId
      ? (scoped.data?.orchestratorAgentId ?? undefined)
      : (personalId ?? undefined),
    error: workspaceId ? scoped.error : undefined,
    loading: !!workspaceId && scoped.data === undefined && !scoped.error,
    retry: () => scoped.mutate(),
    save: async (agentId: string) => {
      if (getActiveWorkspaceId() !== workspaceId) throw new Error('ORCHESTRATOR_SCOPE_CHANGED');
      const state = useUserStore.getState();
      if (workspaceId) await state.updateWorkspaceUserPreference({ orchestratorAgentId: agentId });
      else await state.updatePreference({ orchestratorAgentId: agentId });
    },
    workspaceId,
  };
};
