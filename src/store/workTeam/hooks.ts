import useSWRInfinite from 'swr/infinite';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { augmentKey, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys, workTeamKeys } from '@/libs/swr/keys';
import { workTeamService } from '@/services/workTeam';

type TeamDocumentCandidatesPage = Awaited<ReturnType<typeof workTeamService.queryDocuments>>;
type TeamDocumentCandidatesKey =
  | ReturnType<typeof workTeamKeys.documentCandidates>
  | readonly [...ReturnType<typeof workTeamKeys.documentCandidates>, string];

export function useFetchWorkTeam(teamId?: string) {
  const workspaceId = useActiveWorkspaceId();
  return useClientDataSWR(
    teamId && workspaceId ? workTeamKeys.detail(workspaceId, teamId) : null,
    () => workTeamService.team({ teamId: teamId! }),
  );
}

export function useFetchWorkTeams(enabled = true) {
  const workspaceId = useActiveWorkspaceId();
  return useClientDataSWR(
    enabled && workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => workTeamService.teams(),
  );
}

/** User-dependent membership flags must never share a cache across identities. */
export function useFetchUserWorkTeams(userId?: string | null) {
  const workspaceId = useActiveWorkspaceId();
  return useClientDataSWR(
    workspaceId && userId ? workTeamKeys.userList(workspaceId, userId) : null,
    () => workTeamService.teams(),
    { dedupingInterval: 2000, revalidateOnFocus: false },
  );
}

export function useFetchTeamResources(teamId: string) {
  const workspaceId = useActiveWorkspaceId();
  return useClientDataSWR(
    teamId && workspaceId ? workTeamKeys.resources(workspaceId, teamId) : null,
    () => workTeamService.list({ teamId }),
  );
}

export function useFetchTeamDocumentCandidates(teamId: string) {
  const workspaceId = useActiveWorkspaceId();
  const response = useSWRInfinite<
    TeamDocumentCandidatesPage,
    Error,
    (index: number, previous: TeamDocumentCandidatesPage | null) => TeamDocumentCandidatesKey | null
  >(
    (index, previous) => {
      if (!workspaceId || !teamId) return null;
      if (index > 0 && (!previous || index * 100 >= previous.total)) return null;
      return augmentKey(
        workTeamKeys.documentCandidates(teamId, index),
        workspaceId,
      ) as TeamDocumentCandidatesKey;
    },
    (key) =>
      workTeamService.queryDocuments({
        current: key[2],
        excludeTeamDocuments: true,
        pageSize: 100,
      }),
    { persistSize: false, revalidateFirstPage: false, shouldRetryOnError: false },
  );
  return {
    ...response,
    items: response.data?.flatMap((page) => page.items) ?? [],
    total: response.data?.[0]?.total ?? 0,
    loadMore: () => (response.error ? response.mutate() : response.setSize(response.size + 1)),
  };
}
