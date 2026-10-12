import {
  getActiveWorkspaceId,
  useActiveWorkspaceId,
} from '@/business/client/hooks/useActiveWorkspaceId';
import { useUserStore } from '@/store/user';

/** The saved default-Agent pointer for the active scope, with its Orchestrator sibling. */
export const useDefaultAgentPreference = () => {
  const workspaceId = useActiveWorkspaceId();
  const fetch = useUserStore((s) => s.useFetchWorkspaceUserPreference);
  const scoped = fetch();
  const personal = useUserStore((s) => s.preference);
  const source = workspaceId ? scoped.data : personal;
  return {
    agentId: source?.defaultAgentId ?? undefined,
    error: workspaceId ? scoped.error : undefined,
    loading: !!workspaceId && scoped.data === undefined && !scoped.error,
    orchestratorAgentId: source?.orchestratorAgentId ?? undefined,
    retry: () => scoped.mutate(),
    save: async (agentId: string) => {
      if (getActiveWorkspaceId() !== workspaceId) throw new Error('DEFAULT_AGENT_SCOPE_CHANGED');
      const state = useUserStore.getState();
      if (workspaceId) await state.updateWorkspaceUserPreference({ defaultAgentId: agentId });
      else await state.updatePreference({ defaultAgentId: agentId });
    },
    workspaceId,
  };
};
