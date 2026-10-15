export interface CropPosition {
  x: number;
  y: number;
}
export const cropRectangle = (
  width: number,
  height: number,
  frame: number,
  position: CropPosition,
) => {
  if (![width, height, frame].every((n) => Number.isFinite(n) && n > 0))
    throw new Error('Invalid image dimensions');
  const scale = Math.max(frame / width, frame / height);
  const sourceWidth = frame / scale;
  const sourceHeight = frame / scale;
  const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
  return {
    x: (width - sourceWidth) * clamp(position.x),
    y: (height - sourceHeight) * clamp(position.y),
    width: sourceWidth,
    height: sourceHeight,
    scale,
  };
};
