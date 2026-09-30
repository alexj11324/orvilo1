import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';
import { afterEach, expect, it, vi } from 'vitest';

import { useWorkspaceContextStore } from '@/business/client/workspaceContextStore';
import { mutate, setScopedMutate, useClientDataSWR } from '@/libs/swr';
import { getMutate } from '@/libs/swr/mutate';

import { getMemorySession, isMemorySessionKey, memorySessionKey } from './session';

afterEach(() => {
  useWorkspaceContextStore.setState({ activeWorkspaceId: null });
});

it('revalidates session-scoped subscribers with a workspace suffix', async () => {
  useWorkspaceContextStore.setState({ activeWorkspaceId: 'workspace-a' });
  const fetcher = vi.fn().mockResolvedValue('first');
  const oldMutate = getMutate();
  const cache = new Map();
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(SWRConfig, { value: { provider: () => cache } }, children);
  const session = getMemorySession();
  const { result, unmount } = renderHook(
    () => {
      setScopedMutate(useSWRConfig().mutate);
      return useClientDataSWR(memorySessionKey(['userMemory:scoped-test'], session), fetcher);
    },
    { wrapper },
  );
  try {
    await waitFor(() => expect(result.current.data).toBe('first'));
    fetcher.mockResolvedValue('second');
    await act(async () => {
      await mutate(
        (key) => isMemorySessionKey(key, session) && key[0] === 'userMemory:scoped-test',
      );
    });
    await waitFor(() => expect(result.current.data).toBe('second'));
    expect(
      isMemorySessionKey(
        ['userMemory:scoped-test', { session: session - 1 }, 'workspace-a'],
        session,
      ),
    ).toBe(false);
  } finally {
    unmount();
    setScopedMutate(oldMutate);
  }
});
