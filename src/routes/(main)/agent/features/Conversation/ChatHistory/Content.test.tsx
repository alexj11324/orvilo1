/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatHistoryContent from './Content';

const mocks = vi.hoisted(() => ({
  activeTopicId: 'topic-2' as string | undefined,
  isLoading: false,
  navigateToTopic: vi.fn(),
  searchTopics: vi.fn(),
  topics: [
    { id: 'topic-1', title: 'First chat' },
    { id: 'topic-2', title: 'Second chat' },
  ] as { id: string; title: string }[],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { ns?: string }) => `${options?.ns ? `${options.ns}:` : ''}${key}`,
  }),
}));

vi.mock('@/hooks/useFetchChatTopics', () => ({
  useFetchChatTopics: vi.fn(),
}));

vi.mock('@/features/AgentSidebar/Topic/hooks/useTopicNavigation', () => ({
  useTopicNavigation: () => ({ navigateToTopic: mocks.navigateToTopic }),
}));

vi.mock('@/services/topic', () => ({
  topicService: { searchTopics: mocks.searchTopics },
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      __loading: mocks.isLoading,
      __topics: mocks.topics,
      activeAgentId: 'agent-1',
      activeTopicId: mocks.activeTopicId,
    }),
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    displayTopics: (s: { __topics: unknown }) => s.__topics,
    isUndefinedTopics: (s: { __loading: boolean }) => s.__loading,
  },
}));

describe('ChatHistoryContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLoading = false;
    mocks.activeTopicId = 'topic-2';
  });

  it('lists the loaded topics', () => {
    render(<ChatHistoryContent />);

    expect(screen.getByText('First chat')).toBeInTheDocument();
    expect(screen.getByText('Second chat')).toBeInTheDocument();
  });

  it('navigates to a topic and notifies the popover to close on click', () => {
    const onNavigate = vi.fn();
    render(<ChatHistoryContent onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('First chat'));

    expect(mocks.navigateToTopic).toHaveBeenCalledWith('topic-1');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('shows the empty state when there is no history', () => {
    mocks.topics = [];
    render(<ChatHistoryContent />);

    expect(screen.getByText('chat:chatHistory.empty')).toBeInTheDocument();
  });

  it('queries the topic service directly while searching', async () => {
    mocks.searchTopics.mockResolvedValue([{ id: 'topic-9', title: 'Search hit' }]);
    render(<ChatHistoryContent />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hit' } });

    await waitFor(() => expect(mocks.searchTopics).toHaveBeenCalledWith('hit', 'agent-1'));
    expect(await screen.findByText('Search hit')).toBeInTheDocument();
  });
});
