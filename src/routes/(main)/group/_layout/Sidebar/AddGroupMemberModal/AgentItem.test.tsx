import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import AgentItem from './AgentItem';
import { useAgentSelectionStore } from './store';

const agent = {
  avatar: null,
  backgroundColor: null,
  description: null,
  id: 'agent-one',
  title: 'Writer',
};

beforeEach(() => useAgentSelectionStore.getState().clearSelection());
afterEach(cleanup);

describe('group member selection', () => {
  it('selects and deselects once per real checkbox click', async () => {
    const user = userEvent.setup();
    render(<AgentItem showCheckbox agent={agent} defaultTitle="Agent" />);
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(useAgentSelectionStore.getState().selectedAgentIds).toEqual([agent.id]);
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(useAgentSelectionStore.getState().selectedAgentIds).toEqual([]);
  });

  it('keeps row clicks and keyboard selection working with an accessible name', async () => {
    const user = userEvent.setup();
    render(<AgentItem showCheckbox agent={agent} defaultTitle="Agent" />);
    const checkbox = screen.getByRole('checkbox');
    await user.click(screen.getByText('Writer'));
    expect(checkbox).toBeChecked();
    checkbox.focus();
    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAccessibleName('Writer');
  });
});
