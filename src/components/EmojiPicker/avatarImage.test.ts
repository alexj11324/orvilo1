import { describe, expect, it } from 'vitest';

import { ACCEPTED_IMAGE_TYPES, centerSquare } from './avatarImage';

describe('centerSquare', () => {
  it('crops the centered square of a landscape or portrait image', () => {
    expect(centerSquare(400, 200)).toEqual({ size: 200, x: 100, y: 0 });
    expect(centerSquare(120, 300)).toEqual({ size: 120, x: 0, y: 90 });
    expect(centerSquare(64, 64)).toEqual({ size: 64, x: 0, y: 0 });
  });

  it('accepts the uploadable raster formats only', () => {
    expect(ACCEPTED_IMAGE_TYPES.has('image/webp')).toBe(true);
    expect(ACCEPTED_IMAGE_TYPES.has('image/svg+xml')).toBe(false);
  });
});
