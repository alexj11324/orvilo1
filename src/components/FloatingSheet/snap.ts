export const resolveSheetSize = (value: number, container: number) =>
  value > 0 && value <= 1 ? value * container : value;
export const clampSheetSize = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));
export const dampenSheetDrag = (value: number) => (value <= 0 ? 0 : 8 * Math.log1p(value / 8));
export function closestSheetSnap(height: number, points: number[]): number {
  return points.reduce((previous, next) =>
    Math.abs(next - height) < Math.abs(previous - height) ? next : previous,
  );
}
export function releaseSheetSnap(input: {
  start: number;
  height: number;
  distance: number;
  velocity: number;
  points: number[];
  min: number;
  max: number;
  dismissible: boolean;
  closeThreshold: number;
}): number | null {
  const { start, height, distance, velocity, points, min, max, dismissible, closeThreshold } =
    input;
  if (!points.length)
    return dismissible && height < min * closeThreshold ? null : clampSheetSize(height, min, max);
  const active = points.indexOf(closestSheetSnap(start, points));
  if (velocity > 0.4 && Math.abs(distance) < points[active] * 0.4) {
    if (distance > 0) return points[Math.min(active + 1, points.length - 1)];
    return active === 0 && dismissible ? null : points[Math.max(active - 1, 0)];
  }
  if (dismissible && active === 0 && distance <= 0 && height < points[0] * closeThreshold)
    return null;
  return closestSheetSnap(height, points);
}
