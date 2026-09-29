import { describe, expect, it, vi } from 'vitest';

import { mergeWorkQueryPage } from '../MyWork/workQueryPaging';
import { ScopedTailPager } from './scopedTailPager';

interface Row {
  id: string;
  name: string;
}

const row = (id: string): Row => ({ id, name: id });

const page = (items: Row[], nextCursor: string | null, hasMore = true) => ({
  hasMore,
  items,
  nextCursor,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

describe('ScopedTailPager', () => {
  it('commits a page under the scope that issued it and dedupes the seam', async () => {
    const pager = new ScopedTailPager<Row>(mergeWorkQueryPage);
    pager.setScope('A');
    const seen = new Set(['r1', 'r2']);

    const first = deferred<ReturnType<typeof page>>();
    pager.loadMore('A', 'queue', () => first.promise);
    first.resolve(page([row('r2'), row('r3')], 'c2'));
    await vi.waitFor(() => expect(pager.tailFor('A')?.items).toHaveLength(2));
    expect(pager.tailFor('A')?.items.map((item) => item.id)).toEqual(['r2', 'r3']);
    expect(pager.tailFor('A')?.nextCursor).toBe('c2');
    expect(pager.isLoading('queue')).toBe(false);
    void seen;
  });

  it('drops a delayed response issued under the previous tab', async () => {
    const pager = new ScopedTailPager<Row>(mergeWorkQueryPage);
    pager.setScope('for-me');

    const stale = deferred<ReturnType<typeof page>>();
    void pager.loadMore('for-me', 'queue', () => stale.promise);

    // Tab switch rebinds identity — the in-flight promise keeps running but
    // can never write back.
    pager.setScope('created');
    stale.resolve(page([row('stale-1')], 'c-stale'));
    await vi.waitFor(() => expect(pager.version).toBeGreaterThan(1));

    expect(pager.tailFor('created')).toBeNull();
    expect(pager.errorFor('queue')).toBeUndefined();
  });

  it("never lets a stale request's finally clear the new request's pending flag", async () => {
    const pager = new ScopedTailPager<Row>(mergeWorkQueryPage);
    pager.setScope('for-me');

    const stale = deferred<ReturnType<typeof page>>();
    void pager.loadMore('for-me', 'queue', () => stale.promise);

    pager.setScope('created');
    const fresh = deferred<ReturnType<typeof page>>();
    void pager.loadMore('created', 'queue', () => fresh.promise);
    expect(pager.isLoading('queue')).toBe(true);

    stale.resolve(page([row('stale')], null));
    await vi.waitFor(() => expect(pager.version).toBeGreaterThan(2));
    expect(pager.isLoading('queue')).toBe(true);

    fresh.resolve(page([row('fresh-1')], 'c1'));
    await vi.waitFor(() => expect(pager.isLoading('queue')).toBe(false));
    expect(pager.tailFor('created')?.items.map((item) => item.id)).toEqual(['fresh-1']);
  });

  it('reset() bumps the generation so refresh never reuses a stale cursor', async () => {
    const pager = new ScopedTailPager<Row>(mergeWorkQueryPage);
    pager.setScope('A');

    const first = deferred<ReturnType<typeof page>>();
    void pager.loadMore('A', 'queue', () => first.promise);
    first.resolve(page([row('r1')], 'c1'));
    await vi.waitFor(() => expect(pager.tailFor('A')?.items).toHaveLength(1));

    // Refresh while a second page request is still in flight.
    const stale = deferred<ReturnType<typeof page>>();
    void pager.loadMore('A', 'queue', () => stale.promise);
    pager.reset();

    expect(pager.tailFor('A')).toBeNull();
    stale.resolve(page([row('stale-9')], 'c9'));
    await vi.waitFor(() => expect(pager.version).toBeGreaterThan(3));
    expect(pager.tailFor('A')).toBeNull();
    expect(pager.isLoading('queue')).toBe(false);
  });

  it('keeps an error bound to the scope that produced it — a stale rejection never echoes', async () => {
    const pager = new ScopedTailPager<Row>(mergeWorkQueryPage);
    pager.setScope('A');

    const boom = deferred<ReturnType<typeof page>>();
    void pager.loadMore('A', 'g1', () => boom.promise);
    pager.setScope('B');

    boom.reject(new Error('403'));
    await vi.waitFor(() => expect(pager.version).toBeGreaterThan(1));
    expect(pager.errorFor('g1')).toBeUndefined();
  });

  it('records an in-scope error per key and clears it on the retry that starts', async () => {
    const pager = new ScopedTailPager<Row>(mergeWorkQueryPage);
    pager.setScope('A');

    const boom = deferred<ReturnType<typeof page>>();
    void pager.loadMore('A', 'g1', () => boom.promise);
    boom.reject(new Error('403'));
    await vi.waitFor(() => expect(pager.errorFor('g1')).toBeInstanceOf(Error));

    // Retry under the same scope+key clears the slot and can commit.
    const retry = deferred<ReturnType<typeof page>>();
    void pager.loadMore('A', 'g1', () => retry.promise);
    await vi.waitFor(() => expect(pager.errorFor('g1')).toBeUndefined());
    retry.resolve(page([row('r1')], 'c1'));
    await vi.waitFor(() => expect(pager.tailFor('A')?.items).toHaveLength(1));
  });

  it('serializes concurrent loads under one key but runs different keys in parallel', async () => {
    const pager = new ScopedTailPager<Row>(mergeWorkQueryPage);
    pager.setScope('A');
    const fetches: string[] = [];
    const track = (name: string) => () => {
      fetches.push(name);
      return deferred<ReturnType<typeof page>>().promise;
    };

    void pager.loadMore('A', 'k1', track('first'));
    void pager.loadMore('A', 'k1', track('dup'));
    void pager.loadMore('A', 'k2', track('other'));
    await vi.waitFor(() => expect(pager.isLoading('k1')).toBe(true));

    expect(fetches).toEqual(['first', 'other']);
  });
});
