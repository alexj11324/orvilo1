import getAlphaColor from 'antd/es/theme/util/getAlphaColor';
import { describe, expect, it } from 'vitest';

import { resolveNativeTheme } from './nativeTheme';
import palettes from './nativeThemePalettes.json';

const fonts = { fontFamily: 'Geist, sans-serif', fontFamilyCode: 'Geist Mono, monospace' };
describe('local semantic theme resolution', () => {
  it('preserves DESIGN light and dark surface, text and status roles', () => {
    expect(resolveNativeTheme({ ...fonts, appearance: 'light' })).toMatchObject({
      colorPrimary: '#222222',
      colorText: '#080808',
      colorBgLayout: '#f8f8f8',
      colorBgContainer: '#ffffff',
      colorSuccess: '#379d4a',
      colorWarning: '#ee9e0b',
      colorError: '#ec5e41',
      colorInfo: '#0072f5',
      screenXSMax: 575,
      screenMD: 768,
      screenLG: 992,
    });
    expect(resolveNativeTheme({ ...fonts, appearance: 'dark' })).toMatchObject({
      colorPrimary: '#eeeeee',
      colorText: '#ffffff',
      colorBgLayout: '#000000',
      colorBgContainer: '#0d0d0d',
      colorSuccess: '#c4f042',
      colorWarning: '#ffb224',
      colorError: '#f4416c',
      colorInfo: '#60b1ff',
    });
  });
  it('resolves persisted primary and neutral choices independently in both appearances', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const theme = resolveNativeTheme({
        ...fonts,
        appearance,
        primaryColor: 'purple',
        neutralColor: 'slate',
      });
      expect(theme.colorPrimary).toBe(palettes.purple[appearance][9]);
      expect(theme.colorText).toBe(palettes.slate[appearance][12]);
      expect(theme.colorBgContainer).toBe(
        palettes.slate[appearance][appearance === 'dark' ? 1 : 0],
      );
    }
    for (const scale of Object.values(palettes)) {
      for (const colors of Object.values(scale)) expect(colors).toHaveLength(13);
    }
  });
  it('carries disabled motion through every local duration', () => {
    const theme = resolveNativeTheme({ ...fonts, appearance: 'light', animationMode: 'disabled' });
    expect(theme.motion).toBe(false);
    expect([theme.motionDurationFast, theme.motionDurationMid, theme.motionDurationSlow]).toEqual([
      '0s',
      '0s',
      '0s',
    ]);
  });
  it('matches the actual retained SDK divider algorithm for every persisted neutral and appearance', () => {
    for (const neutralColor of ['gray', 'mauve', 'slate', 'sage', 'olive', 'sand'] as const) {
      for (const appearance of ['light', 'dark'] as const) {
        const colors = palettes[neutralColor][appearance];
        const theme = resolveNativeTheme({
          ...fonts,
          appearance,
          neutralColor: neutralColor === 'gray' ? undefined : neutralColor,
        });
        expect(theme.colorSplit).toBe(
          getAlphaColor(colors[2], colors[appearance === 'dark' ? 1 : 0]),
        );
      }
    }
    expect(resolveNativeTheme({ ...fonts, appearance: 'light' }).colorSplit).toBe(
      'rgba(12,12,12,0.07)',
    );
    expect(resolveNativeTheme({ ...fonts, appearance: 'dark' }).colorSplit).toBe(
      'rgba(230,230,230,0.06)',
    );
  });
});
