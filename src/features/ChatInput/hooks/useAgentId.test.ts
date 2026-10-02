import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

import { createStore, Provider } from '../store';
import { useAgentId } from './useAgentId';

const seed = ({
  activeAgentId,
  activeTopicId,
  composerAgentId,
  lastUsedAgentId,
}: {
  activeAgentId?: string;
  activeTopicId?: string;
  composerAgentId?: string;
  lastUsedAgentId?: string;
}) => {
  useAgentStore.setState({ activeAgentId });
  useChatStore.setState({ activeTopicId, composerAgentId });
  useGlobalStore.setState((s) => ({
    status: { ...s.status, lastUsedAgentId },
  }));
};

const renderWithComposer = (agentId?: string) => {
  const store = createStore({ agentId });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { createStore: () => store }, children);
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
});
