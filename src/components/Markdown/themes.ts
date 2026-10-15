import { bundledThemesInfo } from 'shiki/themes';

import { codeBlockThemes } from '@/components/reui/code-block/code-block-highlight';
import type { CodeBlockThemes } from '@/components/ui/code-block';

/**
 * Stored value meaning "follow the app theme". The id predates this module and
 * stays unchanged so persisted user settings keep resolving.
 */
export const DEFAULT_THEME_ID = 'lobe-theme';

export interface ThemeOption {
  displayName: string;
  id: string;
}

export const highlighterThemes: ThemeOption[] = [
  { displayName: 'Default', id: DEFAULT_THEME_ID },
  ...bundledThemesInfo.map(({ displayName, id }) => ({ displayName, id })),
];

/**
 * Maps a stored highlighter theme to code-block themes. The code block only
 * bundles its default pair, so a named shiki theme is registered lazily here
 * the first time it is requested.
 */
export const resolveHighlighterThemes = (theme?: string): CodeBlockThemes | undefined => {
  if (!theme || theme === DEFAULT_THEME_ID) return undefined;
  if (!(theme in codeBlockThemes)) {
    const info = bundledThemesInfo.find((item) => item.id === theme);
    if (!info) return undefined;
    codeBlockThemes[theme] = info.import;
  }
  return { dark: theme, light: theme };
};

interface MermaidPalette {
  accent?: string;
  bg: string;
  fg: string;
  line?: string;
  muted?: string;
}

/** Palettes kept id-compatible with the previously stored `mermaidTheme` values. */
const mermaidPalettes: Record<string, MermaidPalette> = {
  'catppuccin-latte': {
    accent: '#8839ef',
    bg: '#eff1f5',
    fg: '#4c4f69',
    line: '#9ca0b0',
    muted: '#9ca0b0',
  },
  'catppuccin-mocha': {
    accent: '#cba6f7',
    bg: '#1e1e2e',
    fg: '#cdd6f4',
    line: '#585b70',
    muted: '#6c7086',
  },
  'dracula': { accent: '#bd93f9', bg: '#282a36', fg: '#f8f8f2', line: '#6272a4', muted: '#6272a4' },
  'github-dark': {
    accent: '#4493f8',
    bg: '#0d1117',
    fg: '#e6edf3',
    line: '#3d444d',
    muted: '#9198a1',
  },
  'github-light': {
    accent: '#0969da',
    bg: '#ffffff',
    fg: '#1f2328',
    line: '#d1d9e0',
    muted: '#59636e',
  },
  'nord': { accent: '#88c0d0', bg: '#2e3440', fg: '#d8dee9', line: '#4c566a', muted: '#616e88' },
  'nord-light': {
    accent: '#5e81ac',
    bg: '#eceff4',
    fg: '#2e3440',
    line: '#aab1c0',
    muted: '#7b88a1',
  },
  'one-dark': {
    accent: '#c678dd',
    bg: '#282c34',
    fg: '#abb2bf',
    line: '#4b5263',
    muted: '#5c6370',
  },
  'solarized-dark': {
    accent: '#268bd2',
    bg: '#002b36',
    fg: '#839496',
    line: '#586e75',
    muted: '#586e75',
  },
  'solarized-light': {
    accent: '#268bd2',
    bg: '#fdf6e3',
    fg: '#657b83',
    line: '#93a1a1',
    muted: '#93a1a1',
  },
  'tokyo-night': {
    accent: '#7aa2f7',
    bg: '#1a1b26',
    fg: '#a9b1d6',
    line: '#3d59a1',
    muted: '#565f89',
  },
  'tokyo-night-light': {
    accent: '#34548a',
    bg: '#d5d6db',
    fg: '#343b58',
    line: '#34548a',
    muted: '#9699a3',
  },
  'tokyo-night-storm': {
    accent: '#7aa2f7',
    bg: '#24283b',
    fg: '#a9b1d6',
    line: '#3d59a1',
    muted: '#565f89',
  },
  'zinc-dark': { bg: '#18181B', fg: '#FAFAFA' },
  'zinc-light': { bg: '#FFFFFF', fg: '#27272A' },
};

const toDisplayName = (id: string) =>
  id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const mermaidThemes: (ThemeOption & { background?: string })[] = [
  { displayName: 'Default', id: DEFAULT_THEME_ID },
  ...Object.entries(mermaidPalettes).map(([id, palette]) => ({
    background: palette.bg,
    displayName: toDisplayName(id),
    id,
  })),
];

export interface ResolvedMermaidTheme {
  background?: string;
  config: {
    theme: string;
    themeVariables?: Record<string, string>;
  };
}

/** Mermaid configuration for a stored theme id; unknown ids follow the app theme. */
export const resolveMermaidTheme = (theme: string | undefined, isDark: boolean) => {
  const palette = theme ? mermaidPalettes[theme] : undefined;
  if (!palette) return { config: { theme: isDark ? 'dark' : 'default' } } as ResolvedMermaidTheme;

  const line = palette.line ?? palette.fg;
  return {
    background: palette.bg,
    config: {
      theme: 'base',
      themeVariables: {
        background: palette.bg,
        clusterBkg: palette.bg,
        edgeLabelBackground: palette.bg,
        lineColor: line,
        mainBkg: palette.bg,
        nodeBorder: palette.accent ?? line,
        primaryBorderColor: palette.accent ?? line,
        primaryColor: palette.bg,
        primaryTextColor: palette.fg,
        secondaryColor: palette.bg,
        tertiaryColor: palette.bg,
        textColor: palette.fg,
      },
    },
  } satisfies ResolvedMermaidTheme;
};
