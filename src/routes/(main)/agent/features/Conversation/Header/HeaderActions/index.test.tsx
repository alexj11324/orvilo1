import { type ThreadItem, ThreadStatus, ThreadType } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { act } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChatStore, useChatStore } from '@/store/chat';

import ThreadSwitcher from '../Tags/ThreadSwitcher';
import HeaderActions from './index';

vi.mock('./useMenu', () => ({
  useMenu: () => ({
    menuHeader: <div data-testid={'topic-info-header'} />,
    menuItems: [],
  }),
}));

describe('Conversation header actions', () => {
  it('renders the overflow actions button', () => {
    render(<HeaderActions />);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('passes the topic info header to the dropdown', async () => {
    render(<HeaderActions />);

    fireEvent.click(screen.getByRole('button'));

    expect(await screen.findByTestId('topic-info-header')).toBeInTheDocument();
  });
});

// Thread navigation and overflow actions are adjacent public consumers in the
// real Conversation Header. Keep their actual controls in the same scene.
// The existing useMenu fixture above supplies only overflow-menu data; it does
// not replace ThreadSwitcher, Popover, ActionIcon, store actions or selectors.
vi.unmock('react-i18next');
vi.unmock('zustand/traditional');

describe('Conversation header thread navigation', () => {
  const i18n = createInstance();
  const topicId = 'thread-switcher-keyboard-topic';
  const currentThreadId = 'thread-current';
  const time = new Date('2026-01-01T00:00:00.000Z');
  const thread = (id: string, title: string): ThreadItem => ({
    createdAt: time,
    id,
    lastActiveAt: time,
    status: ThreadStatus.Active,
    title,
    topicId,
    type: ThreadType.Continuation,
    updatedAt: time,
    userId: 'thread-switcher-keyboard-user',
  });

  let originalState: ChatStore;

  beforeAll(async () => {
    await i18n.init({
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      lng: 'en',
      resources: { en: { chat: { thread: { title: 'Thread' } } } },
    });
  });

  beforeEach(() => {
    originalState = useChatStore.getState();
    act(() => {
      useChatStore.setState({
        activeThreadId: currentThreadId,
        activeTopicId: topicId,
        threadMaps: {
          [topicId]: [
            thread(currentThreadId, 'Current thread'),
            thread('thread-other', 'Other thread'),
          ],
        },
      });
    });
  });

  afterEach(() => {
    cleanup();
    act(() => useChatStore.setState(originalState, true));
  });

  const mount = () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ThreadSwitcher title="Current thread" />
        <HeaderActions />
      </I18nextProvider>,
    );
    return screen.getByText('Current thread');
  };

  describe('ThreadSwitcher public non-button trigger', () => {
    it.each([
      ['Enter', '{Enter}'],
      ['Space', ' '],
    ])('opens actual thread choices through Tab then %s', async (_name, key) => {
      const user = userEvent.setup();
      const trigger = mount();
      await user.tab();
      expect(trigger).toHaveFocus();
      await user.keyboard(key);
      // The baseline nativeButton=true span has no native click default and no
      // Base UI non-native key handler. This is an outcome assertion, not a
      // source-string/nativeButton attribute assertion.
      expect(await screen.findByText('Other thread')).toBeVisible();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('role', 'button');
    });

    it('exposes button semantics for the real span trigger while closed', () => {
      const trigger = mount();
      expect(screen.getByRole('button', { name: 'Current thread' })).toBe(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('preserves ordinary click opening and Escape closure', async () => {
      const user = userEvent.setup();
      const trigger = mount();
      await user.click(trigger);
      expect(await screen.findByText('Other thread')).toBeVisible();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      expect(trigger).toHaveFocus();
    });

    it('does not switch the real active thread when its current row is clicked', async () => {
      const user = userEvent.setup();
      const trigger = mount();
      await user.click(trigger);
      const currentRows = await screen.findAllByText('Current thread');
      const currentRow = currentRows.find((element) => element !== trigger);
      expect(currentRow).toBeDefined();
      await user.click(currentRow!);
      expect(useChatStore.getState().activeThreadId).toBe(currentThreadId);
    });

    it('renders live changes from the real public topic thread selector', async () => {
      const user = userEvent.setup();
      await user.click(mount());
      expect(await screen.findByText('Other thread')).toBeVisible();
      act(() => {
        useChatStore.setState({
          threadMaps: {
            [topicId]: [
              thread(currentThreadId, 'Current thread'),
              thread('thread-new', 'New thread'),
            ],
          },
        });
      });
      expect(await screen.findByText('New thread')).toBeVisible();
      expect(screen.queryByText('Other thread')).not.toBeInTheDocument();
      expect(useChatStore.getState().activeThreadId).toBe(currentThreadId);
    });
  });
});
