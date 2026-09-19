import type { RecentItem } from '@orvilo/types';

export const RECENT_SIDEBAR_TYPES = [
  'project',
  'savedView',
  'task',
  'team',
] as const satisfies readonly RecentItem['type'][];

/** Personal mode has no Teams surface, so visit recents must not list them. */
export const recentTypesForWorkspace = (workspaceId: string | null | undefined) =>
  workspaceId ? RECENT_SIDEBAR_TYPES : RECENT_SIDEBAR_TYPES.filter((type) => type !== 'team');
