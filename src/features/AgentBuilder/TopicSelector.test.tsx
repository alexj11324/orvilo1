/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GroupTopicSelector from '@/routes/(main)/group/profile/features/AgentBuilder/TopicSelector';

import TopicSelector from './TopicSelector';

const switchTopic = vi.fn();
const useFetchTopics = vi.fn();
// Stable store data keeps disabled as the only memo input that changes on rerender.
const chatState = {
  activeTopicId: 'topic-1',
  switchTopic,
  topics: [
    { id: 'topic-1', title: 'First topic', updatedAt: new Date('2026-05-24') },
    { id: 'topic-2', title: 'Second topic', updatedAt: new Date('2026-05-24') },
    { id: 'topic-3', title: 'Third topic', updatedAt: new Date('2026-05-24') },
  ],
  useFetchTopics,
};

// Only store/query boundaries are fixed; navigation and all interactive primitives are real.
vi.mock('@/hooks/useFetchChatTopics', () => ({
  useFetchAgentChatTopics: (...args: unknown[]) => useFetchTopics(...args),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: any) =>
    selector({ leftPanelDrawerMode: false, status: { showLeftPanel: true } }),
}));

vi.mock('dayjs', () => {
  const dayjs = () => ({
    diff: () => 0,
    format: () => '2026-05-24',
    fromNow: () => 'now',
  });
  // `@orvilo/utils/time` extends dayjs with plugins on import.
  dayjs.extend = () => {};
  return { default: dayjs };
});

vi.mock('@/const/layoutTokens', () => ({
  DESKTOP_HEADER_ICON_SMALL_SIZE: 24,
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: any) => selector(chatState),
}));

vi.mock('@/store/chat/slices/topic/selectors', () => ({
  topicSelectors: {
    getTopicsByAgentId: () => (s: any) => s.topics,
  },
}));

describe('AgentBuilder TopicSelector', () => {
  beforeEach(() => {
    switchTopic.mockReset();
    useFetchTopics.mockReset();
  });

  it('does not create a new topic when disabled', () => {
    render(<TopicSelector disabled agentId="agent-builder" />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));

    expect(switchTopic).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BuilderQuery = () => <output aria-label="Builder query">{useLocation().search}</output>;

const groupPicker = (disabled: boolean) => (
  <MemoryRouter initialEntries={['/group/profile?bt=topic-1']}>
    <GroupTopicSelector agentId="group-builder" disabled={disabled} />
    <BuilderQuery />
  </MemoryRouter>
);

describe('Group AgentBuilder TopicSelector', () => {
  it('does not switch an already-open topic menu after becoming disabled', async () => {
    const user = userEvent.setup();
    const { rerender } = render(groupPicker(false));

    // Prove the real menu, checkbox and router update work before changing disabled.
    await user.click(screen.getByRole('button', { name: 'actions.recentTopics' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Second topic' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Builder query')).toHaveTextContent('?bt=topic-2'),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitemcheckbox', { name: 'Second topic' }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'actions.recentTopics' }));
    const pendingTopic = await screen.findByRole('menuitemcheckbox', { name: 'Third topic' });
    rerender(groupPicker(true));
    expect(screen.getByRole('button', { name: 'actions.recentTopics' })).toBeDisabled();
    expect(pendingTopic).toBeInTheDocument();
    await user.click(pendingTopic);

    // The old memo retained disabled=false and changed the public URL to topic-3.
    expect(screen.getByLabelText('Builder query')).toHaveTextContent('?bt=topic-2');

    // Re-enabling keeps the public selection path usable.
    rerender(groupPicker(false));
    await user.click(screen.getByRole('button', { name: 'actions.recentTopics' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Third topic' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Builder query')).toHaveTextContent('?bt=topic-3'),
    );
  });
});
