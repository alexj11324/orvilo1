/**
 * @vitest-environment happy-dom
 *
 * Regression test: scope-change broadcast revalidations (`mutate(isDataSWRKey,
 * undefined, { revalidate: true })` in GlobalProvider/Query.tsx and
 * SWRMutateInitializer.desktop.tsx) must not replay `useActionSWR` fetchers.
 *
 * Action fetchers are mutations (e.g. `createSession` behind the mobile
 * session-list "+" button, `openNewTopicOrSaveTopic` behind the desktop
 * sidebar button). Before action keys were namespaced, an unfiltered
 * `mutate(() => true, { revalidate: true })` re-executed the mutation
 * server-side — one extra session/agent row per scope flip whenever an
 * action hook was mounted, e.g. an empty group's AddButton on a slow-boot
 * mobile Safari reload.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import useSWR, { SWRConfig, useSWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';

import { isDataSWRKey, useActionSWR } from './index';

const wrapper = ({ children }: PropsWithChildren) =>
  createElement(SWRConfig, { value: {} }, children);

const flush = () => new Promise<void>((r) => setTimeout(r, 50));

describe('useActionSWR vs broadcast revalidation', () => {
  it('does not fetch on mount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ created: true });

    renderHook(() => useActionSWR(['session:createSession', undefined], fetcher), { wrapper });
    await flush();

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('is not replayed by a cache-wide data revalidation', async () => {
    const fetcher = vi.fn().mockResolvedValue({ created: true });

    const { result } = renderHook(
      () => {
        const { mutate } = useSWRConfig();
        useActionSWR(['session:createSession', undefined], fetcher);
        return mutate;
      },
      { wrapper },
    );
    await flush();

    // Mirrors the scope-reload broadcast in GlobalProvider/Query.tsx
    await result.current(isDataSWRKey, undefined, { revalidate: true });
    await flush();

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('still revalidates plain data hooks under the same broadcast', async () => {
    const dataFetcher = vi.fn().mockResolvedValue({ items: [] });

    const { result } = renderHook(
      () => {
        const { mutate } = useSWRConfig();
        useSWR(['session:list', true], dataFetcher);
        return mutate;
      },
      { wrapper },
    );

    await waitFor(() => expect(dataFetcher).toHaveBeenCalledTimes(1));

    await result.current(isDataSWRKey, undefined, { revalidate: true });

    await waitFor(() => expect(dataFetcher).toHaveBeenCalledTimes(2));
  });

  it('still fires for its own bound mutate (button click)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ created: true });

    const { result } = renderHook(
      () => useActionSWR(['session:createSession', undefined], fetcher),
      { wrapper },
    );
    await flush();

    await result.current.mutate();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
