/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskSubscribers from './TaskSubscribers';

const mocks = vi.hoisted(() => ({
  members: [] as Array<{ user: { fullName: string }; userId: string }>,
  querySubscribers: vi.fn(),
}));

vi.mock('@/business/client/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => mocks.members,
}));

vi.mock('@/components/Avatar', () => ({
  default: ({ name, size }: { name: string; size: number }) => (
    <span aria-label={name} data-size={size} data-testid="subscriber-avatar" />
  ),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    workAttention: {
      setSubscriber: { mutate: vi.fn() },
      subscribers: { query: mocks.querySubscribers },
    },
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore: () => 'user-1',
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const renderSubscribers = async (count: number) => {
  mocks.members = Array.from({ length: count }, (_, index) => ({
    user: { fullName: `Subscriber ${index + 1}` },
    userId: `user-${index + 1}`,
  }));
  mocks.querySubscribers.mockResolvedValue(mocks.members.map(({ userId }) => ({ userId })));

  render(<TaskSubscribers taskId="task-1" />);
  await waitFor(() => expect(mocks.querySubscribers).toHaveBeenCalledWith({ taskId: 'task-1' }));
  return screen.getByRole('button', { name: /change subscribers/i });
};

describe('TaskSubscribers avatar overflow', () => {
  beforeEach(() => {
    mocks.querySubscribers.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows all five avatars without an overflow count at the limit', async () => {
    const button = await renderSubscribers(5);

    await waitFor(() => expect(within(button).getAllByTestId('subscriber-avatar')).toHaveLength(5));
    expect(within(button).queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it.each([
    [6, '+1', 'Subscriber 6'],
    [8, '+3', 'Subscriber 6, Subscriber 7, Subscriber 8'],
  ])(
    'shows five stacked avatars and the exact remainder for %i subscribers',
    async (count, remainder, hiddenNames) => {
      const button = await renderSubscribers(count);

      const overflow = await within(button).findByText(remainder);
      expect(within(button).getAllByTestId('subscriber-avatar')).toHaveLength(5);
      expect(overflow).toHaveAttribute('title', hiddenNames);
      expect(overflow.previousElementSibling).toHaveAttribute('aria-label', 'Subscriber 5');
      expect(
        within(button)
          .getAllByTestId('subscriber-avatar')
          .every((avatar) => avatar.getAttribute('data-size') === '18'),
      ).toBe(true);
    },
  );
});
