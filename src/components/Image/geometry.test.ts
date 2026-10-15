import { describe, expect, it } from 'vitest';

import { fitScale, scaleBounds, VIEWER_PADDING, wheelFactor, wrapIndex, zoomAt } from './geometry';

const viewport = { height: 800 + VIEWER_PADDING * 2, width: 1000 + VIEWER_PADDING * 2 };

describe('fitScale', () => {
  it('shrinks a large image to fit the padded viewport', () => {
    expect(fitScale({ height: 1600, width: 1000 }, viewport)).toBe(0.5);
    expect(fitScale({ height: 400, width: 4000 }, viewport)).toBe(0.25);
  });

  it('keeps small images at their natural size', () => {
    expect(fitScale({ height: 100, width: 100 }, viewport)).toBe(1);
  });

  it('swaps the axes for quarter rotations', () => {
    expect(fitScale({ height: 1000, width: 1600 }, viewport)).toBe(0.625);
    expect(fitScale({ height: 1000, width: 1600 }, viewport, 90)).toBe(0.5);
    expect(fitScale({ height: 1000, width: 1600 }, viewport, -270)).toBe(0.5);
    expect(fitScale({ height: 1000, width: 1600 }, viewport, 180)).toBe(0.625);
  });

  it('falls back to 1 before the image has loaded', () => {
    expect(fitScale({ height: 0, width: 0 }, viewport)).toBe(1);
  });
});

describe('zoomAt', () => {
  const bounds = scaleBounds(0.5, 8);

  it('keeps the anchor point fixed while zooming', () => {
    const next = zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: -50 }, bounds);
    expect(next).toEqual({ scale: 2, x: -100, y: 50 });
  });

  it('clamps to the scale bounds', () => {
    expect(bounds).toEqual({ max: 8, min: 0.125 });
    expect(zoomAt({ scale: 6, x: 0, y: 0 }, 2, { x: 0, y: 0 }, bounds).scale).toBe(8);
    expect(zoomAt({ scale: 0.2, x: 0, y: 0 }, 0.1, { x: 0, y: 0 }, bounds).scale).toBe(0.125);
  });
});

describe('viewer helpers', () => {
  it('zooms in on upward wheel motion and caps a single tick', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(10_000)).toBe(wheelFactor(50));
  });

  it('wraps gallery navigation at both ends', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(0, 0)).toBe(0);
  });
});
