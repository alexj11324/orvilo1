import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';

import { workTeamService } from '@/services/workTeam';

import {
  useFetchTeamDocumentCandidates,
  useFetchTeamResources,
  useFetchUserWorkTeams,
  useFetchWorkTeam,
} from './hooks';

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace',
}));
vi.mock('@/services/workTeam', () => ({
  workTeamService: { list: vi.fn(), queryDocuments: vi.fn(), teams: vi.fn(), team: vi.fn() },
}));
const wrapper = ({ children }: PropsWithChildren) => (
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{children}</SWRConfig>
);

describe('team read hooks', () => {
  it('keeps resource responses isolated while changing teams', async () => {
    let resolve!: (value: any) => void;
    vi.mocked(workTeamService.list).mockImplementation(({ teamId }) =>
      teamId === 'old'
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve({ data: { resources: [{ id: 'new' }] } } as any),
    );
    const { result, rerender } = renderHook(({ teamId }) => useFetchTeamResources(teamId), {
      initialProps: { teamId: 'old' },
      wrapper,
    });
    rerender({ teamId: 'new' });
    await waitFor(() => expect(result.current.data?.data.resources[0].id).toBe('new'));
    await act(async () => resolve({ data: { resources: [{ id: 'old' }] } }));
    expect(result.current.data?.data.resources[0].id).toBe('new');
  });

  it('retries a failed first document page without treating it as settled empty', async () => {
    vi.mocked(workTeamService.queryDocuments)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [], total: 0 } as any);
    const { result } = renderHook(() => useFetchTeamDocumentCandidates('team'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    expect(result.current.data).toBeUndefined();
    await act(async () => {
      await result.current.mutate();
    });
    expect(result.current.data).toBeDefined();
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });
  it('disables membership reads without identity and isolates results after a user switch', async () => {
    let resolve!: (value: any) => void;
    vi.mocked(workTeamService.teams)
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce({ data: [{ id: 'b', joined: true }] } as any);
    const { result, rerender } = renderHook(({ userId }) => useFetchUserWorkTeams(userId), {
      initialProps: { userId: '' },
      wrapper,
    });
    expect(workTeamService.teams).not.toHaveBeenCalled();
    rerender({ userId: 'a' });
    await waitFor(() => expect(workTeamService.teams).toHaveBeenCalledTimes(1));
    rerender({ userId: 'b' });
    await waitFor(() => expect(result.current.data?.data[0].id).toBe('b'));
    await act(async () => resolve({ data: [{ id: 'a', joined: true }] }));
    expect(result.current.data?.data[0].id).toBe('b');
  });
  it('clears previous team workflow states during a team switch and ignores late responses', async () => {
    let resolve!: (value: any) => void;
    vi.mocked(workTeamService.team).mockImplementation(({ teamId }) =>
      teamId === 'a'
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve({ data: { workflowStates: [{ id: 'new', category: 'todo' }] } } as any),
    );
    const { result, rerender } = renderHook(({ teamId }) => useFetchWorkTeam(teamId), {
      initialProps: { teamId: 'a' },
      wrapper,
    });
    rerender({ teamId: 'b' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.data.workflowStates[0].id).toBe('new'));
    await act(async () => resolve({ data: { workflowStates: [{ id: 'old', category: 'todo' }] } }));
    expect(result.current.data?.data.workflowStates[0].id).toBe('new');
  });
});
