import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';

export type TeamHomeDestination = 'triage' | 'issues' | 'projects' | 'views';

export const teamHomeDestinations = (
  teamId: string,
  workspaceSlug: string,
  triageCapable: boolean,
): { key: TeamHomeDestination; to: string }[] => {
  const path = (tab: TeamHomeDestination) =>
    buildWorkspaceAwarePath(
      `/teams/${teamId}?tab=${tab}${tab === 'issues' ? '&scope=active' : ''}`,
      workspaceSlug,
    );

  return [
    ...(triageCapable ? [{ key: 'triage' as const, to: path('triage') }] : []),
    { key: 'issues', to: path('issues') },
    { key: 'projects', to: path('projects') },
    { key: 'views', to: path('views') },
  ];
};
