import { describe, expect, it } from 'vitest';

import { clampPanelDimension, resolvePanelResize } from './size';

describe('panel resize boundary contract', () => {
  it('preserves exact fractional user dimensions without rounding', () => {
    expect(resolvePanelResize({ width: 320.125, height: 640 }, false, 300, 600)).toEqual({
      collapse: false,
      size: { width: 320.125, height: '100%' },
    });
  });
  it('clamps both axes at the configured limits', () => {
    expect(resolvePanelResize({ width: 0, height: 99 }, true, 160, 720).size.height).toBe(160);
    expect(resolvePanelResize({ width: 999, height: 99 }, false, 300, 600).size.width).toBe(600);
  });
  it('collapse activates at the exact threshold and releases above it', () => {
    expect(resolvePanelResize({ width: 84, height: 100 }, false, 0, 600, 84).collapse).toBe(true);
    expect(resolvePanelResize({ width: 84.001, height: 100 }, false, 0, 600, 84).collapse).toBe(
      false,
    );
  });
  it('minimum width remains enforced before collapse evaluation', () => {
    expect(resolvePanelResize({ width: 50, height: 100 }, false, 300, 600, 84)).toEqual({
      collapse: false,
      size: { width: 300, height: '100%' },
    });
  });
  it('an inverted maximum cannot force the panel below its minimum', () => {
    expect(clampPanelDimension(250, 300, 200)).toBe(300);
  });
});
