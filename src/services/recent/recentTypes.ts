import type { RecentItem } from '@orvilo/types';

export const RECENT_SIDEBAR_TYPES = [
  'project',
  'savedView',
  'task',
  'team',
] as const satisfies readonly RecentItem['type'][];

/** Teams belong to a workspace. Personal mode must not invent a Team surface. */
export const isWorkspaceTeamVisible = (workspaceId: string | null | undefined) =>
  Boolean(workspaceId);

/** Personal mode has no Teams surface, so visit recents must not list them. */
export const recentTypesForWorkspace = (workspaceId: string | null | undefined) =>
  isWorkspaceTeamVisible(workspaceId)
    ? RECENT_SIDEBAR_TYPES
    : RECENT_SIDEBAR_TYPES.filter((type) => type !== 'team');

export const omitPersonalTeamItems = <T extends { targetType?: string; type?: string }>(
  items: readonly T[],
  workspaceId: string | null | undefined,
): T[] =>
  isWorkspaceTeamVisible(workspaceId)
    ? [...items]
    : items.filter((item) => (item.type ?? item.targetType) !== 'team');
