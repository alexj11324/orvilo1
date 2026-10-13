import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Avatar from './index';

describe('Avatar', () => {
  it('renders a circular image at the exact requested pixel size', () => {
    render(<Avatar avatar="https://example.com/a.png" name="Claude Code" size={32} />);

    const img = screen.getByAltText('Claude Code');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.com/a.png');
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
    expect(img.style.borderRadius).toBe('inherit');
    expect(img.parentElement).toHaveClass('rounded-full');
  });

  it('keeps the rounded-square tile when shape="square"', () => {
    const { container, rerender } = render(
      <Avatar avatar="https://example.com/a.png" shape="square" size={40} />,
    );

    const img = container.querySelector('img');
    expect(img?.style.borderRadius).toBe('inherit');
    expect(img?.parentElement).toHaveClass('rounded-(--avatar-square-radius)');

    rerender(
      <Avatar
        avatar="https://example.com/a.png"
        shape="square"
        size={40}
        style={{ borderRadius: 12 }}
      />,
    );
    expect(img?.parentElement?.style.borderRadius).toBe('12px');
    expect(img?.style.borderRadius).toBe('inherit');

    rerender(
      <Avatar
        avatar="https://example.com/a.png"
        className="rounded-full"
        shape="square"
        size={16}
      />,
    );
    expect(img?.parentElement).toHaveClass('rounded-full');
    expect(img?.parentElement).not.toHaveClass('rounded-(--avatar-square-radius)');
    expect(img?.style.borderRadius).toBe('inherit');

    rerender(
      <Avatar
        avatar="https://example.com/a.png"
        className="rounded-(--radius-overlay)"
        shape="square"
        size={40}
      />,
    );
    expect(img?.parentElement).toHaveClass('rounded-(--radius-overlay)');
    expect(img?.parentElement).not.toHaveClass('rounded-(--avatar-square-radius)');
    expect(img?.style.borderRadius).toBe('inherit');
  });

  it('falls back to initials when there is no image', () => {
    const { container } = render(<Avatar name="Claude Code" size={24} />);

    expect(screen.getByText('CC')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    // The tile still occupies the requested size.
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.style.width).toBe('24px');
    expect(tile.style.height).toBe('24px');
    expect(tile).toHaveAttribute('aria-label', 'Claude Code');
  });

  it('swaps a broken remote image for initials instead of a broken icon', () => {
    render(<Avatar avatar="https://example.com/gone.png" name="Claude Code" size={24} />);

    fireEvent.error(screen.getByAltText('Claude Code'));

    expect(screen.getByText('CC')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders an emoji avatar instead of initials for emoji identities', () => {
    render(<Avatar avatar="🎨" name="palette" size={28} />);

    // The emoji renders as an accessible image, never the initials tile.
    const emoji = screen.getByRole('img');
    expect(emoji).toHaveAttribute('aria-label', '🎨');
    expect(emoji).toHaveTextContent('🎨');
    expect(screen.queryByText('PA')).toBeNull();
  });
});
