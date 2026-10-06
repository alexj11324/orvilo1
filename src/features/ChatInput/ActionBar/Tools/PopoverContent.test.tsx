import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ActionPopover from '../components/ActionPopover';
import PopoverContent from './PopoverContent';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('./SkillActivateMode', () => ({ default: () => null }));

const renderSkills = () => {
  const unhandledKey = vi.fn();
  render(
    <div onKeyDown={unhandledKey}>
      <ActionPopover
        trigger="click"
        content={
          <PopoverContent
            autoCount={0}
            pinnedCount={0}
            items={[
              { key: 'alpha', label: 'Alpha' },
              { key: 'beta', label: 'Beta' },
            ]}
          />
        }
      >
        <button type="button">Skills</button>
      </ActionPopover>
    </div>,
  );
  const trigger = screen.getByText('Skills').closest('[data-slot="popover-trigger"]');
  fireEvent.click(screen.getByText('Skills'));
  return { trigger, unhandledKey };
};

describe('Skills search keyboard handling', () => {
  it('closes the actual popover on Escape from search and restores trigger focus', async () => {
    const { trigger } = renderSkills();
    const search = await screen.findByPlaceholderText('tools.search');
    search.focus();

    fireEvent.keyDown(search, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByPlaceholderText('tools.search')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps typing and digit keys inside search without triggering surrounding shortcuts', async () => {
    const { unhandledKey } = renderSkills();
    const search = await screen.findByPlaceholderText('tools.search');
    await userEvent.type(search, 'alpha');

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).toBeNull();
    await userEvent.type(search, '1');
    expect(search).toHaveValue('alpha1');
    expect(search).toBeInTheDocument();
    expect(unhandledKey).not.toHaveBeenCalled();
  });
});
