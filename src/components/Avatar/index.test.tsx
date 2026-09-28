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
    expect(img.style.borderRadius).toBe('16px');
  });

  it('keeps the rounded-square tile when shape="square"', () => {
    const { container } = render(
      <Avatar avatar="https://example.com/a.png" shape="square" size={40} />,
    );

    const img = container.querySelector('img');
    expect(img?.style.borderRadius).toBe('9px');
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
    const { container } = render(<Avatar avatar="🎨" name="palette" size={28} />);

    // The emoji draws through FluentEmoji's image, never the initials tile.
    const emoji = container.querySelector('img');
    expect(emoji).not.toBeNull();
    expect(emoji).toHaveAttribute('alt', '🎨');
    expect(screen.queryByText('PA')).toBeNull();
  });
});
