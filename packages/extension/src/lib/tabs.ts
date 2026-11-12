import { MAX_TEXT_LENGTH } from '@send-to-telegram/core';
import { browser, type Browser } from 'wxt/browser';
import { z } from 'zod';

import {
  readSelectionMarkup,
  type Selected,
  selectedOf,
  selectionMarkupSchema,
} from './selection.ts';

const selectionResultSchema = z.array(
  z.object({ result: selectionMarkupSchema.nullish().catch(undefined) })
);

/**
 * Reads the selection from the page so line breaks and formatting survive;
 * the menu's own `selectionText` flattens them. Pages that refuse scripts,
 * like the PDF viewer or the browser's own pages, fall back to `fallback`,
 * as plain text.
 */
export async function readSelection(
  tabId: number | undefined,
  frameId: number | undefined,
  fallback: string | undefined
): Promise<Selected | undefined> {
  const plain = fallback?.trim() ? { text: fallback.trim() } : undefined;

  if (tabId === undefined || tabId < 0) return plain;

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId, ...(frameId !== undefined && { frameIds: [frameId] }) },
      func: readSelectionMarkup,
      args: [MAX_TEXT_LENGTH],
    });

    const markup = selectionResultSchema.parse(results)[0]?.result;

    return (markup && selectedOf(markup, MAX_TEXT_LENGTH)) ?? plain;
  } catch {
    return plain;
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
