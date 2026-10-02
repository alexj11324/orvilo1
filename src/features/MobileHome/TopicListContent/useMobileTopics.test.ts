import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useGlobalStore } from '@/store/global';
import { initialState } from '@/store/global/initialState';

import { useLastUsedAgentId } from './useMobileTopics';

const setStatus = (lastUsedAgentId?: string) => {
  useGlobalStore.setState({
    isStatusInit: true,
    status: { ...initialState.status, lastUsedAgentId },
  });
};

describe('useLastUsedAgentId', () => {
  it('returns the persisted last-used agent, not the feed order', () => {
    setStatus('agent-picked-by-user');

    const { result } = renderHook(() => useLastUsedAgentId());

    expect(result.current).toBe('agent-picked-by-user');
  });

  it('is undefined before the user ever picks/sends — callers fall back to inbox', () => {
    setStatus(undefined);

    const { result } = renderHook(() => useLastUsedAgentId());

    expect(result.current).toBeUndefined();
  });

  it('does not move when background churn bumps another topic to topics[0]', () => {
    // Regression for the topics[0]?.agentId inference: a background Agent C
    // finishing bumps its topic's updatedAt to the top of the feed. The
    // New Topic default must stay the agent the user last used explicitly.
    setStatus('agent-A');

    const { result, rerender } = renderHook(() => useLastUsedAgentId());
    expect(result.current).toBe('agent-A');

    // Any state churn that is not an explicit composer pick / send / handoff
    // (here: the unrelated persisted fields a workspace feed sync touches).
    useGlobalStore.setState({
      status: { ...initialState.status, lastUsedAgentId: 'agent-A', homeRecentsCount: 42 },
    });
    rerender();

    expect(result.current).toBe('agent-A');
  });
});
