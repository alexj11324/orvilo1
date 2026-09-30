import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { providerBindingService } from '@/services/providerBinding';
import { useProviderBindingStore } from '@/store/providerBinding';

import { useBindingFeedback } from './useBindingFeedback';

vi.mock('@/services/providerBinding', () => ({
  providerBindingService: { checkConnection: vi.fn() },
}));
vi.mock('@/store/providerBinding', () => ({
  useProviderBindingStore: { getState: vi.fn(() => ({ generation: 0 })) },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProviderBindingStore.getState).mockReturnValue({ generation: 0 } as any);
});
describe('Provider asynchronous feedback', () => {
  it('does not perform a confirmed operation after the account generation changes', async () => {
    const { result } = renderHook(() => useBindingFeedback(0, 'failed'));
    const confirmedOperation = vi.fn();
    const confirm = () => result.current.report(confirmedOperation, 'deleted');
    expect(confirmedOperation).not.toHaveBeenCalled();
    vi.mocked(useProviderBindingStore.getState).mockReturnValue({ generation: 2 } as any);
    await act(confirm);
    expect(confirmedOperation).not.toHaveBeenCalled();
  });
  it('reports rejected mutations without claiming success', async () => {
    const { result } = renderHook(() => useBindingFeedback(0, 'failed'));
    await act(() =>
      result.current.report(async () => {
        throw new Error('conflict');
      }, 'saved'),
    );
    expect(result.current.feedback).toEqual({ message: 'failed', tone: 'error' });
  });
  it('suppresses a late success after A → B → A', async () => {
    let finish!: () => void;
    const { result } = renderHook(() => useBindingFeedback(0, 'failed'));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.report(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
        'saved',
      );
    });
    vi.mocked(useProviderBindingStore.getState).mockReturnValue({ generation: 2 } as any);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.feedback).toBeUndefined();
  });
  it('rejects unavailable broker status and clears pending check', async () => {
    vi.mocked(providerBindingService.checkConnection).mockResolvedValue({
      status: 'unavailable',
    } as any);
    const { result } = renderHook(() => useBindingFeedback(0, 'failed'));
    await act(() => result.current.check('binding', 1, 'verified'));
    expect(result.current.feedback).toEqual({ message: 'failed', tone: 'error' });
    expect(result.current.checking).toBeUndefined();
  });
  it('serializes checks and ignores late results after account change', async () => {
    let finish!: () => void;
    vi.mocked(providerBindingService.checkConnection).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ status: 'ready' } as any);
        }),
    );
    const { result } = renderHook(() => useBindingFeedback(0, 'failed'));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.check('one', 1, 'verified');
    });
    expect(result.current.checking).toBe('one');
    await act(() => result.current.check('two', 1, 'verified'));
    expect(providerBindingService.checkConnection).toHaveBeenCalledTimes(1);
    vi.mocked(useProviderBindingStore.getState).mockReturnValue({ generation: 2 } as any);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.feedback).toBeUndefined();
  });
  it('shows success only after a ready response', async () => {
    vi.mocked(providerBindingService.checkConnection).mockResolvedValue({ status: 'ready' } as any);
    const { result } = renderHook(() => useBindingFeedback(0, 'failed'));
    await act(() => result.current.check('binding', 1, 'verified'));
    expect(result.current.feedback).toEqual({ message: 'verified', tone: 'success' });
  });
});
