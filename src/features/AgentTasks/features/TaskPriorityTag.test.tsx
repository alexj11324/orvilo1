import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import TaskPriorityTag from './TaskPriorityTag';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));
vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: { updateTask: () => Promise<void> }) => unknown) =>
    selector({ updateTask: async () => {} }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('TaskPriorityTag', () => {
  it('opens its menu without navigating the clickable task card', async () => {
    const parentClick = vi.fn();
    const ClickableTaskCard = () => {
      const [navigated, setNavigated] = useState(false);
      return (
        <div
          onClick={() => {
            parentClick();
            setNavigated(true);
          }}
        >
          {navigated ? (
            <span>Task details</span>
          ) : (
            <TaskPriorityTag priority={3} taskIdentifier="T-1" />
          )}
        </div>
      );
    };
    render(<ClickableTaskCard />);

    await userEvent.click(screen.getByRole('button'));

    expect(parentClick).not.toHaveBeenCalled();
    expect(await screen.findByRole('menu')).toBeVisible();
    expect(screen.queryByText('Task details')).not.toBeInTheDocument();
  });

  it('closes on Escape from the focused search field and returns focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<TaskPriorityTag priority={3} taskIdentifier="T-1" />);
    const trigger = screen.getByRole('button');
    await user.click(trigger);
    const search = await screen.findByRole('textbox', { name: 'Change priority…' });
    await user.click(search);
    expect(search).toHaveFocus();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
