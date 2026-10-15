import { describe, expect, it } from 'vitest';

import { resizeHandles, resizePanel, resolveToastDodge } from './geometry';

describe('floating panel gesture geometry', () => {
  const base = {
    width: 640.125,
    height: 480.25,
    deltaX: 20.375,
    deltaY: -10.625,
    minWidth: 360,
    minHeight: 320,
    maxWidth: 1000,
    maxHeight: 800,
  };
  it('each anchored corner grows only along its free edges without rounding', () => {
    expect(resizePanel({ ...base, handle: 'topLeft' })).toEqual({ width: 619.75, height: 490.875 });
    expect(resizePanel({ ...base, handle: 'bottomRight' })).toEqual({
      width: 660.5,
      height: 469.625,
    });
    expect(resizePanel({ ...base, handle: 'left' }).height).toBe(480.25);
    expect(resizeHandles('topLeft')).toEqual(['bottom', 'right', 'bottomRight']);
  });
  it('bounds retain caller minimum even when viewport is smaller', () => {
    expect(
      resizePanel({
        ...base,
        handle: 'topLeft',
        deltaX: 9999,
        deltaY: 9999,
        maxWidth: 200,
        maxHeight: 100,
      }),
    ).toEqual({ width: 360, height: 320 });
  });
});
describe('toast and panel stay in separate viewport lanes', () => {
  const base = {
    panelHeight: 640,
    panelWidth: 640,
    panelOffsetX: 8,
    panelOffsetY: 8,
    viewportHeight: 900,
    viewportWidth: 1400,
  };
  it('uses a full-width side lane when available', () => {
    expect(resolveToastDodge(base)).toEqual({
      reserve: 8,
      alignInline: 0,
      shiftX: 644,
      shiftY: 0,
      width: 360,
    });
  });
  it('moves upward when only vertical headroom is available', () => {
    expect(resolveToastDodge({ ...base, viewportWidth: 800 })).toEqual({
      reserve: 0,
      alignInline: 8,
      shiftX: 0,
      shiftY: 644,
      width: 360,
    });
  });
  it('narrows the side lane before reserving the bottom edge', () => {
    expect(resolveToastDodge({ ...base, viewportHeight: 700, viewportWidth: 976 }).width).toBe(300);
    expect(resolveToastDodge({ ...base, viewportHeight: 700, viewportWidth: 800 })).toEqual({
      reserve: 108,
      alignInline: 8,
      shiftX: 0,
      shiftY: 0,
      width: 360,
    });
  });
});
