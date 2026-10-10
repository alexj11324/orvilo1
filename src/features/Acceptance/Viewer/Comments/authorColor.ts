import { useCallback } from 'react';

import { useIsDark } from '@/hooks/useIsDark';

/**
 * Marks drawn on evidence need to say WHO drew them at a glance: two reviewers
 * circling the same screenshot in one colour read as one person's notes. Each
 * author gets a stable hue from the design system's preset scale, so the box on
 * the image, the ring on their avatar and the marker badge always agree.
 *
 * Two separate problems meet on this box, and each has its own answer.
 *
 * The token resolves per theme, and the same step is not the same tone on both
 * ends: step 10 is the mid-tone solid in light (#2fa28a for cyan) but a
 * near-white tint in dark (#bdf7e4). Reading one step in both themes therefore
 * hands the dark page a glowing mark, so the step is picked per theme — 10 in
 * light, 7 in dark — to land on the mid-tone either way.
 *
 * That still says nothing about whether the mark is legible, because it does
 * not sit on the page: it sits on the evidence IMAGE, which can be a white
 * report or a dark IDE capture no matter which theme the reader is in. No hue
 * survives both, so the box carries its own two-sided halo (see `rect`) and the
 * hue is left to say who, not to carry contrast.
 */
export const ACCEPTANCE_AUTHOR_COLORS = [
  'var(--ant-geekblue-10)',
  'var(--ant-magenta-10)',
  'var(--ant-gold-10)',
  'var(--ant-cyan-10)',
  'var(--ant-purple-10)',
  'var(--ant-lime-10)',
  'var(--ant-orange-10)',
  'var(--ant-blue-10)',
] as const;

/** The same hues at the step that is mid-tone on the dark end of the scale. */
export const ACCEPTANCE_AUTHOR_COLORS_DARK = [
  'var(--ant-geekblue-7)',
  'var(--ant-magenta-7)',
  'var(--ant-gold-7)',
  'var(--ant-cyan-7)',
  'var(--ant-purple-7)',
  'var(--ant-lime-7)',
  'var(--ant-orange-7)',
  'var(--ant-blue-7)',
] as const;

/** Deterministic, order-independent: the same author keeps their slot across rounds and reloads. */
const authorSlot = (authorUserId?: string | null): number => {
  if (!authorUserId) return 0;
  let hash = 0;
  for (let index = 0; index < authorUserId.length; index++) {
    hash = (hash * 31 + authorUserId.codePointAt(index)!) >>> 0;
  }
  return hash % ACCEPTANCE_AUTHOR_COLORS.length;
};

export const acceptanceAuthorColor = (
  authorUserId?: string | null,
  appearance: 'dark' | 'light' = 'light',
): string =>
  (appearance === 'dark' ? ACCEPTANCE_AUTHOR_COLORS_DARK : ACCEPTANCE_AUTHOR_COLORS)[
    authorSlot(authorUserId)
  ];

/** The same mapping, bound to the theme the reader is actually looking at. */
export const useAcceptanceAuthorColor = () => {
  const isDarkMode = useIsDark();
  return useCallback(
    (authorUserId?: string | null) =>
      acceptanceAuthorColor(authorUserId, isDarkMode ? 'dark' : 'light'),
    [isDarkMode],
  );
};
