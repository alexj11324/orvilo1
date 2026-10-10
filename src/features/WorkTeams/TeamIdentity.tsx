'use client';

import { memo, useMemo } from 'react';

import { teamGlyphFontSize, teamGlyphForeground } from './teamGlyph';

/**
 * Linear-style team glyph: a rounded square in the team's accent color with the
 * key letter. When the team has no color a deterministic palette pick keeps the
 * same team looking the same across surfaces.
 */
const TEAM_PALETTE = [
  '#5E6AD2',
  '#26B5CE',
  '#F2994A',
  '#EB5757',
  '#BB87FC',
  '#4CB782',
  '#F2C94C',
  '#F1A7C3',
] as const;

const hashCode = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const teamAccentColor = (id: string, color?: string | null): string =>
  color ?? TEAM_PALETTE[hashCode(id) % TEAM_PALETTE.length]!;

const styles = {
  glyph: 'inline-flex flex-none items-center justify-center rounded-[4px] font-semibold uppercase',
};

const TeamIdentity = memo<{ color?: string | null; id: string; letter?: string; size?: number }>(
  ({ color, id, letter, size = 16 }) => {
    const background = useMemo(() => teamAccentColor(id, color), [color, id]);
    return (
      <span
        aria-hidden
        className={styles.glyph}
        style={{
          background,
          // Derived from the team color: white is unreadable on the light accents.
          color: teamGlyphForeground(background),
          fontSize: teamGlyphFontSize(size),
          height: size,
          width: size,
        }}
      >
        {letter}
      </span>
    );
  },
);

TeamIdentity.displayName = 'TeamIdentity';

export default TeamIdentity;
