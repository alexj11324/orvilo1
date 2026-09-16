import { unstable_serialize } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLocalDataKey, localDataCache, type ScopeEntry } from '../localDataCache';
import { purgeRetiredCacheKeys } from './retiredKeys';

const PROVIDER_VERSION = '1.0.0';
const PERSONAL_SCOPE = 'user-1:personal';

const createEntry = (originalKey: readonly unknown[], updatedAt = 1): ScopeEntry => ({
  data: { _k: originalKey, data: [] },
  key: unstable_serialize(originalKey),
  updatedAt,
  version: PROVIDER_VERSION,
});

const seedEntries = async (scope: string, entries: ScopeEntry[]) => {
  await localDataCache.applyBatch({
    deleteKeys: [],
    putEntries: entries.map((entry) => ({
      ...entry,
      key: buildLocalDataKey(scope, entry.key),
    })),
  });
};

describe('purgeRetiredCacheKeys', () => {
  beforeEach(async () => {
    await localDataCache.clearScope(PERSONAL_SCOPE);
  });

  it('deletes rows rooted at retired keys and excludes them from hydration', async () => {
    const retired = createEntry(['topic:agentView', 'agent-1', { current: 0 }]);
    const live = createEntry(['topic:list', 'agent-1']);
    await seedEntries(PERSONAL_SCOPE, [retired, live]);

    const result = await purgeRetiredCacheKeys({
      entries: await localDataCache.entriesByScope(PERSONAL_SCOPE),
      scope: PERSONAL_SCOPE,
    });

    expect(result.map((entry) => entry.key)).toEqual([live.key]);
    expect(await localDataCache.entriesByScope(PERSONAL_SCOPE)).toEqual([live]);
  });

  it('leaves entries untouched when nothing matches a retired root', async () => {
    const live = createEntry(['topic:list', 'agent-1']);
    await seedEntries(PERSONAL_SCOPE, [live]);

    const result = await purgeRetiredCacheKeys({
      entries: await localDataCache.entriesByScope(PERSONAL_SCOPE),
      scope: PERSONAL_SCOPE,
    });

    expect(result).toEqual([live]);
    expect(await localDataCache.entriesByScope(PERSONAL_SCOPE)).toEqual([live]);
  });

  it('still excludes retired rows from hydration when the delete fails', async () => {
    const retired = createEntry(['topic:agentView', 'agent-1', { current: 0 }]);
    await seedEntries(PERSONAL_SCOPE, [retired]);

    const onError = vi.fn();
    const batchSpy = vi
      .spyOn(localDataCache, 'applyBatch')
      .mockRejectedValueOnce(new Error('transaction aborted'));

    const result = await purgeRetiredCacheKeys({
      entries: await localDataCache.entriesByScope(PERSONAL_SCOPE),
      onError,
      scope: PERSONAL_SCOPE,
    });

    batchSpy.mockRestore();

    expect(result).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
    // Source row survives so the next boot retries the purge.
    expect(await localDataCache.entriesByScope(PERSONAL_SCOPE)).toEqual([retired]);
  });
});
