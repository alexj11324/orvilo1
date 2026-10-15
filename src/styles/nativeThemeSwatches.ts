import type { UserNeutralColor, UserPrimaryColor } from '@orvilo/types';

// Persisted theme swatch identities, independently owned MIT data.
// Exact installed SDK dark[9] entries; these are selection values, not a new theme authority.
// See nativeThemeSwatches.LICENSE.
export const primaryColors = {
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
} satisfies Record<UserPrimaryColor, string>;

const primaryNames = [
  'blue',
  'cyan',
  'geekblue',
  'gold',
  'green',
  'lime',
  'magenta',
  'orange',
  'purple',
  'red',
  'volcano',
  'yellow',
] as const;

export function findPrimaryThemeName(value: string | undefined): UserPrimaryColor | undefined {
  return primaryNames.find((name) => primaryColors[name] === value);
}

export const neutralColors = {
  mauve: '#737177',
  olive: '#70736e',
  sage: '#6e7371',
  sand: '#73726a',
  slate: '#707276',
} satisfies Record<UserNeutralColor, string>;

const neutralNames = ['mauve', 'olive', 'sage', 'sand', 'slate'] as const;

export function findNeutralThemeName(value: string | undefined): UserNeutralColor | undefined {
  return neutralNames.find((name) => neutralColors[name] === value);
}
