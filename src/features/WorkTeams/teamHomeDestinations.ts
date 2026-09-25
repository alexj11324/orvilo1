import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';

export type TeamHomeDestination = 'settings' | 'triage' | 'issues' | 'projects' | 'views';

export const teamHomeDestinations = (
  teamId: string,
  workspaceSlug: string,
  triageCapable: boolean,
): { key: TeamHomeDestination; to: string }[] => {
  const path = (tab: Exclude<TeamHomeDestination, 'settings'>) =>
    buildWorkspaceAwarePath(
      `/teams/${teamId}?tab=${tab}${tab === 'issues' ? '&scope=active' : ''}`,
      workspaceSlug,
    );

  return [
    { key: 'settings' as const, to: buildWorkspaceAwarePath('/settings', workspaceSlug) },
    ...(triageCapable ? [{ key: 'triage' as const, to: path('triage') }] : []),
    { key: 'issues', to: path('issues') },
    { key: 'projects', to: path('projects') },
    { key: 'views', to: path('views') },
  ];
};
