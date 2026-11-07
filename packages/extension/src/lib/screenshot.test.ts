import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';

import {
  CaptureError,
  captureTab,
  cropBox,
  screenshotName,
} from './screenshot.ts';

// A 1×1 transparent PNG.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const original = browser.tabs.captureVisibleTab;

/** Defined, not spied on: vi.spyOn picks the callback overload's types. */
function stubCapture(result: () => Promise<string>) {
  const stub = vi.fn(result);

  Object.defineProperty(browser.tabs, 'captureVisibleTab', {
    value: stub,
    configurable: true,
    writable: true,
  });

  return stub;
}

afterEach(() => {
  Object.defineProperty(browser.tabs, 'captureVisibleTab', {
    value: original,
    configurable: true,
    writable: true,
  });
});

describe('screenshotName', () => {
  it('names the file by when it was taken', () => {
    expect(screenshotName(new Date(2026, 10, 7, 9, 5, 3))).toBe(
      'Screenshot 2026-11-07 at 09.05.03.png'
    );
  });
});

describe('captureTab', () => {
  it('captures the window asked for as a PNG file', async () => {
    const capture = stubCapture(async () => PIXEL);

    const file = await captureTab(7);

    expect(capture).toHaveBeenCalledWith(7, { format: 'png' });
    expect(file.type).toBe('image/png');
    expect(file.name).toMatch(/^Screenshot .+\.png$/);

    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());

    expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('says what to do when the page refuses', async () => {
    stubCapture(async () => {
      throw new Error('Cannot access a chrome:// URL');
    });

    await expect(captureTab(1)).rejects.toBeInstanceOf(CaptureError);
  });
});

describe('cropBox', () => {
  const area = {
    x: 100,
    y: 50,
    width: 300,
    height: 200,
    viewportWidth: 1280,
    scrollX: 0,
    scrollY: 0,
  };

  it('scales the area by the screen’s pixel ratio', () => {
    expect(cropBox(area, 2560, 1600)).toEqual({
      x: 200,
      y: 100,
      width: 600,
      height: 400,
    });
  });

  it('keeps an area dragged past the edge inside the capture', () => {
    expect(
      cropBox({ ...area, x: 1200, y: -20, height: 900 }, 1280, 800)
    ).toEqual({ x: 1200, y: 0, width: 80, height: 800 });
  });
});
