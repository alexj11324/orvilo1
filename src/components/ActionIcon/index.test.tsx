import { fireEvent, render, screen } from '@testing-library/react';
import { PlusIcon } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import ActionIcon from './index';

describe('ActionIcon', () => {
  it('uses the string title as aria-label and wires a tooltip', () => {
    render(<ActionIcon icon={PlusIcon} title="Add item" />);

    const button = screen.getByRole('button', { name: 'Add item' });
    expect(button).toBeInTheDocument();
  });

  it('renders the icon glyph at the named-size block', () => {
    const { container } = render(<ActionIcon icon={PlusIcon} size="small" title="s" />);

    const button = screen.getByRole('button');
    expect(button.style.width).toBe('24px');
    expect(button.style.height).toBe('24px');
    expect(button.style.borderRadius).toBe('4px');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('scales number sizes via the lobehub formula', () => {
    render(<ActionIcon icon={PlusIcon} size={16} />);

    const button = screen.getByRole('button');
    expect(button.style.width).toBe('28.8px');
    expect(button.style.borderRadius).toBe('4px');
  });

  it('loading swaps the glyph for a spinner and disables the button', () => {
    const onClick = vi.fn();
    const { container } = render(<ActionIcon loading icon={PlusIcon} onClick={onClick} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks active state', () => {
    render(<ActionIcon active icon={PlusIcon} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');
  });

  it('applies the negative outdent margin only on borderless variant', () => {
    const { rerender } = render(<ActionIcon outdent icon={PlusIcon} size="small" />);
    expect(screen.getByRole('button').style.marginInlineStart).toBe('-5px');

    rerender(<ActionIcon icon={PlusIcon} outdent={'end'} size="small" />);
    expect(screen.getByRole('button').style.marginInlineEnd).toBe('-5px');
  });
});
