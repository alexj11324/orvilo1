/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FavoriteToggle from './index';

const mocks = vi.hoisted(() => ({
  favorite: false,
  favoriteTopic: vi.fn(),
  topicId: 'topic-1' as string | undefined,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/Conversation/useAgentContext', () => ({
  useAgentContext: () => ({ agentId: 'agent-1', topicId: mocks.topicId }),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      __favorite: mocks.favorite,
      favoriteTopic: mocks.favoriteTopic,
    }),
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    getTopicById: (id: string) => (s: { __favorite: boolean }) =>
      id === 'topic-1' ? { favorite: s.__favorite, id } : undefined,
  },
}));

describe('FavoriteToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.favorite = false;
    mocks.topicId = 'topic-1';
  });

  it('renders nothing on the new-chat surface (no topic)', () => {
    mocks.topicId = undefined;

    const { container } = render(<FavoriteToggle />);

    expect(container).toBeEmptyDOMElement();
  });

  it('favorites the active topic on click', () => {
    render(<FavoriteToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.favorite' }));

    expect(mocks.favoriteTopic).toHaveBeenCalledWith('topic-1', true);
  });

  it('unfavorites when the topic is already favorited', () => {
    mocks.favorite = true;
    render(<FavoriteToggle />);

    const button = screen.getByRole('button', { name: 'actions.unfavorite' });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(button);

    expect(mocks.favoriteTopic).toHaveBeenCalledWith('topic-1', false);
  });
});
