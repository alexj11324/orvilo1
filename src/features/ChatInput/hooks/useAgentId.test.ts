import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

import { createStore, Provider } from '../store';
import { useAgentId, useCurrentComposerAgentId } from './useAgentId';

const seed = ({
  activeAgentId,
  activeTopicId,
  composerAgentId,
  lastUsedAgentId,
  topicDataMap,
}: {
  activeAgentId?: string;
  activeTopicId?: string;
  composerAgentId?: string;
  lastUsedAgentId?: string;
  topicDataMap?: ReturnType<typeof useChatStore.getState>['topicDataMap'];
}) => {
  useAgentStore.setState({ activeAgentId });
  useChatStore.setState({ activeTopicId, composerAgentId, topicDataMap });
  useGlobalStore.setState((s) => ({
    status: { ...s.status, lastUsedAgentId },
  }));
};

const renderWithComposer = (agentId?: string) => {
  const store = createStore({ agentId });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { children, createStore: () => store });
  return renderHook(() => useAgentId(), { wrapper });
};

describe('useAgentId', () => {
  beforeEach(() => {
    seed({});
  });

  it('returns the composer-store agentId when one is provided', () => {
    seed({ lastUsedAgentId: 'agt_last' });
    const { result } = renderWithComposer('agt_override');
    expect(result.current).toBe('agt_override');
  });

  it('prefers the explicit composer pick on a blank composer', () => {
    seed({ activeAgentId: 'agt_route', composerAgentId: 'agt_pick', lastUsedAgentId: 'agt_last' });
    const { result } = renderWithComposer();
    expect(result.current).toBe('agt_pick');
  });

  it('falls back to lastUsedAgentId before the route agent on a blank composer', () => {
    seed({ activeAgentId: 'agt_route', lastUsedAgentId: 'agt_last' });
    const { result } = renderWithComposer();
    expect(result.current).toBe('agt_last');
  });

  it('uses the route agent when nothing else applies', () => {
    seed({ activeAgentId: 'agt_route' });
    const { result } = renderWithComposer();
    expect(result.current).toBe('agt_route');
  });

  it('always resolves to the topic-bound agent while a topic is open', () => {
    seed({
      activeAgentId: 'agt_route',
      activeTopicId: 'tpc_1',
      composerAgentId: 'agt_pick',
      lastUsedAgentId: 'agt_last',
    });
    const { result } = renderWithComposer();
    expect(result.current).toBe('agt_route');
  });

  it('ignores feed ordering — a background agent topping the list cannot hijack the default', () => {
    // Regression: Agent C finishing in the background pushes its topic to the
    // top of the conversation feed. The blank-composer default must stay the
    // last agent the USER used — inferring it from topics[0] would hand the
    // next send to whichever agent wrote last.
    seed({
      activeAgentId: 'agt_route',
      lastUsedAgentId: 'agt_last',
      topicDataMap: {
        agent_agt_route: {
          currentPage: 0,
          hasMore: false,
          items: [
            { agentId: 'agt_c', id: 'tpc_c', status: 'unread', title: 'C done' },
            { agentId: 'agt_last', id: 'tpc_b', status: 'active', title: 'B' },
          ] as never[],
          pageSize: 20,
          total: 2,
        },
      },
    });
    const { result } = renderWithComposer();
    expect(result.current).toBe('agt_last');
  });
});

describe('current composer identity for asynchronous controls', () => {
  it('uses last-used B despite route A and sees a new composer C immediately', () => {
    seed({ activeAgentId: 'route-a', lastUsedAgentId: 'composer-b' });
    const { result } = renderHook(() => useCurrentComposerAgentId());
    expect(result.current()).toBe('composer-b');
    useChatStore.setState({ composerAgentId: 'composer-c' });
    expect(result.current()).toBe('composer-c');
  });
  it('preserves and rereads an explicit ChatInput store override', () => {
    seed({ activeAgentId: 'route-a', lastUsedAgentId: 'composer-b' });
    const store = createStore({ agentId: 'override-b' });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { children, createStore: () => store });
    const { result } = renderHook(() => useCurrentComposerAgentId(), { wrapper });
    expect(result.current()).toBe('override-b');
    store.setState({ agentId: 'override-c' });
    expect(result.current()).toBe('override-c');
  });
});
