import type { NeutralColorName, PrimaryColorName } from '@orvilo/types';

import { formatColor, type Oklch } from './color';

/**
 * OKLCH seeds for the local theme generator (docs/development/antd-retirement-plan.md, P2).
 *
 * Each stored setting name maps to one seed, not to a colour scale; `generate.ts`
 * derives every role from these seeds plus the mode and contrast inputs.
 */

export type { NeutralColorName, PrimaryColorName } from '@orvilo/types';

/** The default base when no neutral colour is stored. */
export type BaseColorName = NeutralColorName | 'gray';

/**
 * Accent seeds. Each is the exact OKLCH form of the swatch the settings page
 * has always shown for that name (round-trips to the same hex), so a saved
 * `primaryColor` and saved agent background swatches keep their identity.
 */
export const PRIMARY_SEEDS: Record<PrimaryColorName, Oklch> = {
  blue: { c: 0.1387, h: 249.4, l: 0.7422 },
  cyan: { c: 0.0973, h: 174.41, l: 0.8983 },
  geekblue: { c: 0.2146, h: 258.04, l: 0.5787 },
  gold: { c: 0.1639, h: 75.84, l: 0.8169 },
  green: { c: 0.1481, h: 147.7, l: 0.7408 },
  lime: { c: 0.1971, h: 123.01, l: 0.8938 },
  magenta: { c: 0.2092, h: 346.41, l: 0.651 },
  orange: { c: 0.1669, h: 61.95, l: 0.773 },
  purple: { c: 0.1933, h: 324.43, l: 0.6211 },
  red: { c: 0.2143, h: 11.83, l: 0.6497 },
  volcano: { c: 0.1816, h: 33.32, l: 0.6603 },
  yellow: { c: 0.1638, h: 103.09, l: 0.9388 },
};

/** Swatch order on the settings page. */
export const PRIMARY_COLOR_NAMES = [
  'red',
  'orange',
  'gold',
  'yellow',
  'lime',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple',
  'magenta',
  'volcano',
] as const satisfies readonly PrimaryColorName[];

/**
 * Base seeds: hue and the chroma used at full strength (text and borders);
 * surfaces carry a quarter of it. `l` is only the swatch lightness.
 *
 * `gray` is calibrated to Linear's measured dark product ladder, whose greys
 * carry a faint cool tint (#0f1011, #23252a, #8a8f98 sit at hue ≈ 248–262,
 * chroma ≈ 0.003–0.015). The named neutrals are the exact OKLCH form of their
 * existing settings swatches.
 */
export const NEUTRAL_SEEDS: Record<BaseColorName, Oklch> = {
  gray: { c: 0.0125, h: 262, l: 0.5517 },
  mauve: { c: 0.0095, h: 301.22, l: 0.5524 },
  olive: { c: 0.0084, h: 132.47, l: 0.5513 },
  sage: { c: 0.0068, h: 170.27, l: 0.5506 },
  sand: { c: 0.0122, h: 100.99, l: 0.5505 },
  slate: { c: 0.0066, h: 264.51, l: 0.5517 },
};

/** Swatch order on the settings page. */
export const NEUTRAL_COLOR_NAMES = [
  'mauve',
  'olive',
  'sage',
  'sand',
  'slate',
] as const satisfies readonly NeutralColorName[];

export type StatusName = 'error' | 'info' | 'success' | 'warning';

/**
 * Fixed-hue status seeds, calibrated to Linear's status colours
 * (success #27a644 measured; error #eb5757, warning #f2c94c, info #4ea7fc).
 * Wash, border and text roles are derived per mode and contrast.
 */
export const STATUS_SEEDS: Record<StatusName, Oklch> = {
  error: { c: 0.1835, h: 23.68, l: 0.6534 },
  info: { c: 0.151, h: 249.88, l: 0.7121 },
  success: { c: 0.1749, h: 146.7, l: 0.6371 },
  warning: { c: 0.1463, h: 90.49, l: 0.8496 },
};

export const PALETTE_HUES = [
  'red',
  'volcano',
  'orange',
  'gold',
  'yellow',
  'lime',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple',
  'magenta',
  'pink',
] as const;

export type PaletteHue = (typeof PALETTE_HUES)[number];

/**
 * Identity-colour hues (authors, charts, categories, editor highlights). Step 6
 * of each generated ten-step ramp sits at this seed. These are raw palette
 * primitives, not semantic roles.
 */
export const PALETTE_SEEDS: Record<PaletteHue, Oklch> = {
  blue: { c: 0.16, h: 250, l: 0.66 },
  cyan: { c: 0.12, h: 200, l: 0.72 },
  geekblue: { c: 0.2, h: 262, l: 0.55 },
  gold: { c: 0.16, h: 78, l: 0.78 },
  green: { c: 0.17, h: 147, l: 0.66 },
  lime: { c: 0.19, h: 125, l: 0.82 },
  magenta: { c: 0.21, h: 348, l: 0.62 },
  orange: { c: 0.17, h: 58, l: 0.74 },
  pink: { c: 0.18, h: 0, l: 0.68 },
  purple: { c: 0.2, h: 310, l: 0.56 },
  red: { c: 0.21, h: 25, l: 0.62 },
  volcano: { c: 0.19, h: 38, l: 0.66 },
  yellow: { c: 0.17, h: 100, l: 0.9 },
};

/** Settings swatch colour (hex) for a stored accent name. */
export const primarySwatch = (name: PrimaryColorName) => formatColor(PRIMARY_SEEDS[name]);

/** Settings swatch colour (hex) for a stored base name. */
export const neutralSwatch = (name: NeutralColorName) => formatColor(NEUTRAL_SEEDS[name]);

/** Reverse lookup for swatch pickers that report the picked colour. */
export const findPrimaryColorName = (swatch: string): PrimaryColorName | undefined =>
  PRIMARY_COLOR_NAMES.find((name) => primarySwatch(name) === swatch.toLowerCase());

export const findNeutralColorName = (swatch: string): NeutralColorName | undefined =>
  NEUTRAL_COLOR_NAMES.find((name) => neutralSwatch(name) === swatch.toLowerCase());
