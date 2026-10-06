import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGroupMemberAddition } from './useGroupMemberAddition';

const fetchState = vi.hoisted(() => ({ error: undefined as unknown, mutate: vi.fn() }));
vi.mock('swr', () => ({ default: () => ({ data: [], isLoading: false, ...fetchState }) }));
vi.mock('@/services/agent', () => ({ agentService: { queryAgents: vi.fn() } }));

beforeEach(() => {
  fetchState.error = undefined;
  vi.clearAllMocks();
});

describe('group member recovery', () => {
  it('exposes a failed add and clears the error after retrying the same selection', async () => {
    const failure = new Error('Network unavailable');
    const confirm = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const { result } = renderHook(() => useGroupMemberAddition(true, confirm));
    await act(async () => expect(await result.current.submit(['member'])).toBe(false));
    expect(result.current.addError).toBe(failure);
    expect(result.current.isAdding).toBe(false);
    await act(async () => expect(await result.current.submit(['member'])).toBe(true));
    expect(result.current.addError).toBeUndefined();
    expect(confirm).toHaveBeenLastCalledWith(['member']);
  });

  it('exposes fetch failure with the original query retry', async () => {
    fetchState.error = new Error('Fetch unavailable');
    const { result } = renderHook(() => useGroupMemberAddition(true, vi.fn()));
    expect(result.current.loadError).toBe(fetchState.error);
    await result.current.mutate();
    expect(fetchState.mutate).toHaveBeenCalledOnce();
  });
});
