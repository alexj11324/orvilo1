import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { topicService } from '@/services/topic';
import { useGlobalStore } from '@/store/global';
import { initialState } from '@/store/global/initialState';
import { useUserStore } from '@/store/user';

import { MOBILE_TOPIC_STATUSES } from './mobileTopicRows';
import { MOBILE_FEED_PAGE_SIZE, useLastUsedAgentId, useMobileTopics } from './useMobileTopics';

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

describe('useMobileTopics', () => {
  it('fetches a bounded first page — never an unbounded feed', async () => {
    // The mobile feed is workspace-wide like the desktop sidebar's; its
    // first page must stay in the 30–50 band the contract fixes (cursor
    // pagination is follow-up). An omitted pageSize would silently pull the
    // server's larger default — the contract is the explicit bound.
    useUserStore.setState({ isSignedIn: true });
    const querySpy = vi.spyOn(topicService, 'queryTopics').mockResolvedValue([]);

    const { result } = renderHook(() => useMobileTopics());

    await waitFor(() => expect(result.current.isInit).toBe(true));
    expect(querySpy).toHaveBeenCalledWith({
      pageSize: MOBILE_FEED_PAGE_SIZE,
      statuses: MOBILE_TOPIC_STATUSES,
    });
    expect(MOBILE_FEED_PAGE_SIZE).toBeGreaterThanOrEqual(30);
    expect(MOBILE_FEED_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});
