/**
 * Render order for palette result groups — work types first (matching the
 * sidebar's own prominence order), then full-text-search types. A result whose
 * type is not listed here (e.g. marketplace `mcp`/`plugin`/`communityAgent`
 * hits) is intentionally dropped: it has no group to render under.
 *
 * Note: renderable types are a superset of the `type:`/`is:` filterable types —
 * `page` results render in a group but have no typed filter to drill into.
 */
export const COMMAND_MENU_GROUP_ORDER = [
  'task',
  'team',
  'project',
  'savedView',
  'message',
  'agent',
  'chatGroup',
  'topic',
  'memory',
  'file',
  'page',
  'folder',
  'knowledgeBase',
] as const;

export interface SearchResultGroup<T> {
  items: T[];
  type: (typeof COMMAND_MENU_GROUP_ORDER)[number];
}

/**
 * Bucket search results into ordered, non-empty groups. Items keep their
 * incoming order within a group (server-ranked); group order follows
 * COMMAND_MENU_GROUP_ORDER.
 */
export const groupSearchResults = <T extends { type: string }>(
  results: readonly T[],
): SearchResultGroup<T>[] => {
  const buckets = new Map<string, T[]>();
  for (const result of results) {
    const bucket = buckets.get(result.type);
    if (bucket) {
      bucket.push(result);
    } else {
      buckets.set(result.type, [result]);
    }
  }

  return COMMAND_MENU_GROUP_ORDER.flatMap((type) => {
    const items = buckets.get(type);
    return items?.length ? [{ items, type }] : [];
  });
};
