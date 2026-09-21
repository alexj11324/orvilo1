'use client';

import { createStaticStyles, cx } from 'antd-style';
import { memo, useMemo } from 'react';

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

const styles = createStaticStyles(({ css }) => ({
  glyph: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    border-radius: 4px;

    font-weight: 600;
    color: #fff;
    text-transform: uppercase;
  `,
}));

const TeamIdentity = memo<{ color?: string | null; id: string; letter?: string; size?: number }>(
  ({ color, id, letter, size = 16 }) => {
    const background = useMemo(() => teamAccentColor(id, color), [color, id]);
    return (
      <span
        aria-hidden
        className={cx(styles.glyph)}
        style={{
          background,
          fontSize: Math.round(size * 0.5625),
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
