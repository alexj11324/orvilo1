import type { ExperienceListResult } from '@orvilo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { memoryCRUDService, userMemoryService } from '@/services/userMemory';
import { useUserStore } from '@/store/user';
import { useUserMemoryStore } from '@/store/userMemory';
import { LayersEnum } from '@/types/userMemory';

const switchUser = (id: string) => {
  useUserStore.setState({ user: { id } as never });
};

afterEach(() => {
  vi.restoreAllMocks();
  useUserStore.getState().reset();
  useUserMemoryStore.getState().reset();
});

describe('memory list session isolation', () => {
  it('clears settled data and excludes delayed responses across account changes', async () => {
    switchUser('alice');
    let resolveAlice!: (value: ExperienceListResult) => void;
    const query = vi
      .spyOn(userMemoryService, 'queryExperiences')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAlice = resolve;
          }),
      )
      .mockResolvedValue({
        items: [{ id: 'bob-memory' } as never],
        page: 1,
        pageSize: 12,
        total: 1,
      });
    const cache = new Map();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(
        SWRConfig,
        {
          value: { provider: () => cache, dedupingInterval: 60_000, keepPreviousData: true },
        },
        children,
      );
    const { result } = renderHook(
      () => {
        useUserMemoryStore.getState().useFetchExperiences({ page: 1, pageSize: 12 });
        return useUserMemoryStore((state) => state.experiences);
      },
      { wrapper },
    );
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    act(() => {
      useUserMemoryStore.setState({ experiences: [{ id: 'alice-settled' } as never] });
      switchUser('bob');
      expect(useUserMemoryStore.getState().experiences).toEqual([]);
    });
    await waitFor(() => expect(result.current).toEqual([{ id: 'bob-memory' }]));
    await act(async () => {
      resolveAlice({ items: [{ id: 'alice-late' } as never], page: 1, pageSize: 12, total: 1 });
    });
    expect(result.current).toEqual([{ id: 'bob-memory' }]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

const privateReads = [
  {
    name: 'persona',
    service: 'getPersona',
    run: () => useUserMemoryStore.getState().useFetchPersona(),
    data: { content: 'private', summary: 'private' },
  },
  {
    name: 'tags',
    service: 'queryIdentityRoles',
    run: () => useUserMemoryStore.getState().useFetchTags(),
    data: { roles: [{ role: 'private', count: 1 }], tags: [] },
  },
  {
    name: 'identities',
    service: 'queryIdentitiesForInjection',
    run: () => useUserMemoryStore.getState().useInitIdentities(true),
    data: [{ id: 'private' }],
  },
  {
    name: 'retrieval',
    service: 'retrieveMemory',
    run: () =>
      useUserMemoryStore.getState().useFetchUserMemory(true, { queries: ['private'] } as never),
    data: { activities: [], contexts: [], experiences: [{ id: 'private' }], preferences: [] },
  },
  {
    name: 'topic',
    service: 'retrieveMemoryForTopic',
    run: () => useUserMemoryStore.getState().useFetchMemoriesForTopic('topic'),
    data: { activities: [], contexts: [], experiences: [{ id: 'private' }], preferences: [] },
  },
] as const;

it.each(privateReads)(
  'does not restore Alice $name when her request resolves after logout',
  async ({ service, run, data }) => {
    switchUser('alice');
    let finish!: (data: never) => void;
    vi.spyOn(userMemoryService, service).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    );
    const { unmount } = renderHook(() => {
      run();
    });
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    const finishAlice = finish;
    act(() => switchUser('bob'));
    const clean = useUserMemoryStore.getState();
    await act(async () => {
      finishAlice(data as never);
    });
    expect(useUserMemoryStore.getState()).toBe(clean);
    unmount();
  },
);

it.each([
  'deleteActivity',
  'deleteContext',
  'deleteExperience',
  'deleteIdentity',
  'deletePreference',
  'deleteAll',
  'updatePreference',
] as const)('does not change Bob state when Alice %s completes', async (method) => {
  switchUser('alice');
  let finish!: (value: never) => void;
  vi.spyOn(memoryCRUDService, method).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  const actions = useUserMemoryStore.getState();
  const pending =
    method === 'deleteAll'
      ? actions.purgeAllMemories()
      : method === 'updatePreference'
        ? actions.updateMemory('shared-id', 'Alice text', LayersEnum.Preference)
        : actions[method]('shared-id');
  switchUser('bob');
  useUserMemoryStore.setState({
    editingMemoryId: 'bob-edit',
    preferences: [{ id: 'shared-id', conclusionDirectives: 'Bob text' } as never],
  });
  const clean = useUserMemoryStore.getState();
  finish({ success: true } as never);
  await pending;
  expect(useUserMemoryStore.getState()).toBe(clean);
});

it('does not keep Alice detail when the global SWR config keeps previous data', async () => {
  switchUser('alice');
  vi.spyOn(userMemoryService, 'getMemoryDetail')
    .mockResolvedValueOnce({
      layer: LayersEnum.Preference,
      memory: {},
      preference: { id: 'private' },
    } as never)
    .mockImplementation(() => new Promise(() => {}));
  const cache = new Map();
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(
      SWRConfig,
      {
        value: { provider: () => cache, keepPreviousData: true },
      },
      children,
    );
  const { result } = renderHook(
    () => useUserMemoryStore.getState().useFetchMemoryDetail('same-id', LayersEnum.Preference),
    { wrapper },
  );
  await waitFor(() => expect(result.current.data?.id).toBe('private'));
  act(() => switchUser('bob'));
  expect(result.current.data).toBeUndefined();
});
