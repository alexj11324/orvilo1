import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AgentProfileCard from '@/features/AgentProfileCard';

import { Button } from './button';
import { InputGroupButton } from './input-group';

describe('Button loading', () => {
  it('renders the spinner before children and disables the button', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    const spinner = container.querySelector('[data-slot="spinner"]');
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveAttribute('data-icon', 'inline-start');
    expect(screen.getByText('Save')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders normally without loading', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });
});

describe('InputGroupButton size compatibility', () => {
  it('retains its compact sm geometry and forwards button interaction', () => {
    const onClick = vi.fn();
    render(
      <InputGroupButton size="sm" onClick={onClick}>
        Search
      </InputGroupButton>,
    );
    const button = screen.getByRole('button', { name: 'Search' });
    expect(button).toHaveClass('h-8');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

// Only identity data is fixed; the real avatar DOM and keyboard helper stay mounted.
vi.mock('@/features/AgentTasks/shared/useAgentDisplayMeta', () => ({
  useAgentDisplayMeta: () => ({
    avatar: '',
    backgroundColor: '',
    runtimeType: 'orvilo',
    title: 'Test Agent',
  }),
}));

afterEach(cleanup);

const getHeaderAvatar = () => {
  const avatars = screen.getAllByRole('img', { name: 'cmdk.context.agent: Test Agent' });
  expect(avatars).toHaveLength(2);
  return avatars[1].parentElement!;
};

describe('AgentProfileCard header activation', () => {
  it('activates the avatar once for each mouse click, Enter and Space', async () => {
    const user = userEvent.setup();
    const onHeaderClick = vi.fn();
    render(<AgentProfileCard agentId="agent-1" title="Test Agent" onHeaderClick={onHeaderClick} />);

    await user.click(getHeaderAvatar());
    expect(onHeaderClick).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    expect(onHeaderClick).toHaveBeenCalledTimes(2);
    await user.keyboard(' ');
    expect(onHeaderClick).toHaveBeenCalledTimes(3);
  });

  it('reaches the avatar then title by Tab and activates each with Enter and Space', async () => {
    const user = userEvent.setup();
    const onHeaderClick = vi.fn();
    render(<AgentProfileCard agentId="agent-1" title="Test Agent" onHeaderClick={onHeaderClick} />);

    await user.tab();
    expect(getHeaderAvatar()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onHeaderClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onHeaderClick).toHaveBeenCalledTimes(2);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Test Agent' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onHeaderClick).toHaveBeenCalledTimes(3);
    await user.keyboard(' ');
    expect(onHeaderClick).toHaveBeenCalledTimes(4);
  });

  it('keeps the avatar and title out of button semantics when no callback is supplied', async () => {
    const user = userEvent.setup();
    render(<AgentProfileCard agentId="agent-1" title="Test Agent" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await user.tab();
    expect(getHeaderAvatar()).not.toHaveFocus();
    expect(screen.getByText('Test Agent')).not.toHaveFocus();
  });
});
