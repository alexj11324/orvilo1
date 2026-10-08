import { type OwnCredSummary } from '@orvilo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCredentialMutation } from '../useCredentialMutation';
import { type CredsApi } from '../useCredsApi';
import { useEditKVForm } from './useEditKVForm';

const mocks = vi.hoisted(() => ({ toast: vi.fn(), t: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/components/toast', () => ({ toast: { error: mocks.toast } }));
const wrapper = ({ children }: PropsWithChildren) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    children,
  );
const cred = { id: 'cred', name: 'Existing', description: 'retained' } as OwnCredSummary;
const values = { name: 'Existing', kvPairs: [{ key: 'SECRET', value: 'original' }] };
describe('credential edit recovery', () => {
  beforeEach(() => vi.clearAllMocks());
  it('blocks submission after failed decrypt and restores original values after reload', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('decrypt unavailable'))
      .mockResolvedValueOnce({ data: { plaintext: { SECRET: 'original' } } });
    const update = vi.fn();
    const api = { client: { get: { query }, update: { mutate: update } } } as unknown as CredsApi;
    const setValues = vi.fn();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useEditKVForm(cred, api, true, setValues, onSuccess), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loadError).toBeInstanceOf(Error));
    expect(result.current.ready).toBe(false);
    expect(setValues).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.updateMutation.mutateAsync(values).catch(() => {});
    });
    expect(update).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.loadError).toBeUndefined();
    expect(setValues).toHaveBeenCalledWith({ ...values, description: 'retained' });
    await act(async () => {
      await result.current.updateMutation.mutateAsync(values);
    });
    expect(update).toHaveBeenCalledWith({
      id: 'cred',
      name: 'Existing',
      values: { SECRET: 'original' },
      description: undefined,
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });
  it('does not unlock editing when a success response has no decrypted values', async () => {
    const api = {
      client: { get: { query: vi.fn().mockResolvedValue({ data: {} }) } },
    } as unknown as CredsApi;
    const setValues = vi.fn();
    const { result } = renderHook(() => useEditKVForm(cred, api, true, setValues, vi.fn()), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loadError).toBeInstanceOf(Error));
    expect(result.current.ready).toBe(false);
    expect(setValues).not.toHaveBeenCalled();
  });
  it.each(['createFailed', 'saveFailed'])(
    'keeps failed %s mutations recoverable and reports message/fallback',
    async (failure) => {
      const write = vi
        .fn()
        .mockRejectedValueOnce(new Error('server rejected'))
        .mockRejectedValueOnce(Object.assign(new Error('no details'), { message: '' }))
        .mockResolvedValueOnce(undefined);
      const success = vi.fn();
      const { result } = renderHook(() => useCredentialMutation(write, success, failure), {
        wrapper,
      });
      for (const expected of ['server rejected', failure]) {
        await act(async () => {
          await result.current.mutateAsync(values).catch(() => {});
        });
        expect(mocks.toast).toHaveBeenLastCalledWith(expected);
        expect(success).not.toHaveBeenCalled();
        expect(result.current.isPending).toBe(false);
      }
      await act(async () => {
        await result.current.mutateAsync(values);
      });
      expect(success).toHaveBeenCalledOnce();
    },
  );
});
