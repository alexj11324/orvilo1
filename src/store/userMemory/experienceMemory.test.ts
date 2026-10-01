import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';
import { afterEach, expect, it, vi } from 'vitest';

import { setScopedMutate } from '@/libs/swr';
import { getMutate } from '@/libs/swr/mutate';
import { experienceMemoryService } from '@/services/experienceMemory';
import { memoryCRUDService, userMemoryService } from '@/services/userMemory';
import { useUserMemoryStore } from '@/store/userMemory';
import { LayersEnum } from '@/types/userMemory';

import { useExperienceMemory } from './experienceMemory';
import { useLegacyMemoryPage } from './useLegacyMemoryPage';

const oldMutate = getMutate();
afterEach(() => {
  vi.restoreAllMocks();
  setScopedMutate(oldMutate);
});

it.each(['delete', 'purge'] as const)(
  'clears all cached queries after %s even when refresh fails',
  async (operation) => {
    const entry = {
      id: 'entry',
      revision: 1,
      content: 'private',
      source: 'prime',
      updatedAt: new Date(),
    };
    const list = vi
      .spyOn(experienceMemoryService, 'list')
      .mockResolvedValue({ items: [entry], hasMore: false } as never);
    const search = vi
      .spyOn(experienceMemoryService, 'search')
      .mockResolvedValue({ items: [entry], truncated: false } as never);
    vi.spyOn(experienceMemoryService, 'delete').mockResolvedValue({ success: true });
    vi.spyOn(memoryCRUDService, 'deleteAll').mockResolvedValue({ success: true });
    const cache = new Map();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(
        SWRConfig,
        { value: { provider: () => cache, shouldRetryOnError: false } },
        children,
      );
    const { result, unmount } = renderHook(
      () => {
        setScopedMutate(useSWRConfig().mutate);
        return { list: useExperienceMemory('', 1), search: useExperienceMemory('private', 1) };
      },
      { wrapper },
    );
    try {
      await waitFor(() => expect(result.current.search.data?.items).toHaveLength(1));
      await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1));
      list.mockRejectedValue(new Error('offline'));
      search.mockRejectedValue(new Error('offline'));
      await act(async () => {
        if (operation === 'delete') await result.current.list.remove('entry', 1);
        else await useUserMemoryStore.getState().purgeAllMemories();
      });
      expect(result.current.list.data).toBeUndefined();
      expect(result.current.search.data).toBeUndefined();
    } finally {
      unmount();
    }
  },
);

it('clears a sibling legacy page after deleting a context', async () => {
  const query = vi
    .spyOn(userMemoryService, 'queryMemories')
    .mockResolvedValue({ items: [{ id: 'deleted' }], total: 21 } as never);
  vi.spyOn(memoryCRUDService, 'deleteContext').mockResolvedValue({ success: true });
  const cache = new Map();
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(
      SWRConfig,
      { value: { provider: () => cache, shouldRetryOnError: false } },
      children,
    );
  const { result, unmount } = renderHook(
    () => {
      setScopedMutate(useSWRConfig().mutate);
      return {
        first: useLegacyMemoryPage(LayersEnum.Context, 1, ''),
        second: useLegacyMemoryPage(LayersEnum.Context, 2, ''),
      };
    },
    { wrapper },
  );
  try {
    await waitFor(() => expect(result.current.second.data?.items).toHaveLength(1));
    query.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await useUserMemoryStore.getState().deleteContext('deleted');
    });
    expect(result.current.first.data).toBeUndefined();
    expect(result.current.second.data).toBeUndefined();
  } finally {
    unmount();
  }
});
