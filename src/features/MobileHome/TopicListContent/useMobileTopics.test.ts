import { renderHook, waitFor } from '@testing-library/react';
import { act, createElement, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { type TopicListItem, type TopicListPage, topicService } from '@/services/topic';
import { useGlobalStore } from '@/store/global';
import { initialState } from '@/store/global/initialState';
import { useUserStore } from '@/store/user';

import { useLastUsedAgentId, useMobileTopics } from './useMobileTopics';

vi.mock('@/services/topic', () => ({
  topicService: {
    queryTopicsPage: vi.fn(),
    searchTopics: vi.fn(),
  },
}));

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

const pageItem = (id: string): TopicListItem =>
  ({ agentId: 'agent-1', id, title: id, updatedAt: new Date(1) }) as unknown as TopicListItem;

const feedPage = (ids: string[], nextCursor: string | null): TopicListPage => ({
  items: ids.map(pageItem),
  nextCursor,
});

// A private SWR cache — the shared one would leak pages between tests.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(SWRConfig, { value: { dedupingInterval: 0, provider: () => new Map() } }, children);

describe('useMobileTopics pagination', () => {
  const queryTopicsPage = vi.mocked(topicService.queryTopicsPage);

  // Zustand stores are shared across test files — leave the store signed out
  // when this suite is done.
  afterAll(() => {
    useUserStore.setState({ isSignedIn: false });
  });

  const signIn = () => {
    useUserStore.setState({ isSignedIn: true });
    queryTopicsPage.mockReset();
  };

  it('fetches one page of PAGE_SIZE and stops when the server says the list ended', async () => {
    signIn();
    queryTopicsPage.mockResolvedValue(feedPage(['a', 'b'], null));

    const { result } = renderHook(() => useMobileTopics(), { wrapper });

    await waitFor(() => expect(result.current.isInit).toBe(true));

    // One request, one page — limit carries the feed's page size.
    expect(queryTopicsPage).toHaveBeenCalledTimes(1);
    expect(queryTopicsPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 30, withLastMessage: true }),
    );
    expect(result.current.topics.map((t) => t.id)).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(false);
  });

  it('lazy-loads the next page with the cursor and dedupes boundary overlap', async () => {
    signIn();
    queryTopicsPage
      .mockResolvedValueOnce(feedPage(['a', 'b'], 'c1'))
      .mockResolvedValueOnce(feedPage(['b', 'c'], null));

    const { result } = renderHook(() => useMobileTopics(), { wrapper });
    await waitFor(() => expect(result.current.topics).toHaveLength(2));
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.topics).toHaveLength(3));
    // Second request continued from the cursor, not the offset.
    expect(queryTopicsPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    // 'b' straddled the boundary — the feed still paints one copy.
    expect(result.current.topics.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.hasMore).toBe(false);
  });

  it('does not fetch at all while signed out', async () => {
    useUserStore.setState({ isSignedIn: false });
    queryTopicsPage.mockReset();

    const { result } = renderHook(() => useMobileTopics(), { wrapper });
    await waitFor(() => expect(result.current.isInit).toBe(true));

    expect(queryTopicsPage).not.toHaveBeenCalled();
  });
});
