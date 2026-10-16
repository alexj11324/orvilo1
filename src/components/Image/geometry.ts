export interface Size {
  height: number;
  width: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Image transform inside the viewer: scale relative to natural size, offset from center. */
export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

/** Breathing room around a fitted image, in pixels per side. */
export const VIEWER_PADDING = 48;
export const ZOOM_STEP = 1.25;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Scale that shows the whole image inside the viewport. Small images keep
 * their natural size instead of being blown up.
 */
export const fitScale = (natural: Size, viewport: Size, rotation = 0) => {
  if (!natural.width || !natural.height) return 1;
  const quarter = Math.abs(rotation / 90) % 2 === 1;
  const width = quarter ? natural.height : natural.width;
  const height = quarter ? natural.width : natural.height;
  const availableWidth = Math.max(1, viewport.width - VIEWER_PADDING * 2);
  const availableHeight = Math.max(1, viewport.height - VIEWER_PADDING * 2);
  return Math.min(1, availableWidth / width, availableHeight / height);
};

export const scaleBounds = (fit: number, maxScale: number) => ({
  max: Math.max(fit, maxScale),
  min: Math.min(fit, 1) / 4,
});

/**
 * Zoom by `factor` keeping the content under `anchor` (relative to the
 * viewport center) fixed on screen.
 */
export const zoomAt = (
  view: ViewTransform,
  factor: number,
  anchor: Point,
  bounds: { max: number; min: number },
): ViewTransform => {
  const scale = clamp(view.scale * factor, bounds.min, bounds.max);
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
};

/** Wheel delta to zoom factor; trackpad pinches arrive as small ctrl+wheel deltas. */
export const wheelFactor = (deltaY: number) => Math.exp(-clamp(deltaY, -50, 50) / 100);

export const wrapIndex = (index: number, total: number) =>
  total === 0 ? 0 : ((index % total) + total) % total;
