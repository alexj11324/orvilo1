// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ClosableBadge from './ClosableBadge';

describe('ClosableBadge', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ClosableBadge onClose={onClose}>chip</ClosableBadge>);

    fireEvent.click(screen.getByRole('button'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not bubble the close click to a parent onClick', () => {
    const onClose = vi.fn();
    const onParentClick = vi.fn();
    render(
      <ClosableBadge closeLabel="close" onClick={onParentClick} onClose={onClose}>
        chip
      </ClosableBadge>,
    );

    fireEvent.click(screen.getByLabelText('close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('renders no close button without onClose', () => {
    render(<ClosableBadge>chip</ClosableBadge>);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
