import debug from 'debug';
import { unstable_serialize } from 'swr';

import { buildLocalDataKey, localDataCache, type ScopeEntry } from '../localDataCache';

const log = debug('orvilo-client:swr-retired-keys');

/**
 * Serialized SWR roots whose writers no longer exist. The IndexedDB tier never
 * expires rows, so retired roots would keep hydrating into memory on every
 * boot unless they are deleted here.
 */
const RETIRED_KEY_ROOTS = [
  // `/agent/:aid/topics` management page — removed; its per-agent detail
  // payloads have no remaining reader.
  'topic:agentView',
] as const;

const retiredPrefixes = RETIRED_KEY_ROOTS.map((root) => unstable_serialize([root]));

interface PurgeRetiredCacheKeysOptions {
  entries: ScopeEntry[];
  onError?: (error: Error) => void;
  scope: string;
}

/**
 * Drop persisted rows whose SWR key is rooted at a retired key. Purged rows
 * are excluded from hydration even when the delete transaction fails — the
 * source rows then remain in IndexedDB for a retry on the next boot.
 */
export const purgeRetiredCacheKeys = async ({
  entries,
  onError,
  scope,
}: PurgeRetiredCacheKeysOptions): Promise<ScopeEntry[]> => {
  const retired = entries.filter((entry) =>
    retiredPrefixes.some((prefix) => entry.key.startsWith(prefix)),
  );

  if (retired.length === 0) return entries;

  try {
    await localDataCache.applyBatch({
      deleteKeys: retired.map((entry) => buildLocalDataKey(scope, entry.key)),
      putEntries: [],
    });
    log('Purged %d retired cache rows', retired.length);
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    log('Retired cache purge will retry after transaction failure: %O', error);
    onError?.(error);
  }

  const retiredKeys = new Set(retired.map((entry) => entry.key));
  return entries.filter((entry) => !retiredKeys.has(entry.key));
};
