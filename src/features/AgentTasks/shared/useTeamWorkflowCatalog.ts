import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useClientDataSWR } from '@/libs/swr';
import { teamService } from '@/services/team';

/** Reuses the team-detail request already mounted by team work surfaces. */
export const useTeamWorkflowCatalog = (teamId?: string | null, enabled = true) => {
  const workspaceId = useActiveWorkspaceId();
  const { data, error, isLoading } = useClientDataSWR<
    Awaited<ReturnType<typeof teamService.getDetail>>
  >(
    enabled && teamId && workspaceId ? ['team', workspaceId, teamId] : null,
    () => teamService.getDetail(teamId!),
    { dedupingInterval: 30_000 },
  );

  return {
    error,
    isLoading,
    states: data?.data.workflowStates,
  };
};
