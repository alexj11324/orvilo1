export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Rubber-band damping for drags beyond the snap bounds: ~1:1 at first, then logarithmic. */
export const dampenValue = (value: number) => (value <= 0 ? 0 : 8 * Math.log1p(value / 8));

/** `0 < v <= 1` is a fraction of the container height; larger values are pixels. */
export const resolveSize = (value: number, containerHeight: number) => {
  if (value === 0) return 0;
  if (value > 0 && value <= 1) return value * containerHeight;
  return value;
};

const VELOCITY_THRESHOLD = 0.4;
const DRAG_DISTANCE_RATIO = 0.4;

export type SnapRelease = { height: number; type: 'snap' } | { type: 'dismiss' };

interface SnapReleaseInput {
  activeIndex: number;
  closeThreshold: number;
  currentHeight: number;
  dismissible: boolean;
  draggedDistance: number;
  maxHeightPx: number;
  minHeightPx: number;
  snapPointHeights: number[];
  velocity: number;
}

export const findClosestSnapPoint = (
  height: number,
  snapPointHeights: number[],
  minHeightPx: number,
  maxHeightPx: number,
) =>
  snapPointHeights.length === 0
    ? clamp(height, minHeightPx, maxHeightPx)
    : snapPointHeights.reduce((prev, curr) =>
        Math.abs(curr - height) < Math.abs(prev - height) ? curr : prev,
      );

/** Where a released drag settles: a flick moves one snap point, otherwise the nearest one. */
export const getSnapRelease = ({
  activeIndex,
  closeThreshold,
  currentHeight,
  dismissible,
  draggedDistance,
  maxHeightPx,
  minHeightPx,
  snapPointHeights,
  velocity,
}: SnapReleaseInput): SnapRelease => {
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === snapPointHeights.length - 1;
  const isDraggingUp = draggedDistance > 0;
  const highest = snapPointHeights.at(-1) ?? maxHeightPx;
  const lowest = snapPointHeights[0] ?? minHeightPx;
  const sheetHeight = snapPointHeights[activeIndex] ?? currentHeight;

  if (
    velocity > VELOCITY_THRESHOLD &&
    Math.abs(draggedDistance) < sheetHeight * DRAG_DISTANCE_RATIO
  ) {
    if (isDraggingUp) {
      return {
        height: isLast
          ? highest
          : (snapPointHeights[Math.min(activeIndex + 1, snapPointHeights.length - 1)] ?? highest),
        type: 'snap',
      };
    }
    if (isFirst) return dismissible ? { type: 'dismiss' } : { height: lowest, type: 'snap' };
    return { height: snapPointHeights[Math.max(activeIndex - 1, 0)] ?? lowest, type: 'snap' };
  }

  if (dismissible && isFirst && !isDraggingUp && currentHeight < lowest * closeThreshold) {
    return { type: 'dismiss' };
  }

  return {
    height: findClosestSnapPoint(currentHeight, snapPointHeights, minHeightPx, maxHeightPx),
    type: 'snap',
  };
};
