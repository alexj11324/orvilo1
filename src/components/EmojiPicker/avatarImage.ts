export const ACCEPTED_IMAGE_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

/** The largest centered square of a `width`×`height` image. */
export const centerSquare = (width: number, height: number) => {
  const size = Math.min(width, height);
  return { size, x: (width - size) / 2, y: (height - size) / 2 };
};

export const readAsDataURL = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = src;
  });

/**
 * Crop the centered square of an image and scale it to `outputSize`, returning
 * the PNG data URL for display and a WebP file for upload.
 */
export const cropAvatar = async (src: string, outputSize: number) => {
  const image = await loadImage(src);
  const { size, x, y } = centerSquare(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  canvas.getContext('2d')?.drawImage(image, x, y, size, size, 0, 0, outputSize, outputSize);
  const file = await new Promise<File | undefined>((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], 'avatar.webp', { type: 'image/webp' }) : undefined),
      'image/webp',
      0.95,
    ),
  );
  return { dataUrl: canvas.toDataURL(), file };
};
