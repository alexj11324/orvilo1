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
  const personalDefaultId = useUserStore((s) => s.preference.defaultAgentId);
  return {
    agentId: workspaceId
      ? (scoped.data?.orchestratorAgentId ?? undefined)
      : (personalId ?? undefined),
    defaultAgentId: (workspaceId ? scoped.data?.defaultAgentId : personalDefaultId) ?? undefined,
    error: workspaceId ? scoped.error : undefined,
    loading: !!workspaceId && scoped.data === undefined && !scoped.error,
    retry: () => scoped.mutate(),
    save: async (agentId: string, options?: { alsoDefault?: boolean }) => {
      if (getActiveWorkspaceId() !== workspaceId) throw new Error('ORCHESTRATOR_SCOPE_CHANGED');
      const state = useUserStore.getState();
      const patch = {
        orchestratorAgentId: agentId,
        ...(options?.alsoDefault && { defaultAgentId: agentId }),
      };
      if (workspaceId) await state.updateWorkspaceUserPreference(patch);
      else await state.updatePreference(patch);
    },
    workspaceId,
  };
};
