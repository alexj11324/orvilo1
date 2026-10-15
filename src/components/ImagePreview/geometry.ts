export interface Size {
  height: number;
  width: number;
}
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export const clampScale = (scale: number, maximum = 8) =>
  Math.min(Math.max(Number.isFinite(scale) ? scale : 1, 1), Math.max(1, maximum));

/** Fit never enlarges the original image. Quarter turns exchange the two axes. */
export const fitImage = (natural: Size, viewport: Size, rotation: number) => {
  if (natural.width <= 0 || natural.height <= 0 || viewport.width <= 0 || viewport.height <= 0)
    return { height: 0, ratio: 0, width: 0 };
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const effective = quarterTurn ? { height: natural.width, width: natural.height } : natural;
  const ratio = Math.max(
    0,
    Math.min(1, viewport.width / effective.width, viewport.height / effective.height),
  );
  return { height: natural.height * ratio, ratio, width: natural.width * ratio };
};

export const initialScale = (
  policy: 'auto' | 'actual' | 'fit',
  fitRatio: number,
  threshold = 2,
) => {
  const actual = fitRatio > 0 ? 1 / fitRatio : 1;
  return policy === 'fit' || (policy === 'auto' && actual > threshold) ? 1 : actual;
};

export const boundPan = (
  transform: Transform,
  fit: Size,
  viewport: Size,
  rotation: number,
): Transform => {
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const width = quarterTurn ? fit.height : fit.width;
  const height = quarterTurn ? fit.width : fit.height;
  const xLimit = Math.max(0, (width * transform.scale - viewport.width) / 2);
  const yLimit = Math.max(0, (height * transform.scale - viewport.height) / 2);
  return {
    ...transform,
    x: Math.min(xLimit, Math.max(-xLimit, transform.x)),
    y: Math.min(yLimit, Math.max(-yLimit, transform.y)),
  };
};

/** Keep the pixel beneath the cursor/pinch midpoint fixed while zooming. */
export const anchoredZoom = (
  current: Transform,
  scale: number,
  anchor: { x: number; y: number },
): Transform => {
  const ratio = scale / current.scale;
  return {
    scale,
    x: anchor.x - ratio * (anchor.x - current.x),
    y: anchor.y - ratio * (anchor.y - current.y),
  };
};

export const galleryIndex = (index: number, count: number) =>
  count > 0 ? ((index % count) + count) % count : 0;
