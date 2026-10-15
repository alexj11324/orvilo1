import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import GroupAvatar, { getGroupAvatarLayout } from './GroupAvatar';

describe('GroupAvatar', () => {
  it('sizes a 2x2 grid inside the frame', () => {
    expect(getGroupAvatarLayout(32, 3, 2, false)).toEqual({
      avatarSize: 12,
      gapSize: 2,
      gridSize: 2,
    });
    expect(getGroupAvatarLayout(32, 5, 'auto', false).gridSize).toBe(3);
    expect(getGroupAvatarLayout(32, 4, 'auto', false).gridSize).toBe(2);
  });

  it('caps the members to the grid and frames them by corner shape', () => {
    const { container, rerender } = render(
      <GroupAvatar avatars={['😀', '😁', '😂', '🤣', '😃']} size={32} />,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame).toHaveClass('rounded-(--radius-card)');
    expect(frame.style.width).toBe('32px');
    expect(container.querySelectorAll('.orvilo-avatar')).toHaveLength(4);

    rerender(<GroupAvatar avatars={['😀']} cornerShape="circle" size={40} />);
    const single = container.querySelector('.orvilo-avatar') as HTMLElement;
    expect(container.firstElementChild).toHaveClass('rounded-full');
    expect(single.style.width).toBe('32px');
  });
});
