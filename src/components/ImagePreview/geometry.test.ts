import { describe, expect, it } from 'vitest';

import {
  anchoredZoom,
  boundPan,
  clampScale,
  fitImage,
  galleryIndex,
  initialScale,
} from './geometry';

describe('image viewer geometry transitions', () => {
  it('contains a tall screenshot without enlargement and exchanges axes on rotation', () => {
    expect(fitImage({ height: 1600, width: 720 }, { height: 400, width: 800 }, 0)).toEqual({
      height: 400,
      ratio: 0.25,
      width: 180,
    });
    expect(fitImage({ height: 1600, width: 720 }, { height: 400, width: 800 }, 90)).toEqual({
      height: 800,
      ratio: 0.5,
      width: 360,
    });
    expect(fitImage({ height: 100, width: 100 }, { height: 400, width: 800 }, 0).ratio).toBe(1);
    expect(fitImage({ height: 0, width: 0 }, { height: 0, width: 0 }, 0)).toEqual({
      height: 0,
      ratio: 0,
      width: 0,
    });
  });
  it('keeps fit/actual/auto policy and clips the requested scale to its limit', () => {
    expect(initialScale('fit', 0.25)).toBe(1);
    expect(initialScale('actual', 0.25)).toBe(4);
    expect(initialScale('auto', 0.25, 2)).toBe(1);
    expect(initialScale('auto', 0.5, 2)).toBe(2);
    expect(clampScale(20, 8)).toBe(8);
    expect(clampScale(0, 8)).toBe(1);
  });
  it('keeps the pointer pixel anchored and prevents panning a contained axis out of sight', () => {
    expect(anchoredZoom({ scale: 1, x: 0, y: 0 }, 2, { x: 40, y: 20 })).toEqual({
      scale: 2,
      x: -40,
      y: -20,
    });
    expect(
      boundPan(
        { scale: 2, x: 500, y: 500 },
        { height: 400, width: 200 },
        { height: 400, width: 800 },
        0,
      ),
    ).toEqual({ scale: 2, x: 0, y: 200 });
  });
  it('wraps the first and last gallery entry while keeping singleton navigation stable', () => {
    expect(galleryIndex(-1, 3)).toBe(2);
    expect(galleryIndex(3, 3)).toBe(0);
    expect(galleryIndex(1, 1)).toBe(0);
    expect(galleryIndex(1, 0)).toBe(0);
  });
});
