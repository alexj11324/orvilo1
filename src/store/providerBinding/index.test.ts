import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { providerBindingService } from '@/services/providerBinding';
import { useUserStore } from '@/store/user';

import { providerBindingActions, useFetchProviderBindings, useProviderBindingStore } from './index';

vi.mock('@/store/user', () => ({ useUserStore: create(() => ({ user: { id: 'a' } })) }));
vi.mock('@/store/user/selectors', () => ({
  userProfileSelectors: { userId: (s: { user?: { id: string } }) => s.user?.id },
}));
vi.mock('@/libs/swr', () => ({ mutate: vi.fn(), useClientDataSWR: vi.fn(() => ({})) }));
vi.mock('@/services/providerBinding', () => ({
  providerBindingService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

const config = { name: 'test' } as Parameters<typeof providerBindingActions.save>[0];
const switchUser = (id: string) => act(() => useUserStore.setState({ user: { id } as any }));
beforeEach(() => {
  vi.clearAllMocks();
  switchUser('a');
  useProviderBindingStore.setState({ bindings: [], pending: {} });
});

describe('Provider account boundaries', () => {
  it('disables unrelated binding discovery on external agent settings', () => {
    const view = renderHook(() => useFetchProviderBindings(false));
    expect(vi.mocked(useClientDataSWR).mock.calls.at(-1)![0]).toBeNull();
    view.unmount();
  });
  it('rejects stale list completion even when the same account signs back in', () => {
    const view = renderHook(() => useFetchProviderBindings());
    const oldCallback = vi.mocked(useClientDataSWR).mock.calls.at(-1)![2]!.onSuccess!;
    switchUser('b');
    switchUser('a');
    act(() => oldCallback({ data: [{ id: 'private' }] }, '', {} as any));
    expect(useProviderBindingStore.getState().bindings).toEqual([]);
    view.unmount();
  });
  it('does not clear a new request pending state or refresh after A→B→A', async () => {
    let finish!: () => void;
    vi.mocked(providerBindingService.create).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({} as any);
        }),
    );
    const old = providerBindingActions.save(config);
    switchUser('b');
    switchUser('a');
    useProviderBindingStore.setState({ pending: { create: true } });
    finish();
    await old;
    expect(mutate).not.toHaveBeenCalled();
    expect(useProviderBindingStore.getState().pending.create).toBe(true);
  });
  it('retains data when deletion fails and clears pending', async () => {
    const binding = { id: 'one', revision: 1 } as any;
    useProviderBindingStore.setState({ bindings: [binding] });
    vi.mocked(providerBindingService.delete).mockRejectedValueOnce(new Error('conflict'));
    await expect(providerBindingActions.remove(binding)).rejects.toThrow('conflict');
    expect(useProviderBindingStore.getState().bindings).toEqual([binding]);
    expect(useProviderBindingStore.getState().pending.one).toBe(false);
  });
});
