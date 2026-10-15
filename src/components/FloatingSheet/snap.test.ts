import { describe, expect, it } from 'vitest';

import { releaseSheetSnap, resolveSheetSize } from './snap';

const base = {
  start: 320,
  height: 320,
  distance: 0,
  velocity: 0,
  points: [320, 800],
  min: 320,
  max: 800,
  dismissible: true,
  closeThreshold: 0.5,
};

describe('floating conversation snap behavior', () => {
  it('a short fast upward gesture selects the next point rather than nearest', () => {
    expect(releaseSheetSnap({ ...base, height: 350, distance: 30, velocity: 0.5 })).toBe(800);
  });
  it('a fast downward gesture from the first point dismisses only when permitted', () => {
    expect(releaseSheetSnap({ ...base, height: 300, distance: -20, velocity: 0.5 })).toBeNull();
    expect(
      releaseSheetSnap({ ...base, height: 300, distance: -20, velocity: 0.5, dismissible: false }),
    ).toBe(320);
  });
  it('a long slow drag uses exact nearest geometry and close threshold', () => {
    expect(releaseSheetSnap({ ...base, height: 650, distance: 330 })).toBe(800);
    expect(releaseSheetSnap({ ...base, height: 159.999, distance: -160.001 })).toBeNull();
    expect(releaseSheetSnap({ ...base, height: 160, distance: -160 })).toBe(320);
  });
  it('fractional container sizes are resolved without rounding', () => {
    expect(resolveSheetSize(0.8, 1000.125)).toBe(800.1);
    expect(resolveSheetSize(320.125, 1000)).toBe(320.125);
  });
});
