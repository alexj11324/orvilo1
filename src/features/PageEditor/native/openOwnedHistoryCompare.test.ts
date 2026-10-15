import { describe, expect, it } from 'vitest';

import { openOwnedHistoryCompare } from './openOwnedHistoryCompare';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('production external history async owner selection', () => {
  it('selects the newly ready native owner after a deferred list, never the pre-list absence', async () => {
    const list = deferred<string[]>();
    let owner: object | undefined = undefined;
    const native = {};
    const imports: string[] = [];
    const opened: string[] = [];
    const pending = openOwnedHistoryCompare({
      loadItems: () => list.promise,
      getOwner: () => owner,
      loadRenderer: async (selected) => {
        const kind = selected ? 'native' : 'legacy';
        imports.push(kind);
        return kind;
      },
      isCurrent: () => true,
      onEmpty: () => {
        throw new Error('Unexpected empty list');
      },
      open: (items, renderer) => {
        expect(items).toEqual(['history']);
        opened.push(renderer);
      },
    });
    expect(imports).toEqual([]);
    owner = native;
    list.resolve(['history']);
    await pending;
    expect(imports).toEqual(['native']);
    expect(opened).toEqual(['native']);
  });
  it('retries undefined -> native during a deferred legacy import without ever opening legacy', async () => {
    const legacyImport = deferred<string>();
    const started = deferred<void>();
    let owner: object | undefined = undefined;
    const imports: string[] = [];
    const opened: string[] = [];
    const pending = openOwnedHistoryCompare({
      loadItems: async () => ['history'],
      getOwner: () => owner,
      loadRenderer: async (selected) => {
        if (selected) {
          imports.push('native');
          return 'native';
        }
        imports.push('legacy');
        started.resolve();
        return legacyImport.promise;
      },
      isCurrent: () => true,
      onEmpty: () => {},
      open: (_items, renderer) => {
        opened.push(renderer);
      },
    });
    await started.promise;
    owner = {};
    legacyImport.resolve('legacy');
    await pending;
    expect(imports).toEqual(['legacy', 'native']);
    expect(opened).toEqual(['native']);
  });
  it('also retries native -> undefined while a native import is pending', async () => {
    const nativeImport = deferred<string>();
    const started = deferred<void>();
    let owner: object | undefined = {};
    const opened: string[] = [];
    const pending = openOwnedHistoryCompare({
      loadItems: async () => ['history'],
      getOwner: () => owner,
      loadRenderer: async (selected) => {
        if (selected) {
          started.resolve();
          return nativeImport.promise;
        }
        return 'legacy';
      },
      isCurrent: () => true,
      onEmpty: () => {},
      open: (_items, renderer) => {
        opened.push(renderer);
      },
    });
    await started.promise;
    owner = undefined;
    nativeImport.resolve('stale-native');
    await pending;
    expect(opened).toEqual(['legacy']);
  });
  it('does not open either renderer if the route/generation changes during an import', async () => {
    const imported = deferred<string>();
    const started = deferred<void>();
    let current = true;
    let opens = 0;
    const pending = openOwnedHistoryCompare({
      loadItems: async () => ['history'],
      getOwner: () => undefined,
      loadRenderer: () => {
        started.resolve();
        return imported.promise;
      },
      isCurrent: () => current,
      onEmpty: () => {},
      open: () => {
        opens++;
      },
    });
    await started.promise;
    current = false;
    imported.resolve('legacy');
    await pending;
    expect(opens).toBe(0);
  });
  it('fails closed after bounded owner churn, never opening a stale renderer', async () => {
    let owner = {};
    let imports = 0;
    let opens = 0;
    await expect(
      openOwnedHistoryCompare({
        loadItems: async () => ['history'],
        getOwner: () => owner,
        loadRenderer: async () => {
          imports++;
          owner = {};
          return 'stale';
        },
        isCurrent: () => true,
        onEmpty: () => {},
        open: () => {
          opens++;
        },
      }),
    ).rejects.toThrow('owner changed repeatedly');
    expect(imports).toBe(4);
    expect(opens).toBe(0);
  });
});
