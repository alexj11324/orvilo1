import { describe, expect, it } from 'vitest';

import {
  adjustSaturationBrightness,
  colorToHex,
  colorToHsv,
  hsvToColor,
  parseHexColor,
  pointToSaturationBrightness,
} from './color';

const hueEndpoints: Array<[number, string]> = [
  [0, '#ff0000'],
  [60, '#ffff00'],
  [120, '#00ff00'],
  [180, '#00ffff'],
  [240, '#0000ff'],
  [300, '#ff00ff'],
  [360, '#ff0000'],
  [-60, '#ff00ff'],
];

describe('native color picker conversion', () => {
  it.each(hueEndpoints)('maps hue %s to its full-saturation sRGB endpoint', (h, hex) => {
    expect(colorToHex(hsvToColor({ h, s: 100, v: 100, a: 1 }))).toBe(hex);
  });

  it.each(['#000000', '#ffffff', '#808080', '#123456', '#f37ab2', '#00000000', '#11223380'])(
    'round-trips %s through HSV without losing a channel or alpha',
    (hex) => {
      const parsed = parseHexColor(hex)!;
      const converted = hsvToColor(colorToHsv(parsed));
      expect(colorToHex(converted)).toBe(hex);
      expect(converted.a).toBe(parsed.a);
    },
  );

  it('accepts full HEX6/HEX8, preserves alpha and canonicalizes opaque HEX8', () => {
    expect(colorToHex(parseHexColor('AABBCC')!)).toBe('#aabbcc');
    expect(colorToHex(parseHexColor('#aabbcc80')!)).toBe('#aabbcc80');
    expect(colorToHex(parseHexColor('#aabbccff')!)).toBe('#aabbcc');
    expect(parseHexColor('00000000')?.a).toBe(0);
  });

  it.each(['', '#', 'abc', 'abcde', 'abcdefg', '123456789', 'xx1234', '12 3456'])(
    'leaves incomplete or invalid HEX %s outside the committed color model',
    (draft) => expect(parseHexColor(draft)).toBeUndefined(),
  );

  it('retains the editing hue when saturation or brightness becomes zero', () => {
    expect(colorToHsv(parseHexColor('#808080')!, 240).h).toBe(240);
    expect(colorToHsv(parseHexColor('#000000')!, 300).h).toBe(300);
    expect(colorToHex(hsvToColor({ ...colorToHsv(parseHexColor('#808080')!, 240), s: 100 }))).toBe(
      '#000080',
    );
  });

  it('clamps saturation/value and keeps HEX8 alpha during hue changes', () => {
    expect(colorToHex(hsvToColor({ h: 0, s: 200, v: 200, a: 128 / 255 }))).toBe('#ff000080');
    expect(colorToHex(hsvToColor({ h: 120, s: -1, v: -1, a: 0 }))).toBe('#00000000');
  });

  it('maps a resized/translated board and clamps pointer movement beyond its edges', () => {
    const bounds = { left: 40, top: 20, width: 200, height: 100 };
    expect(pointToSaturationBrightness({ x: 140, y: 45 }, bounds)).toEqual({ s: 50, v: 75 });
    expect(pointToSaturationBrightness({ x: 0, y: 150 }, bounds)).toEqual({ s: 0, v: 0 });
    expect(pointToSaturationBrightness({ x: 300, y: 0 }, bounds)).toEqual({ s: 100, v: 100 });
    expect(pointToSaturationBrightness({ x: 1, y: 1 }, { ...bounds, width: 0 })).toBeUndefined();
  });

  it('supports both keyboard axes, larger steps and boundaries without changing alpha', () => {
    const current = { h: 240, s: 50, v: 50, a: 0.5 };
    expect(adjustSaturationBrightness(current, 'ArrowRight')).toEqual({ ...current, s: 51 });
    expect(adjustSaturationBrightness(current, 'ArrowUp', true)).toEqual({ ...current, v: 60 });
    expect(adjustSaturationBrightness(current, 'Home')).toEqual({ ...current, s: 0, v: 0 });
    expect(adjustSaturationBrightness(current, 'End')).toEqual({ ...current, s: 100, v: 100 });
    expect(adjustSaturationBrightness(current, 'Tab')).toBeUndefined();
  });
});
