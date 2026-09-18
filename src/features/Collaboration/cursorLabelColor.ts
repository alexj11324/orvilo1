import { readableColor } from 'polished';

/**
 * antd's resting text alpha — a softer dark than pure black for labels painted
 * over light actor colors (lime/cyan/orange sit in the presence palette).
 */
const DARK_ON_LIGHT = 'rgba(0, 0, 0, 0.85)';

/**
 * Label foreground for a cursor chip painted on `background`. The presence
 * palette includes high-luminance colors where a hardcoded white label is
 * unreadable, so the foreground derives from the actual background luminance:
 * dark text on light actors, white on dark. `undefined` (and unparseable
 * colors) keeps the stylesheet default.
 */
export const cursorLabelForeground = (background?: string): string | undefined => {
  if (!background) return undefined;
  try {
    return readableColor(background, DARK_ON_LIGHT, '#fff');
  } catch {
    return undefined;
  }
};
