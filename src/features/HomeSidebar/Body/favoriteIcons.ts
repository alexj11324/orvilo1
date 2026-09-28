import type { LucideIcon } from 'lucide-react';
import { Pin, PinOff, Star, StarOff } from 'lucide-react';

/**
 * The favorite mark — one glyph set per surface convention, so every
 * "favorite" affordance draws from the same pair instead of re-picking a
 * lucide icon per call site.
 *
 * - `pin`: the sidebar/menu convention — a pinned work entity sorts under the
 *   sidebar's Favorites section, so menus and sidebar toggles draw the pin.
 * - `star`: Linear's page-header favourite — the task detail header and any
 *   favorite that marks *state* rather than sidebar placement. The agent
 *   conversation header's topic favourite is a different store (chat topics,
 *   not work-attention favorites) but the same user-facing concept, so it
 *   shares `FAVORITE_MARK.star`; it shows state by fill rather than swapping
 *   to the off-glyph.
 */
export const FAVORITE_MARK = { pin: Pin, star: Star } as const satisfies Record<string, LucideIcon>;

/** The "undo favorite" glyph paired with each mark — the icon a control swaps
 *  to while the entity is favorited. */
export const FAVORITE_MARK_OFF = { pin: PinOff, star: StarOff } as const satisfies Record<
  keyof typeof FAVORITE_MARK,
  LucideIcon
>;

export type FavoriteIconSet = keyof typeof FAVORITE_MARK;
