import { browser } from 'wxt/browser';

import type { Area } from './area.ts';
import type { Attachment } from './settings.ts';
import { fromBase64 } from './vault.ts';

/** Why the visible tab couldn't be captured, as copy that says what to do. */
export class CaptureError extends Error {
  override name = 'CaptureError';
}

/** What to tell you when a screenshot failed: the reason if known. */
export function captureFailure(cause: unknown): string {
  return cause instanceof CaptureError
    ? cause.message
    : 'Couldn’t take the screenshot. Try again.';
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Named like the system's own screenshots, so saved ones sort by time. */
export function screenshotName(at: Date): string {
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}`;

  return `Screenshot ${day} at ${time}.png`;
}

/**
 * The area in the capture's pixels, kept inside it. The capture is as wide as
 * the viewport times the screen's pixel ratio and the page's zoom, so its
 * width says how far to scale.
 */
export function cropBox(area: Area, imageWidth: number, imageHeight: number) {
  const scale = imageWidth / area.viewportWidth;
  const x = Math.min(Math.max(Math.round(area.x * scale), 0), imageWidth - 1);
  const y = Math.min(Math.max(Math.round(area.y * scale), 0), imageHeight - 1);

  return {
    x,
    y,
    width: Math.max(
      Math.min(Math.round(area.width * scale), imageWidth - x),
      1
    ),
    height: Math.max(
      Math.min(Math.round(area.height * scale), imageHeight - y),
      1
    ),
  };
}

async function crop(png: Blob, area: Area): Promise<Blob> {
  const image = await createImageBitmap(png);
  const box = cropBox(area, image.width, image.height);
  const canvas = new OffscreenCanvas(box.width, box.height);
  const context = canvas.getContext('2d');

  if (!context) throw new Error('Could not draw the screenshot');

  context.drawImage(
    image,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height
  );
  image.close();

  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * What the window's active tab shows, or the `area` of it, as a PNG at the
 * screen's resolution. `activeTab` allows it for the tab the popup, menu or
 * shortcut was used on; browser pages and extension stores refuse it. PNG
 * keeps text sharp, and the format is set because Chrome and Firefox default
 * to different ones.
 */
export async function captureTab(windowId: number, area?: Area): Promise<File> {
  let dataUrl: string;

  try {
    dataUrl = await browser.tabs.captureVisibleTab(windowId, {
      format: 'png',
    });
  } catch (cause) {
    throw new CaptureError(
      'The browser doesn’t allow screenshots of this page. Open a website and try again.',
      { cause }
    );
  }

  const bytes = fromBase64(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const png = new Blob([bytes], { type: 'image/png' });

  return new File(
    [area ? await crop(png, area) : png],
    screenshotName(new Date()),
    { type: 'image/png' }
  );
}

/** The file's details as a message keeps them. */
export function attachmentInfo(file: File): Attachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    size: file.size,
  };
}
