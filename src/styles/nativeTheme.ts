import { mix, parseToRgb } from 'polished';

import palettes from './nativeThemePalettes.json';
import shadows from './nativeThemeShadows.json';
import type { UserNeutralColor, UserPrimaryColor } from './nativeThemeSwatches';
import type { ResolvedDocumentTheme } from './resolvedThemeContract';

export interface NativeThemeOptions {
  animationMode?: 'disabled' | 'agile' | 'elegant';
  appearance: 'dark' | 'light';
  fontFamily: string;
  fontFamilyCode: string;
  neutralColor?: UserNeutralColor;
  primaryColor?: UserPrimaryColor;
}

type Scale = typeof palettes.gray;
function status(scale: Scale, appearance: 'dark' | 'light') {
  const colors = scale[appearance];
  return {
    color: colors[9],
    bg: colors[1],
    bgHover: colors[2],
    border: colors[4],
    borderHover: colors[appearance === 'dark' ? 5 : 3],
    hover: colors[appearance === 'dark' ? 10 : 8],
    active: colors[appearance === 'dark' ? 7 : 10],
  };
}
/** Adapted from Ant Design's MIT getAlphaColor. Preserve its hundredth-step
 * search and channel rounding: a continuous solution changes cross-surface CSS.
 * See nativeThemeAlpha.provenance.json and nativeThemeAlpha.LICENSE. */
function divider(foreground: string, background: string): string {
  const fg = parseToRgb(foreground);
  if ('alpha' in fg && fg.alpha < 1) return foreground;
  const bg = parseToRgb(background);
  for (let alpha = 0.01; alpha <= 1; alpha += 0.01) {
    const channels = (['red', 'green', 'blue'] as const).map((key) =>
      Math.round((fg[key] - bg[key] * (1 - alpha)) / alpha),
    );
    if (channels.every((channel) => channel >= 0 && channel <= 255)) {
      const opacity = Math.round(alpha * 100) / 100;
      return opacity === 1
        ? `rgb(${channels.join(',')})`
        : `rgba(${channels.join(',')},${opacity})`;
    }
  }
  return `rgb(${fg.red},${fg.green},${fg.blue})`;
}

/** Local resolution of DESIGN.md / DESIGN.dark.md roles. Palette data preserves
 * all persisted primary/neutral choices; no SDK/antd theme algorithm executes. */
export function resolveNativeTheme(options: NativeThemeOptions): ResolvedDocumentTheme {
  const { appearance, fontFamily, fontFamilyCode } = options;
  const dark = appearance === 'dark';
  const neutral = palettes[options.neutralColor ?? 'gray'];
  const colors = neutral[appearance];
  const alpha = neutral[dark ? 'darkA' : 'lightA'];
  const surface = colors[dark ? 1 : 0];
  const layout = colors[dark ? 0 : 1];
  const primary = status(palettes[options.primaryColor ?? 'primary'], appearance);
  const success = status(palettes[dark ? 'lime' : 'green'], appearance);
  const warning = status(palettes.gold, appearance);
  const error = status(palettes[dark ? 'red' : 'volcano'], appearance);
  const info = status(palettes[dark ? 'blue' : 'geekblue'], appearance);
  const motion = options.animationMode !== 'disabled';
  const unit = options.animationMode === 'agile' ? 0.05 : 0.1;
  return {
    isDarkMode: dark,
    fontFamily,
    fontFamilyCode,
    colorBgContainer: surface,
    colorBgContainerSecondary: mix(0.5, layout, surface),
    colorBgElevated: colors[dark ? 2 : 0],
    colorBgLayout: layout,
    colorBgMask: neutral.lightA[8],
    colorBgContainerDisabled: alpha[1],
    colorBorder: colors[3],
    colorBorderSecondary: colors[2],
    colorFill: alpha[3],
    colorFillSecondary: alpha[2],
    colorFillTertiary: alpha[1],
    colorFillQuaternary: alpha[0],
    colorText: colors[12],
    colorTextSecondary: colors[10],
    colorTextTertiary: colors[8],
    colorTextQuaternary: colors[6],
    colorTextDescription: colors[8],
    colorTextLightSolid: '#fff',
    colorSplit: divider(colors[2], surface),
    colorPrimary: primary.color,
    colorPrimaryBg: primary.bg,
    colorPrimaryBgHover: primary.bgHover,
    colorPrimaryBorder: primary.border,
    colorPrimaryBorderHover: primary.borderHover,
    colorPrimaryHover: primary.hover,
    colorPrimaryText: primary.color,
    colorSuccess: success.color,
    colorSuccessBg: success.bg,
    colorSuccessBorder: success.border,
    colorSuccessText: success.color,
    colorWarning: warning.color,
    colorWarningBg: warning.bg,
    colorWarningBorder: warning.border,
    colorWarningText: warning.color,
    colorError: error.color,
    colorErrorBg: error.bg,
    colorErrorBorder: error.border,
    colorErrorText: error.color,
    colorInfo: info.color,
    colorInfoBg: info.bg,
    colorInfoBgHover: info.bgHover,
    colorInfoBorder: info.border,
    colorInfoText: info.color,
    colorLink: info.color,
    colorLinkActive: info.active,
    blue: palettes.blue[appearance][9],
    cyan: palettes.cyan[appearance][9],
    geekblue: palettes.geekblue[appearance][9],
    gold: palettes.gold[appearance][9],
    gold4: palettes.gold[appearance][4],
    green: palettes.green[appearance][9],
    magenta: palettes.magenta[appearance][9],
    orange: palettes.orange[appearance][9],
    // Ant Design's deprecated pink seed remains unchanged by the SDK palette override.
    pink: '#EB2F96',
    purple: palettes.purple[appearance][9],
    volcano: palettes.volcano[appearance][9],
    yellowBg: palettes.yellow[dark ? 'darkA' : 'lightA'][1],
    // Preserve the actual engine values; the semantic emitter owns dark
    // --shadow-dialog: none, independently of this raw resolved contract.
    boxShadowTertiary: shadows[appearance].boxShadowTertiary,
    boxShadowSecondary: shadows[appearance].boxShadowSecondary,
    boxShadow: shadows[appearance].boxShadow,
    motion,
    motionDurationFast: motion ? `${unit.toFixed(1)}s` : '0s',
    motionDurationMid: motion ? `${(unit * 2).toFixed(1)}s` : '0s',
    motionDurationSlow: motion ? `${(unit * 3).toFixed(1)}s` : '0s',
    motionEaseOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    motionEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    screenXSMax: 575,
    screenMD: 768,
    screenLG: 992,
  };
}
