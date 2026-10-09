import { getContrast } from 'polished';

const DARK_FOREGROUND = '#000';
const LIGHT_FOREGROUND = '#fff';

/** Same floor as `Avatar` (`Math.max(9, ...)`), so small glyphs never drop to 8px. */
const MIN_GLYPH_FONT_SIZE = 9;
const GLYPH_FONT_RATIO = 0.5625;

/**
 * Letter color for a team glyph painted on `background`. Team colors are fixed brand
 * accents (not theme tokens), so a hardcoded white fails on the light ones (white on
 * the amber/cyan/yellow palette picks is 1.9-2.5:1). Picks whichever of black/white
 * contrasts more: black and white cross at a luminance where both give about 4.6:1,
 * so every background clears 4.5:1. Unparseable colors keep white.
 */
export const teamGlyphForeground = (background: string): string => {
  try {
    return getContrast(background, DARK_FOREGROUND) > getContrast(background, LIGHT_FOREGROUND)
      ? DARK_FOREGROUND
      : LIGHT_FOREGROUND;
  } catch {
    return LIGHT_FOREGROUND;
  }
};

export const teamGlyphFontSize = (size: number): number =>
  Math.max(MIN_GLYPH_FONT_SIZE, Math.round(size * GLYPH_FONT_RATIO));
