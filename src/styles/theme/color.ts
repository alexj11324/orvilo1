/**
 * Minimal OKLCH ↔ sRGB colour math for the local theme generator.
 *
 * Kept dependency-free so the generator stays a pure function that runs the
 * same in the browser, in Electron and in unit tests. Matrices are the
 * reference OKLab ones (Björn Ottosson, as used by CSS Color 4).
 */

export interface Oklch {
  /** Alpha, 0–1. Opaque when omitted. */
  alpha?: number;
  /** Chroma, 0–~0.37. */
  c: number;
  /** Hue in degrees. */
  h: number;
  /** Perceptual lightness, 0–1. */
  l: number;
}

type Rgb = [number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const toLinear = (channel: number) =>
  channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const fromLinear = (channel: number) =>
  channel <= 0.003_130_8 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

const oklchToLinearRgb = ({ l, c, h }: Oklch): Rgb => {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const l_ = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m_ = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s_ = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  return [
    4.076_741_662_1 * l_ - 3.307_711_591_3 * m_ + 0.230_969_929_2 * s_,
    -1.268_438_004_6 * l_ + 2.609_757_401_1 * m_ - 0.341_319_396_5 * s_,
    -0.004_196_086_3 * l_ - 0.703_418_614_7 * m_ + 1.707_614_701 * s_,
  ];
};

const linearRgbToOklch = ([r, g, b]: Rgb): Oklch => {
  const l_ = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m_ = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s_ = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);

  const l = 0.210_454_255_3 * l_ + 0.793_617_785 * m_ - 0.004_072_046_8 * s_;
  const a = 1.977_998_495_1 * l_ - 2.428_592_205 * m_ + 0.450_593_709_9 * s_;
  const bb = 0.025_904_037_1 * l_ + 0.782_771_766_2 * m_ - 0.808_675_766 * s_;

  const c = Math.hypot(a, bb);
  const h = c < 1e-7 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { c, h, l };
};

const GAMUT_EPSILON = 1e-6;

const inGamut = (rgb: Rgb) =>
  rgb.every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON);

/**
 * Map into sRGB by reducing chroma at constant lightness and hue (the CSS
 * Color 4 approach without the ΔE shortcut). Lightness is what every contrast
 * rule depends on, so it must not drift.
 */
export const toGamut = (color: Oklch): Oklch => {
  const l = clamp01(color.l);
  if (inGamut(oklchToLinearRgb({ ...color, l }))) return { ...color, l };
  let low = 0;
  let high = color.c;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (inGamut(oklchToLinearRgb({ ...color, c: mid, l }))) low = mid;
    else high = mid;
  }
  return { ...color, c: low, l };
};

/** sRGB channels 0–1 (gamut mapped). */
export const toSrgb = (color: Oklch): Rgb =>
  oklchToLinearRgb(toGamut(color)).map((channel) => clamp01(fromLinear(clamp01(channel)))) as Rgb;

const hex2 = (channel: number) =>
  Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0');

/** Opaque colours serialise to hex; translucent ones to rgba(). */
export const formatColor = (color: Oklch): string => {
  const [r, g, b] = toSrgb(color);
  const alpha = color.alpha ?? 1;
  if (alpha >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const round = (value: number) => Math.round(value * 255);
  return `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${Number(alpha.toFixed(3))})`;
};

const hexChannels = (hex: string): Rgb => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((char) => char + char).join('') : value;
  if (!/^[\da-f]{6}$/i.test(full)) throw new Error(`Unsupported colour: ${hex}`);
  return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16) / 255) as Rgb;
};

export const parseHex = (hex: string): Oklch =>
  linearRgbToOklch(hexChannels(hex).map(toLinear) as Rgb);

/** Parse the generator's own output formats (hex and rgba()). */
export const parseColor = (value: string): { alpha: number; rgb: Rgb } => {
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(value);
  if (rgba) {
    return {
      alpha: Number(rgba[4]),
      rgb: [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255],
    };
  }
  return { alpha: 1, rgb: hexChannels(value) };
};

/** Paint a possibly translucent colour over an opaque backdrop (sRGB, as browsers do). */
export const composite = (top: string, backdrop: string): Rgb => {
  const { alpha, rgb } = parseColor(top);
  const base = parseColor(backdrop).rgb;
  return rgb.map((channel, index) => channel * alpha + base[index] * (1 - alpha)) as Rgb;
};

/** {@link composite} as an opaque hex colour. */
export const compositeHex = (top: string, backdrop: string) =>
  `#${composite(top, backdrop).map(hex2).join('')}`;

export const relativeLuminance = ([r, g, b]: Rgb) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** WCAG 2.x contrast ratio. Either side may be an Oklch value or a generator colour string. */
export const contrast = (a: Oklch | string, b: Oklch | string): number => {
  const rgb = (value: Oklch | string) =>
    typeof value === 'string' ? parseColor(value).rgb : toSrgb(value);
  return ratio(relativeLuminance(rgb(a)), relativeLuminance(rgb(b)));
};

/** Contrast of a translucent foreground after it is composited over its backdrop. */
export const compositeContrast = (top: string, backdrop: string, against = backdrop) =>
  ratio(relativeLuminance(composite(top, backdrop)), relativeLuminance(parseColor(against).rgb));

/** Interpolate in OKLab (perceptually even, no hue detours). `amount` is the share of `b`. */
export const mixOklab = (a: Oklch, b: Oklch, amount: number): Oklch => {
  const toLab = ({ l, c, h }: Oklch) => {
    const radians = (h * Math.PI) / 180;
    return [l, c * Math.cos(radians), c * Math.sin(radians)];
  };
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  const l = l1 + (l2 - l1) * amount;
  const aa = a1 + (a2 - a1) * amount;
  const bb = b1 + (b2 - b1) * amount;
  const c = Math.hypot(aa, bb);
  return { c, h: c < 1e-7 ? a.h : ((Math.atan2(bb, aa) * 180) / Math.PI + 360) % 360, l };
};
