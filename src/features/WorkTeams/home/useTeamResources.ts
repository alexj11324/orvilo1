import { useFetchTeamResources } from '@/store/workTeam/hooks';

export const useTeamResources = useFetchTeamResources;

export type TeamResourcesData = NonNullable<ReturnType<typeof useTeamResources>['data']>['data'];
export type TeamResource = TeamResourcesData['resources'][number];
export type TeamResourceSection = TeamResourcesData['sections'][number];
