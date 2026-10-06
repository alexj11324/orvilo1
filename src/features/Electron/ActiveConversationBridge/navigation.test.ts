import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GroupIdSync from '@/routes/(main)/group/_layout/GroupIdSync';
import ChatHydration from '@/routes/(main)/group/features/Conversation/ChatHydration';
import { useAgentGroupStore } from '@/store/agentGroup/store';
import { initialState as initialChatState } from '@/store/chat/initialState';
import { useChatStore } from '@/store/chat/store';
import { useElectronStore } from '@/store/electron';

import { resolveActiveConversationCoordinate } from './coordinate';
import { subscribeActiveConversationNavigation } from './navigation';
import { projectActiveConversationCoordinate } from './projectCoordinate';

const mocks = vi.hoisted(() => ({ getTabRouter: vi.fn(), navigate: vi.fn(), setThread: vi.fn() }));
vi.mock('@/features/Electron/TabHost/tabRouterManager', () => ({
  getTabRouter: mocks.getTabRouter,
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/hooks/useQueryParam', () => ({ useQueryState: () => [null, mocks.setThread] }));
vi.mock('@/features/Conversation/hooks', () => ({ useClearActiveTopicUnread: () => {} }));
vi.mock('@/features/TopicComment/useTopicCommentDeepLink', () => ({
  useTopicCommentDeepLink: () => {},
}));

vi.mock('@/features/Electron/navigation/appNavigate', () => ({ appNavigate: vi.fn() }));

describe('active conversation navigation', () => {
  beforeEach(() => {
    mocks.getTabRouter.mockReset();
    mocks.navigate.mockClear();
    useChatStore.setState(
      {
        ...initialChatState,
        activeAgentId: 'agent-a',
        activeThreadId: 'thread-a',
        activeTopicId: 'topic-a',
      },
      false,
    );
  });

  it('does not write the old group root back while real new-group hydration precedes the URL mirror', async () => {
    const coordinate = resolveActiveConversationCoordinate({
      params: { gid: 'group-old', topicId: 'topic-old' },
      url: '/team/group/group-old/topic-old',
    });
    useAgentGroupStore.setState({ activeGroupId: 'group-old' }, false);
    useChatStore.setState(
      { activeGroupId: 'group-old', activeTopicId: 'topic-old', activeThreadId: null! },
      false,
    );
    const navigate = vi.fn();
    const unsubscribe = subscribeActiveConversationNavigation(() => coordinate, navigate);
    // The memory router is already at the new group, but the shell's passive
    // TabLocationReporter has not mirrored it into coordinateRef yet.
    const router = createMemoryRouter(
      [
        {
          path: '/team/group/:gid',
          element: createElement(
            'div',
            null,
            createElement(ChatHydration),
            createElement(GroupIdSync),
          ),
        },
      ],
      { initialEntries: ['/team/group/group-new'] },
    );
    const previousTabId = useElectronStore.getState().activeTabId;
    useElectronStore.setState({ activeTabId: 'native-group-tab' });
    mocks.getTabRouter.mockImplementation((id) => (id === 'native-group-tab' ? router : undefined));
    const view = render(createElement(RouterProvider, { router }));
    try {
      expect(useChatStore.getState().activeTopicId).toBeNull();
      expect(useChatStore.getState().activeGroupId).toBe('group-new');
      expect(navigate).not.toHaveBeenCalled();
      expect(router.state.location.pathname).toBe('/team/group/group-new');
    } finally {
      unsubscribe();
      view.unmount();
      router.dispose();
      useElectronStore.setState({ activeTabId: previousTabId });
    }
  });

  it('keeps matched live group topic changes and new-topic navigation working', async () => {
    const coordinate = resolveActiveConversationCoordinate({
      params: { gid: 'group-current', topicId: 'topic-current' },
      url: '/team/group/group-current/topic-current?mode=single#anchor',
    });
    useChatStore.setState(
      { activeGroupId: 'group-current', activeTopicId: 'topic-current', activeThreadId: null! },
      false,
    );
    const router = createMemoryRouter([{ path: '*', element: null }], {
      initialEntries: [coordinate.pathname + coordinate.search + coordinate.hash],
    });
    const previousTabId = useElectronStore.getState().activeTabId;
    useElectronStore.setState({ activeTabId: 'native-group-tab' });
    mocks.getTabRouter.mockReturnValue(router);
    const navigate = vi.fn();
    const unsubscribe = subscribeActiveConversationNavigation(() => coordinate, navigate);
    try {
      act(() => useChatStore.setState({ activeTopicId: 'topic-next' }, false));
      expect(navigate).toHaveBeenLastCalledWith(
        '/team/group/group-current/topic-next?mode=single#anchor',
        { replace: true },
      );
      act(() => useChatStore.setState({ activeTopicId: null! }, false));
      expect(navigate).toHaveBeenLastCalledWith('/team/group/group-current?mode=single#anchor', {
        replace: true,
      });
    } finally {
      unsubscribe();
      router.dispose();
      useElectronStore.setState({ activeTabId: previousTabId });
    }
  });

  it('turns one atomic topic and thread store change into one active-tab navigation', () => {
    const coordinate = resolveActiveConversationCoordinate({
      params: { aid: 'agent-a', topicId: 'topic-a' },
      resolvedAgentId: 'agent-a',
      url: '/team/agent/agent-a/topic-a?thread=thread-a&mode=single',
    });
    const navigate = vi.fn();
    projectActiveConversationCoordinate(coordinate);
    const unsubscribe = subscribeActiveConversationNavigation(() => coordinate, navigate);

    useChatStore.setState({ activeThreadId: undefined, activeTopicId: 'topic-b' }, false);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/team/agent/agent-a/topic-b?mode=single', {
      replace: true,
    });
    unsubscribe();
  });

  it('restores the routed topic after a scoped store reset without navigating', () => {
    const coordinate = resolveActiveConversationCoordinate({
      params: { aid: 'agent-a', topicId: 'topic-a' },
      resolvedAgentId: 'agent-a',
      url: '/agent/agent-a/topic-a',
    });
    const navigate = vi.fn();
    projectActiveConversationCoordinate(coordinate);
    const unsubscribe = subscribeActiveConversationNavigation(() => coordinate, navigate);

    useChatStore.setState({ activeTopicId: undefined }, false);

    expect(useChatStore.getState().activeTopicId).toBe('topic-a');
    expect(navigate).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps the store→URL write-back alive on a /chat route with no route agent', () => {
    const coordinate = resolveActiveConversationCoordinate({
      activeAgentId: 'agent-a',
      params: { topicId: 'topic-a' },
      url: '/chat/topic-a?mode=single',
    });
    const navigate = vi.fn();
    projectActiveConversationCoordinate(coordinate);
    const unsubscribe = subscribeActiveConversationNavigation(() => coordinate, navigate);

    useChatStore.setState({ activeThreadId: undefined, activeTopicId: 'topic-b' }, false);

    expect(navigate).toHaveBeenCalledWith('/chat/topic-b?mode=single', { replace: true });
    unsubscribe();
  });

  it('does not convert a global topic change into navigation from an agent subpage', () => {
    const coordinate = resolveActiveConversationCoordinate({
      params: { aid: 'agent-a' },
      resolvedAgentId: 'agent-a',
      url: '/agent/agent-a/profile',
    });
    const navigate = vi.fn();
    const unsubscribe = subscribeActiveConversationNavigation(() => coordinate, navigate);

    useChatStore.setState({ activeTopicId: 'topic-b' }, false);

    expect(navigate).not.toHaveBeenCalled();
    unsubscribe();
  });
});
