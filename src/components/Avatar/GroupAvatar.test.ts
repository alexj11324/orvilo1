import { describe, expect, it } from 'vitest';

import { getGroupAvatarLayout } from './GroupAvatar';

describe('getGroupAvatarLayout', () => {
  it('fits a 2x2 grid of square tiles inside the frame', () => {
    expect(getGroupAvatarLayout(32, 3, 2, false)).toEqual({
      avatarSize: 12,
      gapSize: 2,
      gridSize: 2,
    });
  });

  it('shrinks tiles inside a circular frame', () => {
    expect(getGroupAvatarLayout(40, 4, 2, true)).toEqual({
      avatarSize: 13,
      gapSize: 2,
      gridSize: 2,
    });
  });

  it('switches to a 3x3 grid above four members in auto mode', () => {
    expect(getGroupAvatarLayout(32, 4, 'auto', false).gridSize).toBe(2);
    expect(getGroupAvatarLayout(32, 5, 'auto', false).gridSize).toBe(3);
  });
});
