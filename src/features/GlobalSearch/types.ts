import type { GlobalSearchResult } from '@/services/globalSearch';

/** Result types the surface renders, in display order (see `groupSearchResults`). */
export const GLOBAL_SEARCH_DISPLAY_TYPES = [
  // Linear-parity work domain first: issues, projects, views, teams.
  'task',
  'project',
  'savedView',
  'team',
  // Then FTS content types.
  'message',
  'topic',
  'agent',
  'chatGroup',
  'file',
  'folder',
  'page',
  'memory',
  'knowledgeBase',
] as const;

export type GlobalSearchDisplayType = (typeof GLOBAL_SEARCH_DISPLAY_TYPES)[number];

export const isGlobalSearchDisplayType = (
  type: string | undefined,
): type is GlobalSearchDisplayType =>
  Boolean(type && (GLOBAL_SEARCH_DISPLAY_TYPES as readonly string[]).includes(type));

/** One rendered section: every item shares `type`, in backend relevance order. */
export interface GlobalSearchGroup {
  items: GlobalSearchResult[];
  type: GlobalSearchDisplayType;
}
