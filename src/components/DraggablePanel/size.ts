export interface PanelSize {
  height?: number | string;
  width?: number | string;
}
export interface PanelDelta {
  height: number;
  width: number;
}
export type PanelPlacement = 'left' | 'right' | 'top' | 'bottom';

export function clampPanelDimension(value: number, min?: number, max?: number): number {
  const lower = Math.max(0, min ?? 0);
  const upper = Math.max(lower, max ?? Number.POSITIVE_INFINITY);
  return Math.min(upper, Math.max(lower, value));
}

export function resolvePanelResize(
  size: { width: number; height: number },
  vertical: boolean,
  min?: number,
  max?: number,
  collapseThreshold?: number,
): { size: PanelSize; collapse: boolean } {
  const dimension = clampPanelDimension(vertical ? size.height : size.width, min, max);
  return {
    collapse:
      collapseThreshold !== undefined &&
      Number.isFinite(collapseThreshold) &&
      dimension <= collapseThreshold,
    size: vertical ? { height: dimension, width: '100%' } : { height: '100%', width: dimension },
  };
}
