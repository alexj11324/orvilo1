/**
 * @vitest-environment happy-dom
 */
import type { TaskDetailActivity } from '@orvilo/types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHomeStore } from '@/store/home';

import TopicCard from './TopicCard';

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: any) => unknown) =>
    selector({
      activeTaskId: 'T-1',
      addComment: vi.fn(),
      cancelTopic: vi.fn(),
      openTopicDrawer: vi.fn(),
      taskDetailMap: {},
    }),
}));

vi.mock('@/hooks/useActivityTime', () => ({
  useActivityTime: () => ({ text: '4m ago', title: '4m ago' }),
}));

// Keep the reply editor's upload stack out of this card test's module graph.
vi.mock('./RunReplyEditor', () => ({ default: () => null }));

vi.mock('@/features/AgentProfileCard/AgentProfilePopup', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const activity = {
  content: 'See [primes.py](https://example.com/primes.py) for the script.',
  id: 'run-1',
  operationId: 'op-1',
  status: 'success',
  time: new Date('2026-08-13T00:00:00.000Z').toISOString(),
  title: 'Run title',
  topicId: 'topic-1',
  type: 'topic',
} as unknown as TaskDetailActivity;

describe('TopicCard', () => {
  afterEach(() => {
    cleanup();
    useHomeStore.setState({ ungroupedAgents: [] });
  });

  it('shows the delivery without a second acceptance status or checklist', () => {
    render(<TopicCard activity={activity} />, {
      wrapper: MemoryRouter,
    });
    expect(screen.getByRole('link', { name: 'primes.py' })).toBeVisible();
    expect(screen.queryByText('Accepted')).not.toBeInTheDocument();
    expect(screen.queryByText('Acceptance checklist')).not.toBeInTheDocument();
  });

  it('renders runtime branding for an agent author whose avatar is initials', () => {
    useHomeStore.setState({
      ungroupedAgents: [
        {
          id: 'runtime-author',
          name: 'JV',
          title: 'Developer',
          avatar: 'JV',
          heterogeneousType: 'codex',
          type: 'agent',
          pinned: false,
          updatedAt: new Date(),
        },
      ],
    });
    render(
      <TopicCard
        activity={{
          ...activity,
          author: {
            id: 'runtime-author',
            name: 'JV',
            avatar: 'JV',
            type: 'agent',
          },
        }}
      />,
      // The card reads the URL fragment for `#run-<topicId>` deep links.
      { wrapper: MemoryRouter },
    );
    const brand = screen.getByRole('img', { name: /: JV$/ });
    expect(brand.querySelector('svg title')?.textContent).toBe('Codex');
    expect(brand.textContent).not.toContain('JV');
  });
  /**
   * The budget is matched to the work because the work cannot be moved.
   * Measured across two identical runs: 3628ms and 564ms, of which the first
   * `render` (2060ms / 277ms) and the first `getByRole` query (1079ms / 124ms)
   * dominate — one-time warm-up of the render and accessibility machinery, not
   * per-test work. Against the default 5s that left ~1.4x of headroom on the
   * slower reading, on a machine that also runs other agents' builds.
   *
   * Two fixes are closed off. `userEvent` cannot be swapped for `fireEvent`:
   * the assertion is precisely that a pointer-events-respecting click gets
   * through, which `fireEvent` ignores. And the warm-up cannot be hoisted the
   * way a module import can (see `(main)/_layout/authMount.test.ts`) — it needs
   * a mounted DOM, so `beforeAll` would only move the same load sensitivity
   * into the hook timeout.
   */
  it('leaves links in the run output clickable', async () => {
    render(<TopicCard activity={activity} />, { wrapper: MemoryRouter });

    const link = screen.getByRole('link', { name: 'primes.py' });

    // The run body used to carry `pointer-events: none` so that clicks fell
    // through to the card behind it. user-event refuses to click through that
    // rule, which is exactly what a reader hit: a link that ignores the mouse.
    await expect(userEvent.click(link)).resolves.not.toThrow();
  }, 20_000);
});
