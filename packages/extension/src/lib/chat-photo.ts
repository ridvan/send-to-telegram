const LONG_SIDE = 1280;

/**
 * Shrinks a photo to fill the popup's chat on a sharp screen, and no more, so
 * it stays small enough to keep in storage.
 */
export async function photoToBackground(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');

  if (!context) throw new Error('Canvas is unavailable');

  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL('image/webp', 0.8);
}
