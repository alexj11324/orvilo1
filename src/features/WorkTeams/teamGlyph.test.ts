import { getContrast } from 'polished';
import { describe, expect, it } from 'vitest';

import { teamGlyphFontSize, teamGlyphForeground } from './teamGlyph';

// The deterministic fallback palette in TeamIdentity plus the antd status fills.
const TEAM_COLORS = [
  '#5E6AD2',
  '#26B5CE',
  '#F2994A',
  '#EB5757',
  '#BB87FC',
  '#4CB782',
  '#F2C94C',
  '#F1A7C3',
  '#ee9e0b',
  '#379d4a',
];

describe('teamGlyphForeground', () => {
  it.each(TEAM_COLORS)('keeps the letter readable (>= 4.5:1) on %s', (background) => {
    expect(getContrast(background, teamGlyphForeground(background))).toBeGreaterThanOrEqual(4.5);
  });

  it('uses dark text on light accents and white on dark ones', () => {
    expect(teamGlyphForeground('#F2C94C')).toBe('#000');
    expect(teamGlyphForeground('#1e293b')).toBe('#fff');
  });

  it('falls back to white for a color it cannot parse', () => {
    expect(teamGlyphForeground('var(--team)')).toBe('#fff');
  });
});

describe('teamGlyphFontSize', () => {
  it('never drops below the 9px Avatar floor', () => {
    expect(teamGlyphFontSize(14)).toBe(9);
    expect(teamGlyphFontSize(12)).toBe(9);
  });

  it('scales with the glyph above the floor', () => {
    expect(teamGlyphFontSize(16)).toBe(9);
    expect(teamGlyphFontSize(24)).toBe(14);
  });
});
