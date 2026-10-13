import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Select from './index';

afterEach(cleanup);

describe('Select multiple popup lifecycle', () => {
  it('reports opening and Escape closing through onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <Select
        aria-label="Choose values"
        mode="multiple"
        value={[]}
        options={[
          { label: 'Alpha', value: 'alpha' },
          { label: 'Beta', value: 'beta' },
        ]}
        onOpenChange={onOpenChange}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Choose values' });
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    expect(await screen.findByRole('option', { name: 'Alpha' })).toBeVisible();
    expect(onOpenChange).toHaveBeenNthCalledWith(1, true);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(input).toHaveFocus();
  });
});
