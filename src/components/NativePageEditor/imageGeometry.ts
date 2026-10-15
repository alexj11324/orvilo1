export interface ResizeDrag {
  maxWidth: number;
  pointerId: number;
  side: -1 | 1;
  startWidth: number;
  startX: number;
}
/** Matches the SDK's 50px minimum where the container permits it; a narrower
 * measured container always wins to avoid horizontal overflow. No rounding. */
export function resizedImageWidth(start: number, delta: number, maximum: number) {
  return Math.min(maximum, Math.max(Math.min(50, maximum), start + delta));
}
/** Actual browser decode, retaining SDK's 800px fallback. Object URL lifetime is
 * bounded to decode rather than persisting a new temporary business attachment. */
export function nativeImageWidth(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    const finish = (width: number) => {
      URL.revokeObjectURL(url);
      resolve(width);
    };
    image.onload = () => finish(image.naturalWidth || 800);
    image.onerror = () => finish(800);
    image.src = url;
  });
}
