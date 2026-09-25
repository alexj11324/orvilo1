/**
 * @vitest-environment happy-dom
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '@/store/agent';
import { initialState as initialChatState } from '@/store/chat/initialState';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';
import { useChatStore } from '@/store/chat/store';

import AgentIdSync, { getAgentRouteSuffix } from './AgentIdSync';

const useParamsMock = vi.hoisted(() => vi.fn());
const useSearchParamsMock = vi.hoisted(() => vi.fn());
const useNavigateMock = vi.hoisted(() => vi.fn());
const useLocationMock = vi.hoisted(() => vi.fn());
const useInitAgentConfigMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useInitAgentConfig', () => ({
  useInitAgentConfig: useInitAgentConfigMock,
}));

vi.mock('react-router', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router')) as typeof import('react-router');

  return {
    ...actual,
    useLocation: useLocationMock,
    useNavigate: () => useNavigateMock,
    useParams: useParamsMock,
    useSearchParams: useSearchParamsMock,
  };
});

describe('AgentIdSync', () => {
  beforeEach(() => {
    useParamsMock.mockReset();
    useSearchParamsMock.mockReset();
    useNavigateMock.mockReset();
    useLocationMock.mockReset();
    useInitAgentConfigMock.mockReset();
    useLocationMock.mockReturnValue({ pathname: '/agent/agent-1' });

    useAgentStore.setState({ builtinAgentIdMap: {} });

    useChatStore.setState(
      {
        ...initialChatState,
        activeAgentId: 'agent-1',
        activeTopicId: 'topic-1',
        portalStack: [{ type: PortalViewType.Home }],
        showPortal: true,
      },
      false,
    );
  });

  it('hydrates the agent resolved from the current route', () => {
    useParamsMock.mockReturnValue({ aid: 'agent-2' });
    useSearchParamsMock.mockReturnValue([new URLSearchParams(''), vi.fn()]);

    render(<AgentIdSync />);

    expect(useInitAgentConfigMock).toHaveBeenCalledWith('agent-2');
  });

  it('clears portal state when switching to another agent without a topic in the URL', () => {
    useParamsMock.mockReturnValue({ aid: 'agent-1' });
    useSearchParamsMock.mockReturnValue([new URLSearchParams(''), vi.fn()]);

    const { rerender } = render(<AgentIdSync />);

    expect(useChatStore.getState().showPortal).toBe(true);

    useParamsMock.mockReturnValue({ aid: 'agent-2' });
    useLocationMock.mockReturnValue({ pathname: '/agent/agent-2' });
    rerender(<AgentIdSync />);

    expect(useChatStore.getState().activeTopicId).toBeNull();
    expect(useChatStore.getState().portalStack).toEqual([]);
    expect(useChatStore.getState().showPortal).toBe(false);
  });

  it('still clears portal state when the destination URL already has a topic', () => {
    useParamsMock.mockReturnValue({ aid: 'agent-1' });
    useSearchParamsMock.mockReturnValue([new URLSearchParams('topic=topic-2'), vi.fn()]);

    const { rerender } = render(<AgentIdSync />);

    useParamsMock.mockReturnValue({ aid: 'agent-2' });
    useLocationMock.mockReturnValue({ pathname: '/agent/agent-2' });
    rerender(<AgentIdSync />);

    expect(useChatStore.getState().portalStack).toEqual([]);
    expect(useChatStore.getState().showPortal).toBe(false);
    expect(useChatStore.getState().activeTopicId).toBe('topic-1');
  });

  it('preserves the active topic when the destination route carries a topic path segment', () => {
    useParamsMock.mockReturnValue({ aid: 'agent-1', topicId: 'topic-1' });
    useSearchParamsMock.mockReturnValue([new URLSearchParams(''), vi.fn()]);

    const { rerender } = render(<AgentIdSync />);

    useParamsMock.mockReturnValue({ aid: 'agent-2', topicId: 'topic-2' });
    rerender(<AgentIdSync />);

    expect(useChatStore.getState().portalStack).toEqual([]);
    expect(useChatStore.getState().showPortal).toBe(false);
    expect(useChatStore.getState().activeTopicId).toBe('topic-1');
  });

  it('resolves a workspace-prefixed inbox slug without inventing a topic segment', () => {
    useAgentStore.setState({ builtinAgentIdMap: { inbox: 'agt-inbox' } });
    useParamsMock.mockReturnValue({ aid: 'inbox', workspaceSlug: 'ws-useragenttes' });
    useSearchParamsMock.mockReturnValue([new URLSearchParams(''), vi.fn()]);
    useLocationMock.mockReturnValue({ pathname: '/ws-useragenttes/agent/inbox' });

    render(<AgentIdSync />);

    expect(useNavigateMock).toHaveBeenCalledWith('/agent/agt-inbox', { replace: true });
  });
});

describe('getAgentRouteSuffix', () => {
  it('does not turn a workspace prefix into a topic suffix', () => {
    expect(getAgentRouteSuffix('/ws-useragenttes/agent/inbox', 'inbox')).toBe('');
  });

  it('preserves real child paths on workspace-prefixed routes', () => {
    expect(getAgentRouteSuffix('/ws-useragenttes/agent/inbox/profile', 'inbox')).toBe('/profile');
    expect(getAgentRouteSuffix('/ws-useragenttes/agent/inbox/topic-1', 'inbox')).toBe('/topic-1');
  });

  it('preserves real child paths on unprefixed routes', () => {
    expect(getAgentRouteSuffix('/agent/inbox/profile', 'inbox')).toBe('/profile');
  });
});
