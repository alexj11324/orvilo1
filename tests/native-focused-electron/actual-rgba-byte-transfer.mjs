import { createHash } from 'node:crypto';
// Passed as one closure-free public page.evaluate function. Only actual screenshot
// PNG decoding and complete genuine canvas getImageData bytes are transported.
export async function decodeActualScreenshotRGBA(encoded) {
  const png = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let binary = '';
    for (let offset = 0; offset < rgba.length; offset += 32768)
      binary += String.fromCharCode(
        ...rgba.subarray(offset, Math.min(offset + 32768, rgba.length)),
      );
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba));
    const rgbaSHA256 = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgbaBase64: btoa(binary),
      rgbaBytes: rgba.byteLength,
      rgbaSHA256,
      source: 'actual Electron locator.screenshot bytes only',
    };
  } finally {
    bitmap.close();
  }
}
export function restoreActualRGBATransfer(actual) {
  if (
    !Number.isInteger(actual.width) ||
    actual.width <= 0 ||
    !Number.isInteger(actual.height) ||
    actual.height <= 0 ||
    actual.rgbaBytes !== actual.width * actual.height * 4 ||
    typeof actual.rgbaBase64 !== 'string'
  )
    throw new Error('Actual full RGBA transport dimensions/byte count mismatch');
  const raw = Buffer.from(actual.rgbaBase64, 'base64');
  if (
    raw.toString('base64') !== actual.rgbaBase64 ||
    raw.length !== actual.rgbaBytes ||
    createHash('sha256').update(raw).digest('hex') !== actual.rgbaSHA256
  )
    throw new Error('Actual full RGBA transport canonical encoding/full byte SHA mismatch');
  return raw;
}
