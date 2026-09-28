import type { FtsSearchResult } from '@/database/repositories/ftsSearch';
import { lambdaClient } from '@/libs/trpc/client';
import { omitPersonalTeamItems } from '@/services/recent';
import { workAttentionService } from '@/services/workAttention';

/**
 * Mount-agnostic global search ("search everything") contract.
 *
 * Two real backends are merged here, the same pair the CommandMenu palette
 * fetches inline today:
 *
 * - `workAttention.search` — Linear-parity work domain: tasks matched on
 *   `name`/`identifier`, projects on `name`, saved views and readable teams.
 *   Authorization is applied server-side (ownership + team readability).
 * - `search.query` — unified FTS repo (pg_search or Elasticsearch per
 *   deployment): agents, topics, messages, files, folders, pages, memories,
 *   knowledge bases, chat groups.
 *
 * Any surface (command palette, sidebar quick search, standalone search page)
 * can consume `searchAll` without re-deriving the merge/routing policy.
 */

/** Work-domain types backed by `workAttention.search`. */
export const GLOBAL_SEARCH_WORK_TYPES = ['project', 'savedView', 'task', 'team'] as const;
export type GlobalSearchWorkType = (typeof GLOBAL_SEARCH_WORK_TYPES)[number];

/** Content types accepted by the unified FTS endpoint (`search.query` input enum). */
export const GLOBAL_SEARCH_FTS_TYPES = [
  'agent',
  'chatGroup',
  'communityAgent',
  'file',
  'folder',
  'knowledgeBase',
  'mcp',
  'memory',
  'message',
  'page',
  'plugin',
  'topic',
] as const;
export type GlobalSearchFtsType = (typeof GLOBAL_SEARCH_FTS_TYPES)[number];

export const isGlobalSearchWorkType = (type: string | undefined): type is GlobalSearchWorkType =>
  Boolean(type && (GLOBAL_SEARCH_WORK_TYPES as readonly string[]).includes(type));

export const isGlobalSearchFtsType = (type: string | undefined): type is GlobalSearchFtsType =>
  Boolean(type && (GLOBAL_SEARCH_FTS_TYPES as readonly string[]).includes(type));

/** Work-domain result row as returned by `workAttention.search`. */
export interface GlobalSearchWorkItem {
  createdAt: Date;
  /** Identifier line — task identifier (`ORV-123`) or team key. */
  description?: string | null;
  id: string;
  relevance: number;
  title: string;
  type: GlobalSearchWorkType;
  updatedAt: Date;
}

export type GlobalSearchResult = FtsSearchResult | GlobalSearchWorkItem;

/** Default per-type cap for the mixed palette view, matching the CommandMenu budget. */
export const GLOBAL_SEARCH_DEFAULT_LIMIT_PER_TYPE = 5;

export interface GlobalSearchSources {
  ftsType?: GlobalSearchFtsType;
  includeFts: boolean;
  includeWork: boolean;
  workType?: GlobalSearchWorkType;
}

/**
 * Route an optional `type` filter to the backend(s) that own it. A work type
 * searches only `workAttention.search`; an FTS type only `search.query`; no
 * type fans out to both. Unknown types hit neither — an honest empty result
 * instead of silently widening the query.
 *
 * Teams exist only inside a workspace, so a personal-scope `team` filter or
 * personal-scope untyped search must not expect team rows.
 */
export const resolveGlobalSearchSources = (
  type: string | undefined,
  workspaceId: string | null | undefined,
): GlobalSearchSources => {
  const workType = isGlobalSearchWorkType(type) ? type : undefined;
  const ftsType = isGlobalSearchFtsType(type) ? type : undefined;
  return {
    ftsType,
    includeFts: !type || ftsType !== undefined,
    includeWork: (!type || workType !== undefined) && (Boolean(workspaceId) || type !== 'team'),
    workType,
  };
};

export interface GlobalSearchAllInput {
  /** Scope FTS results to one agent's topics/messages (agent-page context). */
  agentId?: string;
  limitPerType?: number;
  locale?: string;
  query: string;
  /** Optional type filter — routed to the owning backend. */
  type?: string;
  /** Active workspace; `null`/absent means personal scope (no teams). */
  workspaceId?: string | null;
}

export interface GlobalSearchAllResponse {
  items: GlobalSearchResult[];
  /**
   * The work sidecar failed and its slice is missing — results are partial.
   * Surfaces should still render `items` and may show a subtle notice.
   * FTS failures instead reject the promise so callers get a real error state.
   */
  workFailed: boolean;
}

class GlobalSearchService {
  /**
   * Search everything the caller can see. Work results lead (Linear-parity
   * surfaces put issues/projects/views first), then FTS content results.
   */
  searchAll = async (input: GlobalSearchAllInput): Promise<GlobalSearchAllResponse> => {
    const query = input.query.trim();
    if (!query) return { items: [], workFailed: false };

    const sources = resolveGlobalSearchSources(input.type, input.workspaceId);
    const limitPerType = input.limitPerType ?? GLOBAL_SEARCH_DEFAULT_LIMIT_PER_TYPE;

    const [fts, work] = await Promise.all([
      sources.includeFts
        ? lambdaClient.search.query.query({
            agentId: input.agentId,
            // Marketplace round-trips used to gate every keystroke; the palette
            // opts out for the same reason, and a product search surface must
            // never block on remote marketplace availability.
            includeMarketplace: false,
            limitPerType,
            locale: input.locale,
            query,
            type: sources.ftsType,
          })
        : Promise.resolve([]),
      sources.includeWork
        ? workAttentionService
            .search({
              limitPerType,
              query,
              type: sources.workType,
            })
            .then((response): GlobalSearchWorkItem[] =>
              omitPersonalTeamItems(response.data, input.workspaceId),
            )
            .catch((error: unknown) => {
              console.error('[globalSearch.work]', error);
              return null;
            })
        : Promise.resolve(null),
    ]);

    const workFailed = sources.includeWork && work === null;
    return { items: [...(work ?? []), ...fts], workFailed };
  };
}

export const globalSearchService = new GlobalSearchService();
