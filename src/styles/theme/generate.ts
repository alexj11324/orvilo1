import {
  compositeHex,
  contrast as contrastRatio,
  formatColor,
  mixOklab,
  type Oklch,
  toGamut,
} from './color';
import {
  type BaseColorName,
  NEUTRAL_SEEDS,
  PALETTE_HUES,
  PALETTE_SEEDS,
  type PaletteHue,
  PRIMARY_SEEDS,
  type PrimaryColorName,
  STATUS_SEEDS,
  type StatusName,
} from './seeds';

/**
 * Local theme generator (docs/development/antd-retirement-plan.md, P2).
 *
 * A pure function of four inputs, following the method Linear published for
 * its 2024 theme system (base, accent and contrast in a perceptual colour
 * space), implemented in OKLCH:
 *
 * - `mode`: light or dark; sets the direction of every adjustment.
 * - `base`: the stored neutral colour name (default `gray`); surfaces, borders, text.
 * - `accent`: the stored primary colour name; unset keeps the monochrome primary.
 * - `contrast`: internal, fixed at {@link DEFAULT_CONTRAST}; scales surface
 *   steps and text targets. Not exposed in settings.
 *
 * Every text role is solved for a contrast target rather than picked from a
 * scale, so all accent × base × mode combinations meet WCAG by construction
 * (`generate.test.ts` checks each one).
 */

export type ThemeMode = 'dark' | 'light';

export interface ThemeInput {
  accent?: PrimaryColorName | '' | null;
  base?: BaseColorName | '' | null;
  /** 0–100. Internal only; defaults to {@link DEFAULT_CONTRAST}. */
  contrast?: number;
  mode: ThemeMode;
}

/** Linear's default contrast setting; the generator's coefficients are calibrated at it. */
export const DEFAULT_CONTRAST = 30;

/**
 * Surface lightness ladders, calibrated to Linear's measured dark product
 * surfaces (#08090a canvas, #0f1011 panel, #18191a menus) and mirrored for
 * light, where the panel is white and the canvas one step below it.
 */
const SURFACES = {
  dark: {
    background: 0.139,
    border: 0.272,
    card: 0.172,
    divider: 0.24,
    popover: 0.213,
    secondary: 0.155,
  },
  light: {
    background: 0.975,
    border: 0.912,
    card: 1,
    divider: 0.938,
    popover: 1,
    secondary: 0.987,
  },
} as const;

/**
 * Text contrast targets against the panel (`card`), measured from Linear's dark
 * text ladder on #0f1011: #f7f8f8 17.9, #d0d6e0 13.0, #8a8f98 5.9, #62666d 3.3.
 * Light mode solves the same ratios against its own panel.
 */
const TEXT_TARGETS = { foreground: 17.9, quaternary: 3.3, secondary: 13, tertiary: 5.9 } as const;

/** WCAG AA floors the generator guarantees (and tests). */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_NON_TEXT_CONTRAST = 3;
// Hex rounding can shave a few hundredths off a solved ratio; aim slightly above.
const MARGIN = 0.08;
/** Dark control primitives fill with their own edge colour at this alpha (`dark:bg-input/30`). */
export const CONTROL_FILL_ALPHA = 0.3;

/** Translucent neutral wash strengths: fill, fill-secondary, fill-tertiary, fill-quaternary. */
const FILL_ALPHA = {
  dark: [0.14, 0.09, 0.055, 0.025],
  light: [0.1, 0.06, 0.035, 0.018],
} as const;

const PALETTE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const scaleTarget = (target: number, k: number) => Math.min(21, 1 + (target - 1) * k);

const towards = (value: number, goal: number, amount: number) =>
  value + Math.sign(goal - value) * Math.min(Math.abs(goal - value), amount);

/** Lightness that reaches `target` contrast against `against`, moving away from it. */
const solveLightness = (
  color: Oklch,
  against: string,
  target: number,
  direction: 'darker' | 'lighter',
): Oklch => {
  let low = direction === 'darker' ? 0 : color.l;
  let high = direction === 'darker' ? color.l : 1;
  // Fall back to the extreme when even it cannot reach the target.
  const extreme = { ...color, l: direction === 'darker' ? 0 : 1 };
  if (contrastRatio(formatColor(extreme), against) < target) return toGamut(extreme);
  for (let i = 0; i < 30; i += 1) {
    const mid = (low + high) / 2;
    const passes = contrastRatio(formatColor({ ...color, l: mid }), against) >= target;
    // Keep the passing side and move towards the colour closest to the start.
    if (direction === 'darker') {
      if (passes) low = mid;
      else high = mid;
    } else if (passes) high = mid;
    else low = mid;
  }
  return toGamut({ ...color, l: direction === 'darker' ? low : high });
};

/** Move `color` away from its backdrops until it meets `target` on every one. */
const ensureContrast = (
  color: Oklch,
  backdrops: string[],
  target: number,
  direction: 'darker' | 'lighter',
): Oklch => {
  let result = color;
  for (const backdrop of backdrops) {
    if (contrastRatio(formatColor(result), backdrop) < target) {
      result = solveLightness(result, backdrop, target, direction);
    }
  }
  return result;
};

const withAlpha = (color: Oklch, alpha: number): Oklch => ({ ...color, alpha });

const shadowColor = (alpha: number) => `rgba(0, 0, 0, ${alpha})`;

export type RoleTable = Record<string, string>;

export interface GeneratedTheme {
  mode: ThemeMode;
  /** Raw identity ramps (`palette-{hue}-{1..10}`) and memory category colours. */
  palette: RoleTable;
  /** Semantic roles, keyed without the leading `--`. globals.css bootstraps these. */
  roles: RoleTable;
}

/** Pick white or the near-black ink, whichever reads better on `fill`. */
const readableOn = (fill: string, ink: string) =>
  contrastRatio('#ffffff', fill) >= contrastRatio(ink, fill) ? '#ffffff' : ink;

/**
 * A filled action: keep the seed when its best foreground already reads, else
 * nudge the fill away from that foreground until it does.
 */
const readableFill = (seed: Oklch, ink: string) => {
  let fill = toGamut(seed);
  let foreground = readableOn(formatColor(fill), ink);
  if (contrastRatio(foreground, formatColor(fill)) < MIN_TEXT_CONTRAST + MARGIN) {
    fill = solveLightness(
      fill,
      foreground,
      MIN_TEXT_CONTRAST + MARGIN,
      foreground === '#ffffff' ? 'darker' : 'lighter',
    );
    foreground = readableOn(formatColor(fill), ink);
  }
  return { fill, foreground };
};

const generatePaletteRamp = (seed: Oklch, mode: ThemeMode) => {
  const ramp: Oklch[] = [];
  for (const step of PALETTE_STEPS) {
    if (mode === 'light') {
      // 1 is the faintest tint, 6 the seed, 10 the deepest shade.
      const t = step <= 6 ? (step - 1) / 5 : (step - 6) / 4;
      const l = step <= 6 ? 0.975 + (seed.l - 0.975) * t : seed.l - (seed.l - 0.3) * t * 0.85;
      const c = step <= 6 ? seed.c * (0.12 + 0.88 * t) : seed.c * (1 - 0.35 * t);
      ramp.push(toGamut({ c, h: seed.h, l }));
    } else {
      // Dark ramps run the other way: 1 is the deepest, 10 the lightest.
      const t = step <= 6 ? (step - 1) / 5 : (step - 6) / 4;
      const peak = Math.min(seed.l, 0.82);
      const l = step <= 6 ? 0.24 + (peak - 0.24) * t : peak + (0.94 - peak) * t;
      const c = step <= 6 ? seed.c * (0.35 + 0.65 * t) : seed.c * (1 - 0.6 * t);
      ramp.push(toGamut({ c, h: seed.h, l }));
    }
  }
  return ramp;
};

const MEMORY_CATEGORY_HUES: PaletteHue[] = [
  'volcano',
  'orange',
  'gold',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple',
  'magenta',
  'pink',
];

export const generateTheme = (input: ThemeInput): GeneratedTheme => {
  const { mode } = input;
  const dark = mode === 'dark';
  const k = 1 + ((input.contrast ?? DEFAULT_CONTRAST) - DEFAULT_CONTRAST) / 100;
  const base = NEUTRAL_SEEDS[input.base || 'gray'] ?? NEUTRAL_SEEDS.gray;
  const accentSeed = input.accent ? PRIMARY_SEEDS[input.accent] : undefined;
  const textDirection = dark ? 'lighter' : 'darker';
  const ladder = SURFACES[mode];

  // Surfaces: distance from the panel grows with contrast.
  const surface = (l: number, chroma = 0.25) =>
    toGamut({ c: base.c * chroma, h: base.h, l: ladder.card + (l - ladder.card) * k });
  const card = surface(ladder.card);
  const cardHex = formatColor(card);
  const background = formatColor(surface(ladder.background));
  const popover = formatColor(surface(ladder.popover));
  const surfaceSecondary = formatColor(surface(ladder.secondary));
  const surfaces = [cardHex, background, popover, surfaceSecondary];

  // Washes: the neutral ink at low alpha so they read on every surface.
  const ink: Oklch = { c: base.c * 0.6, h: base.h, l: dark ? 0.98 : 0.18 };
  const [fillAlpha, fillSecondaryAlpha, fillTertiaryAlpha, fillQuaternaryAlpha] = FILL_ALPHA[
    mode
  ].map((alpha) => Math.min(1, alpha * k));
  const fill = formatColor(withAlpha(ink, fillAlpha));
  const fillSecondary = formatColor(withAlpha(ink, fillSecondaryAlpha));
  const fillTertiary = formatColor(withAlpha(ink, fillTertiaryAlpha));
  const fillQuaternary = formatColor(withAlpha(ink, fillQuaternaryAlpha));
  const split = formatColor(withAlpha(ink, dark ? 0.1 : 0.06));

  // Hover and selected washes paint under the same text; the selected one is
  // the stronger, so it is the backdrop text must also clear.
  const textBackdrops = [
    ...surfaces,
    ...surfaces.map((backdrop) => compositeHex(fillSecondary, backdrop)),
  ];

  // Text: solved for Linear's measured ratios, never below AA on any surface.
  const text = (target: number, chroma: number, floor?: number) => {
    const solved = solveLightness(
      { c: base.c * chroma, h: base.h, l: ladder.card },
      cardHex,
      scaleTarget(target, k),
      textDirection,
    );
    return formatColor(
      floor ? ensureContrast(solved, textBackdrops, floor, textDirection) : solved,
    );
  };
  const foreground = text(TEXT_TARGETS.foreground, 0.1, MIN_TEXT_CONTRAST + MARGIN);
  const secondary = text(TEXT_TARGETS.secondary, 1, MIN_TEXT_CONTRAST + MARGIN);
  const tertiary = text(TEXT_TARGETS.tertiary, 1, MIN_TEXT_CONTRAST + MARGIN);
  // Disabled content: exempt from text contrast (WCAG 1.4.3), kept recognisable.
  const quaternary = text(TEXT_TARGETS.quaternary, 1);

  // Borders: hairlines are decorative; the control edge (`input`) must reach 3:1.
  const border = formatColor(surface(ladder.border, 0.5));
  const divider = formatColor(surface(ladder.divider, 0.5));
  // Dark controls paint their own edge colour as the fill (`dark:bg-input/30`),
  // so the edge must also clear that fill on every surface. The fill follows the
  // edge, so re-solve until both backdrops pass.
  const controlBackdrops = (edge: Oklch) =>
    dark
      ? [
          ...surfaces,
          ...surfaces.map((backdrop) =>
            compositeHex(formatColor(withAlpha(edge, CONTROL_FILL_ALPHA)), backdrop),
          ),
        ]
      : surfaces;
  const solveControlEdge = (seed: Oklch) => {
    let edge = seed;
    for (let i = 0; i < 20; i += 1) {
      const next = ensureContrast(
        edge,
        controlBackdrops(edge),
        MIN_NON_TEXT_CONTRAST + MARGIN,
        textDirection,
      );
      if (next.l === edge.l) break;
      edge = next;
    }
    return edge;
  };
  const controlEdge = formatColor(
    solveControlEdge({ c: base.c * 0.8, h: base.h, l: ladder.border }),
  );

  // Darkest neutral used as the dark foreground on bright fills.
  const fillInk = formatColor({ c: base.c * 0.3, h: base.h, l: 0.16 });

  // Hover/active move a fill towards / away from the panel by fixed steps.
  const hoverOf = (fill: Oklch) => toGamut({ ...fill, l: towards(fill.l, card.l, 0.07 * k) });
  const activeOf = (fill: Oklch) =>
    toGamut({
      ...fill,
      l: Math.min(1, Math.max(0, fill.l - Math.sign(card.l - fill.l) * 0.05 * k)),
    });

  // Washes and edges tinted by a fill, mixed opaquely into the panel.
  const tint = (fill: Oklch, amount: number) => formatColor(mixOklab(card, fill, amount * k));

  /** Text of a hue that stays AA on the panel, page, menus and its own washes. */
  const hueTextColor = (fill: Oklch, washes: string[]) =>
    ensureContrast(
      { ...fill, c: Math.min(fill.c, 0.2) },
      [...surfaces, ...washes],
      MIN_TEXT_CONTRAST + MARGIN,
      textDirection,
    );
  const hueText = (fill: Oklch, washes: string[]) => formatColor(hueTextColor(fill, washes));

  const roles: RoleTable = {};

  // A coloured family: fill, its foreground, hover/active, washes, borders and text.
  const family = (name: string, seed: Oklch, tintScale = 1) => {
    const { fill, foreground: onFill } = readableFill(seed, fillInk);
    const hover = readableFill(hoverOf(fill), fillInk);
    const active = readableFill(activeOf(fill), fillInk);
    const subtle = tint(fill, 0.1 * tintScale);
    const wash = tint(fill, 0.14 * tintScale);
    const washHover = tint(fill, 0.22 * tintScale);
    const textColor = hueText(fill, [subtle, wash, washHover]);
    Object.assign(roles, {
      [name]: formatColor(fill),
      [`${name}-active`]: formatColor(active.fill),
      [`${name}-border`]: tint(fill, 0.35 * tintScale),
      [`${name}-border-hover`]: tint(fill, 0.5 * tintScale),
      [`${name}-hover`]: formatColor(hover.fill),
      [`${name}-hover-foreground`]: hover.foreground,
      [`${name}-on-fill`]: onFill,
      [`${name}-subtle`]: subtle,
      [`${name}-text`]: textColor,
      [`${name}-wash`]: wash,
      [`${name}-wash-hover`]: washHover,
    });
    return { fill, textColor, washHover };
  };

  // Primary: monochrome (near-black in light, near-white in dark) unless an
  // accent is stored, in which case the accent seed drives the same family.
  const monochrome: Oklch = { c: base.c * 0.2, h: base.h, l: dark ? 0.93 : 0.25 };
  // A near-black/near-white fill is far from the panel, so its washes use half
  // the tint to land at the same visual weight as an accent's.
  const primary = family('primary', accentSeed ?? monochrome, accentSeed ? 1 : 0.5);
  const primaryText = accentSeed ? primary.textColor : foreground;
  roles['primary-text'] = primaryText;
  roles['primary-foreground'] = roles['primary-on-fill'];

  // Links: AA text in the accent hue, stepping further from the panel on hover/press.
  const link = accentSeed ? hueTextColor(accentSeed, []) : undefined;
  const linkStep = (shift: number) =>
    link
      ? formatColor(
          toGamut({ ...link, l: Math.min(1, Math.max(0, link.l + (dark ? shift : -shift) * k)) }),
        )
      : shift === 0
        ? foreground
        : secondary;

  const statusFamilies: Array<[string, StatusName]> = [
    ['success', 'success'],
    ['warning', 'warning'],
    ['info', 'info'],
    ['destructive', 'error'],
  ];
  const status = Object.fromEntries(
    statusFamilies.map(([name, seed]) => [name, family(name, STATUS_SEEDS[seed])]),
  );
  for (const [name] of statusFamilies) roles[`${name}-foreground`] = roles[`${name}-text`];
  roles['info-hover-wash'] = roles['info-wash-hover'];

  // Raw palette ramps; step 6 is the seed.
  const palette: RoleTable = {};
  const ramps = Object.fromEntries(
    PALETTE_HUES.map((hue) => [hue, generatePaletteRamp(PALETTE_SEEDS[hue], mode)]),
  ) as Record<PaletteHue, Oklch[]>;
  for (const hue of PALETTE_HUES) {
    ramps[hue].forEach((color, index) => {
      palette[`palette-${hue}-${index + 1}`] = formatColor(color);
    });
  }

  // Memory category chips: a faint tinted surface with AA text in the same hue.
  MEMORY_CATEGORY_HUES.forEach((hue, index) => {
    const seed = PALETTE_SEEDS[hue];
    const chip = formatColor(
      toGamut({ c: dark ? 0.035 : 0.03, h: seed.h, l: dark ? 0.235 : 0.955 }),
    );
    const chipText = (target: number) =>
      formatColor(
        solveLightness(
          { c: Math.min(seed.c, 0.14), h: seed.h, l: dark ? 0.5 : 0.7 },
          chip,
          target,
          textDirection,
        ),
      );
    palette[`memory-category-${index}-background`] = chip;
    palette[`memory-category-${index}-background-text`] = chipText(MIN_TEXT_CONTRAST + MARGIN);
    palette[`memory-category-${index}-text`] = chipText(7);
    palette[`memory-category-${index}-shadow`] = formatColor(
      withAlpha({ c: seed.c * 0.5, h: seed.h, l: 0.3 }, dark ? 0.5 : 0.2),
    );
  });

  const yellowWash = tint(ramps.yellow[5], 0.18);

  Object.assign(roles, {
    'accent': fillTertiary,
    'accent-foreground': foreground,
    background,
    border,
    'card': cardHex,
    'card-foreground': foreground,
    divider,
    'fill': fill,
    'fill-content': fillSecondary,
    'fill-quaternary': fillQuaternary,
    foreground,
    'foreground-description': tertiary,
    'foreground-icon': tertiary,
    'foreground-placeholder': tertiary,
    'foreground-quaternary': quaternary,
    'foreground-tertiary': tertiary,
    'highlight-gold': palette['palette-gold-4'],
    'highlight-primary': primary.washHover,
    'input': controlEdge,
    'invert': foreground,
    'invert-foreground': cardHex,
    'link': linkStep(0),
    'link-active': linkStep(0.1),
    'link-hover': linkStep(0.05),
    'loading-ring-fill': fill,
    'muted': fillTertiary,
    'muted-foreground': secondary,
    'overlay-mask': dark ? shadowColor(0.6) : shadowColor(0.45),
    'overlay-mask-foreground': '#ffffff',
    popover,
    'popover-foreground': foreground,
    // Focus stays on the ink: a 50% ring of it clears 3:1 on every surface,
    // which an accent ring cannot promise for every stored accent.
    'ring': foreground,
    'scrollbar-fill': fill,
    'secondary': fillTertiary,
    'secondary-foreground': foreground,
    'selected': fillSecondary,
    'server-version-warning-bg': yellowWash,
    'server-version-warning-text': hueText(status.warning.fill, [yellowWash]),
    'shadow-dialog': dark ? 'none' : `0 20px 20px -8px ${shadowColor(0.24)}`,
    'shadow-elevated': `0 20px 20px -8px ${shadowColor(dark ? 0.6 : 0.24)}`,
    'shadow-popover': `0 8px 16px -4px ${shadowColor(dark ? 0.5 : 0.2)}`,
    'shadow-raised': dark
      ? `0 3px 1px -1px ${shadowColor(0.2)}`
      : '0 3px 1px -1px rgba(26, 26, 26, 0.06)',
    'sidebar': background,
    'sidebar-accent': fillTertiary,
    'sidebar-accent-foreground': foreground,
    'sidebar-border': divider,
    'sidebar-foreground': foreground,
    'sidebar-group': secondary,
    'sidebar-muted': secondary,
    'sidebar-primary': roles.primary,
    'sidebar-primary-foreground': roles['primary-foreground'],
    'sidebar-ring': foreground,
    'split-divider': split,
    'surface-disabled': fillTertiary,
    'surface-secondary': surfaceSecondary,
    'topic-running-ring': dark
      ? roles['warning-border']
      : formatColor(withAlpha(status.warning.fill, 0.45)),
  });

  return { mode, palette, roles: sortKeys(roles) };
};

const sortKeys = (table: RoleTable): RoleTable =>
  Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));

/** `--name: value;` lines for a role table. */
export const toDeclarations = (table: RoleTable, indent = '  ') =>
  Object.entries(table)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join('\n');

// --- @lobehub/editor compatibility -----------------------------------------

/**
 * Every antd-style `cssVar.*` token that @lobehub/editor 4.29.2 reads, mapped
 * to the local role that replaces it. `generate.test.ts` re-extracts the list
 * from node_modules and fails when an editor upgrade starts using a new one.
 */
export const EDITOR_TOKEN_ROLES = {
  borderRadius: 'radius-button',
  borderRadiusLG: 'radius-overlay',
  borderRadiusSM: 'radius-input',
  boxShadowSecondary: 'shadow-popover',
  boxShadowTertiary: 'shadow-raised',
  colorBgContainer: 'card',
  colorBgElevated: 'popover',
  colorBorder: 'border',
  colorBorderSecondary: 'divider',
  colorError: 'destructive',
  colorErrorBg: 'destructive-wash',
  colorErrorBorder: 'destructive-border',
  colorFill: 'fill',
  colorFillQuaternary: 'fill-quaternary',
  colorFillSecondary: 'selected',
  colorFillTertiary: 'muted',
  colorInfo: 'info',
  colorInfoBg: 'info-wash',
  colorInfoBgHover: 'info-hover-wash',
  colorPrimary: 'primary',
  colorPrimaryActive: 'primary-active',
  colorPrimaryBg: 'primary-wash',
  colorPrimaryBorder: 'primary-border',
  colorPrimaryHover: 'primary-hover',
  colorSplit: 'split-divider',
  colorSuccess: 'success',
  colorSuccessBg: 'success-wash',
  colorText: 'foreground',
  colorTextDescription: 'foreground-description',
  // The editor draws its checklist tick with it on a primary fill.
  colorTextLightSolid: 'primary-foreground',
  colorTextQuaternary: 'foreground-quaternary',
  colorTextSecondary: 'muted-foreground',
  colorWarning: 'warning',
  fontFamilyCode: 'font-mono',
  geekblue10: 'palette-geekblue-10',
  motionEaseOut: 'orvilo-motion-ease-out',
  purple10: 'palette-purple-10',
  volcano10: 'palette-volcano-10',
  yellow: 'palette-yellow-6',
} as const;

export type EditorToken = keyof typeof EDITOR_TOKEN_ROLES;

/** antd-style's camelCase → kebab-case rule for `cssVar` names (`volcano10` → `volcano-10`). */
export const toAntVarName = (token: string) =>
  `--${'ant'}-${token
    .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
    .replaceAll(/([a-z])(\d)/g, '$1-$2')
    .replaceAll(/(\d)([A-Z])/g, '$1-$2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()}`;

export const EDITOR_SCOPE_CLASS = 'orvilo-editor-scope';

/**
 * Compatibility aliases for @lobehub/editor, scoped to its root
 * (`.orvilo-editor-scope`). Values reference local roles, so the editor follows
 * the document theme without any global `--ant-*` variable.
 */
export const editorScopeCss = (selector = `.${EDITOR_SCOPE_CLASS}`) =>
  `${selector} {\n${Object.entries(EDITOR_TOKEN_ROLES)
    .map(([token, role]) => `  ${toAntVarName(token)}: var(--${role});`)
    .join('\n')}\n}`;

const MOTION_EASE_OUT = 'cubic-bezier(0.215, 0.61, 0.355, 1)';

/**
 * antd / lobehub `theme.token` values derived from a generated theme, for the
 * remaining engine-rendered components and the local editor provider (P5).
 * Covers every editor token (font family aside, which the host supplies) plus
 * the map tokens ThemeRoles used to read from the engine.
 */
export const generateEngineToken = (theme: GeneratedTheme) => {
  const { palette, roles } = theme;
  return {
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    boxShadowSecondary: roles['shadow-popover'],
    boxShadowTertiary: roles['shadow-raised'],
    colorBgContainer: roles.card,
    colorBgElevated: roles.popover,
    colorBorder: roles.border,
    colorBorderSecondary: roles.divider,
    colorError: roles.destructive,
    colorErrorBg: roles['destructive-wash'],
    colorErrorBorder: roles['destructive-border'],
    colorFill: roles.fill,
    colorFillQuaternary: roles['fill-quaternary'],
    colorFillSecondary: roles.selected,
    colorFillTertiary: roles.muted,
    colorInfo: roles.info,
    colorInfoBg: roles['info-wash'],
    colorInfoBgHover: roles['info-hover-wash'],
    colorPrimary: roles.primary,
    colorPrimaryActive: roles['primary-active'],
    colorPrimaryBg: roles['primary-wash'],
    colorPrimaryBorder: roles['primary-border'],
    colorPrimaryHover: roles['primary-hover'],
    colorSplit: roles['split-divider'],
    colorSuccess: roles.success,
    colorSuccessBg: roles['success-wash'],
    colorText: roles.foreground,
    colorTextDescription: roles['foreground-description'],
    colorTextLightSolid: roles['primary-foreground'],
    colorTextQuaternary: roles['foreground-quaternary'],
    colorTextSecondary: roles['muted-foreground'],
    colorWarning: roles.warning,
    geekblue10: palette['palette-geekblue-10'],
    motionEaseOut: MOTION_EASE_OUT,
    purple10: palette['palette-purple-10'],
    volcano10: palette['palette-volcano-10'],
    yellow: palette['palette-yellow-6'],
    boxShadow: roles['shadow-elevated'],
    colorBgContainerDisabled: roles['surface-disabled'],
    colorBgLayout: roles.background,
    colorBgMask: roles['overlay-mask'],
    colorErrorBgHover: roles['destructive-wash-hover'],
    colorErrorBorderHover: roles['destructive-border-hover'],
    colorErrorHover: roles['destructive-hover'],
    colorErrorText: roles['destructive-text'],
    colorFillContent: roles['fill-content'],
    colorIcon: roles['foreground-icon'],
    colorInfoBorder: roles['info-border'],
    colorInfoBorderHover: roles['info-border-hover'],
    colorInfoHover: roles['info-hover'],
    colorInfoText: roles['info-text'],
    colorLink: roles.link,
    colorLinkActive: roles['link-active'],
    colorLinkHover: roles['link-hover'],
    colorPrimaryBgHover: roles['primary-wash-hover'],
    colorPrimaryBorderHover: roles['primary-border-hover'],
    colorPrimaryText: roles['primary-text'],
    colorSuccessBgHover: roles['success-wash-hover'],
    colorSuccessBorder: roles['success-border'],
    colorSuccessBorderHover: roles['success-border-hover'],
    colorSuccessHover: roles['success-hover'],
    colorSuccessText: roles['success-text'],
    colorTextPlaceholder: roles['foreground-placeholder'],
    colorTextTertiary: roles['foreground-tertiary'],
    colorWarningBg: roles['warning-wash'],
    colorWarningBgHover: roles['warning-wash-hover'],
    colorWarningBorder: roles['warning-border'],
    colorWarningText: roles['warning-text'],
  };
};
