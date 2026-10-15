import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';

import { linearImportService } from '@/services/linearImport';

import { useFetchLinearDestinations, useFetchLinearJob, useFetchLinearPreview } from './hooks';

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace',
}));
vi.mock('@/services/linearImport', () => ({
  linearImportService: {
    status: vi.fn(),
    preview: vi.fn(),
    destinations: vi.fn(),
  },
}));

const wrapper = ({ children }: PropsWithChildren) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
    {children}
  </SWRConfig>
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Linear import request isolation', () => {
  it('does not replace a new team preview with a slower previous workspace request', async () => {
    const old = deferred<any>();
    vi.mocked(linearImportService.preview)
      .mockReset()
      .mockImplementation(({ teamId }) =>
        teamId === 'old' ? old.promise : Promise.resolve({ data: { team: { id: 'new' } } } as any),
      );
    const { result, rerender } = renderHook(
      ({ scope, team }) => useFetchLinearPreview(scope, 'install', team, true),
      { initialProps: { scope: 'a', team: 'old' }, wrapper },
    );
    rerender({ scope: 'b', team: 'new' });
    await waitFor(() => expect(result.current.data?.data.team.id).toBe('new'));
    await act(async () => old.resolve({ data: { team: { id: 'old' } } }));
    expect(result.current.data?.data.team.id).toBe('new');
  });

  it('exposes first-load failure and recovers on explicit retry', async () => {
    vi.mocked(linearImportService.status)
      .mockReset()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: { id: 'job', status: 'completed' } } as any);
    const { result } = renderHook(() => useFetchLinearJob('scope', 'job', true), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      await result.current.mutate();
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.data.status).toBe('completed');
  });

  it('preserves settled content when background revalidation fails', async () => {
    vi.mocked(linearImportService.status)
      .mockReset()
      .mockResolvedValueOnce({ data: { id: 'job', status: 'completed' } } as any)
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useFetchLinearJob('scope', 'job', true), { wrapper });
    await waitFor(() => expect(result.current.data?.data.id).toBe('job'));
    expect(result.current.error).toBeUndefined();
    await act(async () => {
      await result.current.mutate().catch(() => {});
    });
    expect(result.current.data?.data.id).toBe('job');
    expect(result.current.error.message).toBe('offline');
  });

  it('keeps loaded pages when the next page fails and retries that page', async () => {
    vi.mocked(linearImportService.destinations)
      .mockReset()
      .mockImplementation(async ({ offset }) => {
        if (!offset) return { data: { items: [{ id: 'one' }], nextOffset: 50 } } as any;
        throw new Error('page offline');
      });
    const { result } = renderHook(() => useFetchLinearDestinations('scope', '', true), { wrapper });
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.error?.message).toBe('page offline'));
    expect(result.current.projects).toHaveLength(1);
    vi.mocked(linearImportService.destinations).mockImplementation(
      async ({ offset }) =>
        ({
          data: { items: [{ id: offset ? 'two' : 'one' }], nextOffset: offset ? null : 50 },
        }) as any,
    );
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.projects).toHaveLength(2));
  });
  it('keeps a settled empty list distinct from first-load failure', async () => {
    vi.mocked(linearImportService.destinations)
      .mockReset()
      .mockResolvedValue({ data: { items: [], nextOffset: null } } as any);
    const { result } = renderHook(() => useFetchLinearDestinations('empty', '', true), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.projects).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('does not expose an old destination search while a new search is pending', async () => {
    const old = deferred<any>();
    vi.mocked(linearImportService.destinations)
      .mockReset()
      .mockImplementation(({ search }) =>
        search === 'old'
          ? old.promise
          : Promise.resolve({ data: { items: [{ id: 'new' }], nextOffset: null } } as any),
      );
    const { result, rerender } = renderHook(
      ({ search }) => useFetchLinearDestinations('scope', search, true),
      { initialProps: { search: 'old' }, wrapper },
    );
    rerender({ search: 'new' });
    await act(async () => old.resolve({ data: { items: [{ id: 'old' }], nextOffset: null } }));
    expect(result.current.projects).toEqual([]);
    await waitFor(() => expect(result.current.projects.map((item) => item.id)).toEqual(['new']));
  });

  it('disables the job request after starting a new import despite an old response', async () => {
    const old = deferred<any>();
    vi.mocked(linearImportService.status).mockReset().mockReturnValue(old.promise);
    const { result, rerender } = renderHook(({ id }) => useFetchLinearJob('scope', id, true), {
      initialProps: { id: 'old' },
      wrapper,
    });
    rerender({ id: '' });
    await act(async () => old.resolve({ data: { id: 'old', status: 'completed' } }));
    expect(result.current.data).toBeUndefined();
  });

  it('polls active jobs and stops after a terminal status', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(linearImportService.status)
        .mockReset()
        .mockResolvedValueOnce({ data: { id: 'job', status: 'running' } } as any)
        .mockResolvedValue({ data: { id: 'job', status: 'completed' } } as any);
      const { result, unmount } = renderHook(() => useFetchLinearJob('polling', 'job', true), {
        wrapper,
      });
      expect(result.current.data).toBeUndefined();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data?.data.status).toBe('running');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
      expect(result.current.data?.data.status).toBe('completed');
      const calls = vi.mocked(linearImportService.status).mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(linearImportService.status).toHaveBeenCalledTimes(calls);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
