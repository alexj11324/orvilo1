import { describe, expect, it } from 'vitest';

import { cursorLabelForeground } from './cursorLabelColor';

// The server palette (apps/server roomAuthz ACTOR_COLORS) — pinned here so a
// palette change toward lighter colors surfaces as a label-contrast failure.
describe('cursorLabelForeground', () => {
  it('returns dark text on the high-luminance palette colors', () => {
    for (const color of ['#a0d911', '#13c2c2', '#fa8c16', '#f5222d', '#eb2f96', '#1677ff']) {
      expect(cursorLabelForeground(color)).toBe('rgba(0, 0, 0, 0.85)');
    }
  });

  it('returns white on the dark palette colors', () => {
    for (const color of ['#722ed1', '#2f54eb']) {
      expect(cursorLabelForeground(color)).toBe('#fff');
    }
  });

  it('keeps the stylesheet default for missing or unparseable colors', () => {
    expect(cursorLabelForeground(undefined)).toBeUndefined();
    expect(cursorLabelForeground('')).toBeUndefined();
    expect(cursorLabelForeground('not-a-color')).toBeUndefined();
  });
});
