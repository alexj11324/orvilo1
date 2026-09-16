import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PortalViewType } from '@/store/chat/slices/portal/initialState';

interface RenderOverlaysOptions {
  portalViewType?: PortalViewType | null;
  topicDrawerTopicId?: string;
}

const stub = (testId: string) => ({ default: () => <div data-testid={testId} /> });

const useSyncRecents = vi.fn();

/**
 * `GlobalOverlays` is the single host for the app-wide drawers and the recents
 * writer. Both of those used to be mounted by the Home layout, which happened
 * to be mounted on every route — so when Home stops being the app shell, these
 * assertions are what proves the behaviour moved rather than disappeared.
 */
const renderOverlays = async ({
  portalViewType = null,
  topicDrawerTopicId,
}: RenderOverlaysOptions = {}) => {
  vi.resetModules();

  vi.doMock('@/hooks/useSyncRecents', () => ({ useSyncRecents }));
  vi.doMock('./AcceptancePortalDrawer', () => stub('acceptance-portal-drawer'));
  vi.doMock('@/features/AgentTasks/AgentTaskDetail/TopicChatDrawer', () =>
    stub('topic-chat-drawer'),
  );
  vi.doMock('@/store/chat', () => ({
    useChatStore: (selector: (state: unknown) => unknown) => selector({}),
  }));
  vi.doMock('@/store/chat/selectors', () => ({
    chatPortalSelectors: { currentViewType: () => portalViewType },
  }));
  vi.doMock('@/store/task', () => ({
    useTaskStore: (selector: (state: unknown) => unknown) => selector({}),
  }));
  vi.doMock('@/store/task/selectors', () => ({
    taskDetailSelectors: { activeTopicDrawerTopicId: () => topicDrawerTopicId },
  }));

  const { default: GlobalOverlays } = await import('./index');

  render(<GlobalOverlays />);
};

afterEach(() => {
  cleanup();
  useSyncRecents.mockClear();
  vi.doUnmock('@/hooks/useSyncRecents');
  vi.doUnmock('./AcceptancePortalDrawer');
  vi.doUnmock('@/features/AgentTasks/AgentTaskDetail/TopicChatDrawer');
  vi.doUnmock('@/store/chat');
  vi.doUnmock('@/store/chat/selectors');
  vi.doUnmock('@/store/task');
  vi.doUnmock('@/store/task/selectors');
});

describe('GlobalOverlays', () => {
  it('writes the nav panel recents on every route, not only on home', async () => {
    await renderOverlays();

    await waitFor(() => expect(useSyncRecents).toHaveBeenCalled());
  });

  it('loads the acceptance drawer only after an acceptance portal opens', async () => {
    await renderOverlays({ portalViewType: PortalViewType.Acceptance });

    expect(await screen.findByTestId('acceptance-portal-drawer')).toBeInTheDocument();
  });

  it('does not load the acceptance drawer for unrelated portal views', async () => {
    await renderOverlays({ portalViewType: PortalViewType.TaskDetail });

    expect(screen.queryByTestId('acceptance-portal-drawer')).not.toBeInTheDocument();
  });

  it('loads the run drawer only once a topic has been opened', async () => {
    await renderOverlays();

    expect(screen.queryByTestId('topic-chat-drawer')).not.toBeInTheDocument();
  });

  it('mounts the run drawer for a topic opened anywhere, including the task list', async () => {
    await renderOverlays({ topicDrawerTopicId: 'topic-1' });

    expect(await screen.findByTestId('topic-chat-drawer')).toBeInTheDocument();
  });
});
