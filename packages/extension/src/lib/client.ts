import { browser } from 'wxt/browser';

import type { SelectAreaRequest } from './area.ts';
import type { Draft } from './compose.ts';
import { failureCopy } from './failure.ts';
import {
  type SendOutcome,
  sendOutcomeSchema,
  type SendRequest,
} from './send.ts';
import type { HistoryEntry } from './settings.ts';

/** Asks the background to send, so the send finishes even if this page closes. */
export async function requestSend(
  draft: Draft,
  options: { incognito: boolean; retryOf?: string }
): Promise<SendOutcome> {
  const request: SendRequest = { type: 'send', draft, ...options };

  try {
    return sendOutcomeSchema.parse(await browser.runtime.sendMessage(request));
  } catch {
    return { ok: false, reason: 'network', message: failureCopy.network };
  }
}

/**
 * Asks the background to pick an area of the tab, which outlives the popup.
 * Rejects when it didn't take the request, so the popup stays open.
 */
export async function requestAreaScreenshot(request: SelectAreaRequest) {
  const accepted: unknown = await browser.runtime.sendMessage(request);

  if (accepted !== true)
    throw new Error('The background didn’t take the request');
}

/** Rebuilds what was sent from a history entry; undefined when content was not kept. */
export function draftFromEntry(entry: HistoryEntry): Draft | undefined {
  const content = entry.content;

  if (!content) return undefined;

  return {
    kind: entry.kind,
    ...(content.text && { text: content.text }),
    ...(content.url && { url: content.url }),
    ...(content.note && { note: content.note }),
    ...(content.pageUrl && { pageUrl: content.pageUrl }),
    ...(content.pageTitle && { pageTitle: content.pageTitle }),
    ...(content.attachment && { attachment: content.attachment }),
    ...(entry.tag && { tag: entry.tag }),
    ...(entry.destinationId && { destinationId: entry.destinationId }),
  };
}

export function openExtensionPage(
  path: '/options.html' | '/welcome.html',
  hash = ''
) {
  return browser.tabs.create({ url: browser.runtime.getURL(path) + hash });
}
