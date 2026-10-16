import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compositeContrast, compositeHex, contrast } from './color';
import {
  CONTROL_FILL_ALPHA,
  EDITOR_TOKEN_ROLES,
  editorScopeCss,
  generateEngineToken,
  generateTheme,
  MIN_NON_TEXT_CONTRAST,
  MIN_TEXT_CONTRAST,
  type ThemeMode,
  toAntVarName,
} from './generate';
import {
  findNeutralColorName,
  findPrimaryColorName,
  NEUTRAL_COLOR_NAMES,
  type NeutralColorName,
  neutralSwatch,
  PRIMARY_COLOR_NAMES,
  type PrimaryColorName,
  primarySwatch,
} from './seeds';

const MODES: ThemeMode[] = ['light', 'dark'];
const ACCENTS: Array<PrimaryColorName | undefined> = [undefined, ...PRIMARY_COLOR_NAMES];
const BASES: Array<NeutralColorName | undefined> = [undefined, ...NEUTRAL_COLOR_NAMES];

const combinations = MODES.flatMap((mode) =>
  ACCENTS.flatMap((accent) =>
    BASES.map((base) => ({
      label: `${mode} / accent ${accent ?? 'monochrome'} / base ${base ?? 'gray'}`,
      theme: generateTheme({ accent, base, mode }),
    })),
  ),
);

/** A hex role at `opacity`, as a Tailwind `/NN` modifier paints it. */
const alpha = (hex: string, opacity: number) => {
  const channel = (index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${opacity})`;
};

/** Every pair below a floor, so a failure names all offenders at once. */
const below = (pairs: Array<[string, number]>, floor: number) =>
  pairs.filter(([, ratio]) => ratio < floor).map(([name, ratio]) => `${name} ${ratio.toFixed(2)}`);

describe('generateTheme contrast (every accent × base × mode)', () => {
  it.each(combinations)('$label: text roles reach 4.5:1 on their surfaces', ({ theme }) => {
    const { roles } = theme;
    const surfaces = ['card', 'background', 'popover', 'surface-secondary'] as const;
    const texts = ['foreground', 'muted-foreground', 'foreground-tertiary'] as const;
    const pairs: Array<[string, number]> = [];
    for (const surface of surfaces) {
      for (const text of texts) {
        pairs.push([`${text} on ${surface}`, contrast(roles[text], roles[surface])]);
        // Hover and selected washes sit under the same text.
        for (const wash of ['muted', 'selected'] as const) {
          pairs.push([
            `${text} on ${wash} over ${surface}`,
            compositeContrast(roles[wash], roles[surface], roles[text]),
          ]);
        }
      }
      pairs.push(
        [`primary-text on ${surface}`, contrast(roles['primary-text'], roles[surface])],
        [`link on ${surface}`, contrast(roles.link, roles[surface])],
        [`link-hover on ${surface}`, contrast(roles['link-hover'], roles[surface])],
      );
    }
    expect(below(pairs, MIN_TEXT_CONTRAST)).toEqual([]);
  });

  it.each(combinations)('$label: filled actions and status text reach 4.5:1', ({ theme }) => {
    const { roles } = theme;
    const pairs: Array<[string, number]> = [];
    for (const family of ['primary', 'success', 'warning', 'info', 'destructive']) {
      pairs.push(
        [`${family}-on-fill`, contrast(roles[`${family}-on-fill`], roles[family])],
        [
          `${family}-hover-foreground`,
          contrast(roles[`${family}-hover-foreground`], roles[`${family}-hover`]),
        ],
      );
      if (family === 'primary') continue;
      for (const backdrop of [
        'card',
        'background',
        'popover',
        `${family}-subtle`,
        `${family}-wash`,
        `${family}-wash-hover`,
      ]) {
        pairs.push([
          `${family}-text on ${backdrop}`,
          contrast(roles[`${family}-text`], roles[backdrop]),
        ]);
      }
    }
    pairs.push([
      'server-version-warning-text',
      contrast(roles['server-version-warning-text'], roles['server-version-warning-bg']),
    ]);
    expect(below(pairs, MIN_TEXT_CONTRAST)).toEqual([]);
  });

  it.each(combinations)('$label: control edges and the focus ring reach 3:1', ({ theme }) => {
    const { roles } = theme;
    const halfRing = alpha(roles.ring, 0.5);
    const pairs: Array<[string, number]> = [];
    for (const surface of ['card', 'background', 'popover', 'surface-secondary']) {
      pairs.push(
        [`input on ${surface}`, contrast(roles.input, roles[surface])],
        [`ring on ${surface}`, contrast(roles.ring, roles[surface])],
        // Primitives paint `ring-ring/50` around the focused control.
        [`ring/50 on ${surface}`, compositeContrast(halfRing, roles[surface])],
      );
      // Dark primitives fill the control with its own edge (`dark:bg-input/30`).
      if (theme.mode === 'dark')
        pairs.push([
          `input on input/30 over ${surface}`,
          contrast(
            roles.input,
            compositeHex(alpha(roles.input, CONTROL_FILL_ALPHA), roles[surface]),
          ),
        ]);
    }
    expect(below(pairs, MIN_NON_TEXT_CONTRAST)).toEqual([]);
  });
});

describe('generateTheme defaults', () => {
  it('keeps the default primary monochrome: near-black in light, near-white in dark', () => {
    const light = generateTheme({ mode: 'light' }).roles;
    const dark = generateTheme({ mode: 'dark' }).roles;
    expect(contrast(light.primary, '#000000')).toBeLessThan(1.5);
    expect(light['primary-foreground']).toBe('#ffffff');
    expect(contrast(dark.primary, '#ffffff')).toBeLessThan(1.3);
    expect(contrast(dark['primary-foreground'], '#000000')).toBeLessThan(1.2);
  });

  it('calibrates the default dark ladder to the measured Linear surfaces and text', () => {
    const dark = generateTheme({ mode: 'dark' }).roles;
    // Linear: #08090a canvas, #0f1011 panel, #18191a menus, #f7f8f8 / #8a8f98 text.
    expect(dark.background).toBe('#08090a');
    expect(dark.card).toBe('#0f1011');
    expect(dark.popover).toBe('#18191a');
    expect(dark.foreground).toBe('#f7f8f8');
    // Tertiary is lifted just enough to stay AA on a selected row inside a menu.
    expect(contrast(dark['foreground-tertiary'], '#8a8f98')).toBeLessThan(1.12);
  });

  it('is a pure function of its inputs', () => {
    expect(generateTheme({ accent: 'blue', base: 'sage', mode: 'dark' })).toEqual(
      generateTheme({ accent: 'blue', base: 'sage', mode: 'dark' }),
    );
    expect(generateTheme({ mode: 'light' })).toEqual(
      generateTheme({ accent: '', base: '', contrast: 30, mode: 'light' }),
    );
  });

  it('widens steps and text contrast when the internal contrast input rises', () => {
    const normal = generateTheme({ mode: 'light' }).roles;
    const high = generateTheme({ contrast: 100, mode: 'light' }).roles;
    expect(contrast(high['muted-foreground'], high.card)).toBeGreaterThan(
      contrast(normal['muted-foreground'], normal.card),
    );
    expect(contrast(high.background, high.card)).toBeGreaterThan(
      contrast(normal.background, normal.card),
    );
  });

  it('produces every palette step for every hue', () => {
    const { palette } = generateTheme({ mode: 'light' });
    expect(Object.keys(palette).filter((key) => key.startsWith('palette-'))).toHaveLength(130);
    expect(Object.keys(palette).filter((key) => key.startsWith('memory-category-'))).toHaveLength(
      40,
    );
  });
});

describe('seeds', () => {
  // The swatches the settings page has always shown; stored agent backgrounds
  // hold these hex values, so seeds must round-trip to them exactly.
  const LEGACY_PRIMARY_SWATCHES: Record<PrimaryColorName, string> = {
    blue: '#60b1ff',
    cyan: '#95f3d9',
    geekblue: '#0072f5',
    gold: '#ffb224',
    green: '#62c473',
    lime: '#c4f042',
    magenta: '#e34ba9',
    orange: '#ff9927',
    purple: '#bd54c6',
    red: '#f4416c',
    volcano: '#ec5e41',
    yellow: '#ffef5c',
  };
  const LEGACY_NEUTRAL_SWATCHES: Record<NeutralColorName, string> = {
    mauve: '#737177',
    olive: '#70736e',
    sage: '#6e7371',
    sand: '#73726a',
    slate: '#707276',
  };

  it('keeps every stored primary and neutral name with its legacy swatch', () => {
    for (const name of PRIMARY_COLOR_NAMES) {
      expect(primarySwatch(name)).toBe(LEGACY_PRIMARY_SWATCHES[name]);
      expect(findPrimaryColorName(LEGACY_PRIMARY_SWATCHES[name])).toBe(name);
    }
    for (const name of NEUTRAL_COLOR_NAMES) {
      expect(neutralSwatch(name)).toBe(LEGACY_NEUTRAL_SWATCHES[name]);
      expect(findNeutralColorName(LEGACY_NEUTRAL_SWATCHES[name])).toBe(name);
    }
    expect(PRIMARY_COLOR_NAMES).toHaveLength(Object.keys(LEGACY_PRIMARY_SWATCHES).length);
    expect(NEUTRAL_COLOR_NAMES).toHaveLength(Object.keys(LEGACY_NEUTRAL_SWATCHES).length);
  });
});

describe('@lobehub/editor alias table', () => {
  const editorRoot = path.resolve(import.meta.dirname, '../../../node_modules/@lobehub/editor/es');
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(file);
      return entry.name.endsWith('.js') ? [readFileSync(file, 'utf8')] : [];
    });
  const code = sources(editorRoot).join('\n');
  const usedTokens = new Set([...code.matchAll(/cssVar\.([A-Za-z\d]+)/g)].map((match) => match[1]));
  const prefix = `--${'ant'}-`;
  const literalVars = new Set(
    [...code.matchAll(new RegExp(`var\\((${prefix}[a-z\\d-]+)`, 'g'))].map((match) => match[1]),
  );

  it('maps exactly the cssVar tokens the installed editor reads', () => {
    expect([...usedTokens].sort()).toEqual(Object.keys(EDITOR_TOKEN_ROLES).sort());
    expect(usedTokens.size).toBe(39);
  });

  it('covers the editor’s literal engine variables too', () => {
    const aliased = new Set(Object.keys(EDITOR_TOKEN_ROLES).map(toAntVarName));
    expect([...literalVars].filter((name) => !aliased.has(name))).toEqual([]);
  });

  it('uses antd-style’s kebab-case names', () => {
    expect(toAntVarName('colorBgElevated')).toBe(`${prefix}color-bg-elevated`);
    expect(toAntVarName('borderRadiusLG')).toBe(`${prefix}border-radius-lg`);
    expect(toAntVarName('volcano10')).toBe(`${prefix}volcano-10`);
    expect(toAntVarName('yellow')).toBe(`${prefix}yellow`);
  });

  it('points every alias at a role the theme publishes', () => {
    const theme = generateTheme({ mode: 'light' });
    const published = new Set([
      ...Object.keys(theme.roles),
      ...Object.keys(theme.palette),
      // Geometry, type and motion roles from globals.css / ThemeRoles.
      'font-mono',
      'orvilo-motion-ease-out',
      'radius-button',
      'radius-input',
      'radius-overlay',
    ]);
    expect(Object.values(EDITOR_TOKEN_ROLES).filter((role) => !published.has(role))).toEqual([]);
  });

  it('scopes the aliases to the editor root only', () => {
    const css = editorScopeCss();
    expect(css.startsWith('.orvilo-editor-scope {')).toBe(true);
    expect(css).toContain(`${prefix}color-text: var(--foreground);`);
    expect(css).toContain(`${prefix}yellow: var(--palette-yellow-6);`);
    expect(css.match(/;\n/g)).toHaveLength(39);
  });

  it('derives an engine token for every editor token the host does not supply', () => {
    const token = generateEngineToken(generateTheme({ accent: 'purple', mode: 'dark' }));
    const missing = Object.keys(EDITOR_TOKEN_ROLES).filter(
      (name) => name !== 'fontFamilyCode' && !(name in token),
    );
    expect(missing).toEqual([]);
    expect(Object.values(token).every((value) => value !== undefined)).toBe(true);
  });
});
