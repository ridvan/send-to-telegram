import { browser, type Browser } from 'wxt/browser';
import { z } from 'zod';

const selectionResultSchema = z.array(
  z.object({ result: z.string().nullish() })
);

/**
 * Reads the selection from the page so line breaks survive; the menu's own
 * `selectionText` flattens them. Pages that refuse scripts, like the PDF
 * viewer or the browser's own pages, fall back to `fallback`.
 */
export async function readSelection(
  tabId: number | undefined,
  frameId: number | undefined,
  fallback: string | undefined
): Promise<string | undefined> {
  if (tabId === undefined || tabId < 0) return fallback;

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId, ...(frameId !== undefined && { frameIds: [frameId] }) },
      func: () => globalThis.getSelection()?.toString() ?? '',
    });

    const text = selectionResultSchema.parse(results)[0]?.result?.trim();

    return text || fallback;
  } catch {
    return fallback;
  }
}

/** The PDF viewer runs on an extension URL; the document's own URL is the frame's. */
export function pageUrlOf(
  tab: Browser.tabs.Tab | undefined,
  frameUrl: string | undefined
): string | undefined {
  const url = tab?.url;

  if (url && !url.startsWith('http') && frameUrl?.includes('.pdf')) {
    return frameUrl;
  }

  return url;
}

export async function activeTab(): Promise<Browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  return tab;
}
