import { getContrast, mix } from 'polished';
import { describe, expect, it } from 'vitest';

import { stateText } from './themeRoles';

describe('stateText', () => {
  it('keeps status text readable on its wash and the plain surface in both themes', () => {
    for (const surface of ['#ffffff', '#080808']) {
      for (const fill of ['#ee9e0b', '#379d4a', '#57abf9', '#ffe100']) {
        const wash = mix(0.1, fill, surface);
        const hover = mix(0.2, fill, surface);
        const text = stateText(
          fill,
          wash,
          surface,
          surface === '#ffffff' ? '#080808' : '#ffffff',
          hover,
        );
        expect(getContrast(text, wash)).toBeGreaterThanOrEqual(4.5);
        expect(getContrast(text, surface)).toBeGreaterThanOrEqual(4.5);
        expect(getContrast(text, hover)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
