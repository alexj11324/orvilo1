export interface RgbaColor {
  a: number;
  b: number;
  g: number;
  r: number;
}

export interface HsvColor {
  a: number;
  h: number;
  s: number;
  v: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const normalizeHue = (hue: number) => (((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360;

/** The public picker accepts complete six/eight-digit HEX; partial text stays a draft. */
export const parseHexColor = (input: string): RgbaColor | undefined => {
  const hex = input.trim().replace(/^#/, '');
  if (!/^(?:[\da-f]{6}|[\da-f]{8})$/i.test(hex)) return;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
};

/** RGB channels are sRGB bytes; alpha remains a fraction until HEX serialization. */
export const colorToHex = ({ r, g, b, a }: RgbaColor): string => {
  const byte = (value: number) =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, '0');
  const alpha = clamp(a, 0, 1);
  return `#${byte(r)}${byte(g)}${byte(b)}${alpha < 1 ? byte(alpha * 255) : ''}`;
};

/** Standard HSV sectors. Saturation/value percentages are independent of alpha. */
export const hsvToColor = ({ h, s, v, a }: HsvColor): RgbaColor => {
  const hue = normalizeHue(h) / 60;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * (clamp(s, 0, 100) / 100);
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const offset = value - chroma;
  const sectors = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const channels = sectors[Math.floor(hue)]!;
  return {
    r: Math.round((channels[0]! + offset) * 255),
    g: Math.round((channels[1]! + offset) * 255),
    b: Math.round((channels[2]! + offset) * 255),
    a: clamp(a, 0, 1),
  };
};

/** Hue is undefined for grey/black; retain the user's last hue for a reversible edit. */
export const colorToHsv = ({ r, g, b, a }: RgbaColor, previousHue = 0): HsvColor => {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const difference = max - min;
  let hue = previousHue;
  if (difference > 0) {
    if (max === red) hue = 60 * (((green - blue) / difference) % 6);
    else if (max === green) hue = 60 * ((blue - red) / difference + 2);
    else hue = 60 * ((red - green) / difference + 4);
  }
  return {
    h: normalizeHue(hue),
    s: max === 0 ? 0 : (difference / max) * 100,
    v: max * 100,
    a: clamp(a, 0, 1),
  };
};

export const pointToSaturationBrightness = (
  point: { x: number; y: number },
  bounds: { left: number; top: number; width: number; height: number },
): Pick<HsvColor, 's' | 'v'> | undefined => {
  if (!(bounds.width > 0 && bounds.height > 0)) return;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  return {
    s: clamp(((point.x - bounds.left) / bounds.width) * 100, 0, 100),
    v: clamp((1 - (point.y - bounds.top) / bounds.height) * 100, 0, 100),
  };
};

export const adjustSaturationBrightness = (
  color: HsvColor,
  key: string,
  largeStep = false,
): HsvColor | undefined => {
  const step = largeStep ? 10 : 1;
  switch (key) {
    case 'ArrowLeft': {
      return { ...color, s: clamp(color.s - step, 0, 100) };
    }
    case 'ArrowRight': {
      return { ...color, s: clamp(color.s + step, 0, 100) };
    }
    case 'ArrowUp': {
      return { ...color, v: clamp(color.v + step, 0, 100) };
    }
    case 'ArrowDown': {
      return { ...color, v: clamp(color.v - step, 0, 100) };
    }
    case 'PageUp': {
      return { ...color, v: clamp(color.v + 10, 0, 100) };
    }
    case 'PageDown': {
      return { ...color, v: clamp(color.v - 10, 0, 100) };
    }
    case 'Home': {
      return { ...color, s: 0, v: 0 };
    }
    case 'End': {
      return { ...color, s: 100, v: 100 };
    }
    default: {
      return;
    }
  }
};
