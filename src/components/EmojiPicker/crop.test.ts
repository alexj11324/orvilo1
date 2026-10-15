import { describe, expect, it } from 'vitest';

import { cropRectangle } from './crop';

describe('avatar crop geometry', () => {
  it('centres landscape and portrait source without stretching', () => {
    expect(cropRectangle(800, 400, 256, { x: 0.5, y: 0.5 })).toMatchObject({
      x: 200,
      y: 0,
      width: 400,
      height: 400,
    });
    expect(cropRectangle(400, 800, 256, { x: 0.5, y: 0.5 })).toMatchObject({
      x: 0,
      y: 200,
      width: 400,
      height: 400,
    });
  });
  it('clamps drag positions to valid full-cover source bounds', () => {
    expect(cropRectangle(800, 400, 256, { x: 2, y: -1 })).toMatchObject({ x: 400, y: 0 });
  });
  it('rejects undecoded or nonfinite image dimensions', () => {
    expect(() => cropRectangle(0, 400, 256, { x: 0.5, y: 0.5 })).toThrow();
    expect(() => cropRectangle(Infinity, 400, 256, { x: 0.5, y: 0.5 })).toThrow();
  });
});
