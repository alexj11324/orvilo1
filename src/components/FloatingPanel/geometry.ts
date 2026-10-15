export type Placement = 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
export type Handle =
  'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
export const resizeHandles = (placement: Placement): Handle[] =>
  placement === 'bottomLeft'
    ? ['top', 'right', 'topRight']
    : placement === 'topLeft'
      ? ['bottom', 'right', 'bottomRight']
      : placement === 'topRight'
        ? ['bottom', 'left', 'bottomLeft']
        : ['top', 'left', 'topLeft'];
export function resizePanel(input: {
  handle: Handle;
  width: number;
  height: number;
  deltaX: number;
  deltaY: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const { handle, width, height, deltaX, deltaY, minWidth, minHeight, maxWidth, maxHeight } = input;
  const horizontal =
    handle.includes('Left') || handle === 'left'
      ? -deltaX
      : handle.includes('Right') || handle === 'right'
        ? deltaX
        : 0;
  const vertical = handle.startsWith('top') ? -deltaY : handle.startsWith('bottom') ? deltaY : 0;
  return {
    width: Math.min(Math.max(width + horizontal, minWidth), Math.max(minWidth, maxWidth)),
    height: Math.min(Math.max(height + vertical, minHeight), Math.max(minHeight, maxHeight)),
  };
}
export function resolveToastDodge({
  panelHeight,
  panelOffsetX,
  panelOffsetY,
  panelWidth,
  viewportHeight,
  viewportWidth,
}: {
  panelHeight: number;
  panelOffsetX: number;
  panelOffsetY: number;
  panelWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}) {
  const shiftX = Math.max(0, panelWidth + panelOffsetX + 12 - 16);
  const shiftY = Math.max(0, panelHeight + panelOffsetY + 12 - 16);
  const lane = viewportWidth - shiftX - 32;
  const headroom = viewportHeight - shiftY - 32;
  const alignInline = Math.max(0, 16 - panelOffsetX);
  const alignBlock = Math.max(0, 16 - panelOffsetY);
  if (lane >= 360) return { reserve: alignBlock, alignInline: 0, shiftX, shiftY: 0, width: 360 };
  if (headroom >= 88) return { reserve: 0, alignInline, shiftX: 0, shiftY, width: 360 };
  if (lane >= 260) return { reserve: alignBlock, alignInline: 0, shiftX, shiftY: 0, width: lane };
  return {
    reserve: Math.max(0, 116 - panelOffsetY),
    alignInline,
    shiftX: 0,
    shiftY: 0,
    width: 360,
  };
}
