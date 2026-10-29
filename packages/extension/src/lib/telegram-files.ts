import {
  createBotClient,
  DOWNLOAD_LIMIT,
  fileUrl,
  TelegramError,
} from '@send-to-telegram/core';
import { browser } from 'wxt/browser';

import type { InboxFile, InboxPicture } from './settings.ts';

/**
 * Telegram's file host leaves out Access-Control-Allow-Origin on successful
 * downloads (only its errors carry it), so reading a file takes this optional
 * host permission. The Bot API itself needs none.
 */
const FILE_HOST = { origins: ['https://api.telegram.org/*'] };

/**
 * Asks to download media sent to your bot. Call it straight from a click,
 * before any `await`, or the browser refuses. The popup may close while the
 * browser asks; the next one finds the permission granted.
 */
export function allowDownloads(): Promise<boolean> {
  return browser.permissions.request(FILE_HOST);
}

/** Calls `listener` when downloads are allowed, until the returned stop. */
export function onDownloadsAllowed(listener: () => void) {
  browser.permissions.onAdded.addListener(listener);

  return () => browser.permissions.onAdded.removeListener(listener);
}

/** Why a received file can't be shown or saved. */
export type FileFailureReason = 'too_big' | 'unavailable' | 'not_allowed';

const failureMessages = {
  too_big: 'Bots can only download files up to 20 MB.',
  unavailable: 'Telegram didn’t hand over the file.',
  not_allowed: 'Downloading from Telegram isn’t allowed yet.',
} satisfies Record<FileFailureReason, string>;

export class FileFailure extends Error {
  override name = 'FileFailure';
  readonly reason: FileFailureReason;

  constructor(reason: FileFailureReason, options?: ErrorOptions) {
    super(failureMessages[reason], options);
    this.reason = reason;
  }
}

const CACHE = 'telegram-files';

/**
 * Cached copies are named by Telegram's lasting file ID on a made-up origin;
 * a download URL would carry the bot's token.
 */
function cacheKey(uniqueId: string) {
  return `https://telegram-file.invalid/${encodeURIComponent(uniqueId)}`;
}

async function openCache() {
  return 'caches' in globalThis ? caches.open(CACHE) : undefined;
}

/**
 * Downloads a received file with the bot that received it. `keep` caches it,
 * for pictures drawn every time the popup opens; sound, video and files are
 * downloaded when asked for. `type` stands in when Telegram didn't say, since
 * players won't reliably play a blob without one.
 */
export async function downloadFile(
  token: string,
  file: InboxPicture | InboxFile,
  options: { signal: AbortSignal; keep: boolean; type: string }
): Promise<Blob> {
  const { signal, keep, type } = options;

  if ('size' in file && (file.size ?? 0) > DOWNLOAD_LIMIT) {
    throw new FileFailure('too_big');
  }

  const cache = keep ? await openCache() : undefined;
  const hit = await cache?.match(cacheKey(file.uniqueId));

  if (hit) return hit.blob();

  // Checked first: a blocked download would still log its URL, token and all.
  if (!(await browser.permissions.contains(FILE_HOST))) {
    throw new FileFailure('not_allowed');
  }

  const signalled: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal });

  let path: string | undefined;

  try {
    const found = await createBotClient(token, signalled).call('getFile', {
      file_id: file.id,
    });

    path = found.file_path;
  } catch (cause) {
    const tooBig =
      cause instanceof TelegramError && /too big/i.test(cause.message);

    throw new FileFailure(tooBig ? 'too_big' : 'unavailable', { cause });
  }

  if (!path) throw new FileFailure('unavailable');

  // A plain GET: any added header would need a preflight the file host refuses.
  const response = await signalled(fileUrl(token, path)).catch(
    (cause: unknown) => {
      throw new FileFailure('unavailable', { cause });
    }
  );

  if (!response.ok) throw new FileFailure('unavailable');

  const mimeType = 'mimeType' in file ? file.mimeType : undefined;

  const blob = new Blob([await response.arrayBuffer()], {
    type: mimeType ?? type,
  });

  await cache?.put(cacheKey(file.uniqueId), new Response(blob)).catch(() => {
    // A full cache only means downloading it again next time.
  });

  return blob;
}

/** Deletes cached copies: of these files, or of every file when none given. */
export async function forgetFiles(uniqueIds?: string[]) {
  if (!('caches' in globalThis)) return;

  if (!uniqueIds) {
    await caches.delete(CACHE);

    return;
  }

  const cache = await caches.open(CACHE);

  await Promise.all(uniqueIds.map((id) => cache.delete(cacheKey(id))));
}
