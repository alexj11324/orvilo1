import { describe, expect, it } from 'vitest';

import { resizedImageWidth } from './imageGeometry';

describe('native image resize', () => {
  it('preserves fractional widths rather than rounding', () =>
    expect(resizedImageWidth(100.25, 0.125, 500)).toBe(100.375));
  it('preserves the original minimum and container maximum', () => {
    expect(resizedImageWidth(100, -99, 500)).toBe(50);
    expect(resizedImageWidth(100, 900, 500)).toBe(500);
  });
  it('fits containers narrower than the old minimum', () =>
    expect(resizedImageWidth(100, -99, 32)).toBe(32));
});
