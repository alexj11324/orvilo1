import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

export const useTeamResources = (teamId: string) => {
  const workspaceId = useActiveWorkspaceId();
  return useClientDataSWR(
    teamId && workspaceId ? ['team-resources', workspaceId, teamId] : null,
    () => lambdaClient.teamResource.list.query({ teamId }),
  );
};

export type TeamResourcesData = NonNullable<ReturnType<typeof useTeamResources>['data']>['data'];
export type TeamResource = TeamResourcesData['resources'][number];
export type TeamResourceSection = TeamResourcesData['sections'][number];
