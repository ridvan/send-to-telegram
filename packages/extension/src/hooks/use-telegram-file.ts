import { useEffect, useState } from 'react';

import type { InboxFile, InboxPicture } from '@/lib/settings';
import {
  downloadFile,
  FileFailure,
  type FileFailureReason,
  onDownloadsAllowed,
} from '@/lib/telegram-files';

export type FileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'failed'; reason: FileFailureReason };

type Settled = Extract<FileState, { status: 'ready' | 'failed' }>;

/**
 * Downloads a received file once `wanted`, and gives a `blob:` URL for it that
 * lives as long as the component. `retry` asks again after a failure.
 */
export function useTelegramFile(
  token: string | undefined,
  file: InboxPicture | InboxFile | undefined,
  options: { wanted: boolean; keep: boolean; type: string }
) {
  const { wanted, keep, type } = options;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ request: string; state: Settled }>();

  // Plain values, so a store update that rebuilds the entry doesn't restart a
  // download already under way.
  const id = file?.id;
  const uniqueId = file?.uniqueId;
  const size = file && 'size' in file ? file.size : undefined;
  const mimeType = file && 'mimeType' in file ? file.mimeType : undefined;

  const request =
    token && id && uniqueId && wanted
      ? `${uniqueId}:${keep}:${attempt}`
      : undefined;

  useEffect(() => {
    if (!request || !token || !id || !uniqueId) return undefined;

    const controller = new AbortController();
    let url: string | undefined;

    const target: InboxFile = {
      id,
      uniqueId,
      ...(size && { size }),
      ...(mimeType && { mimeType }),
    };

    downloadFile(token, target, { signal: controller.signal, keep, type }).then(
      (blob) => {
        if (controller.signal.aborted) return;

        url = URL.createObjectURL(blob);
        setSettled({ request, state: { status: 'ready', url } });
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return;

        const reason =
          cause instanceof FileFailure ? cause.reason : 'unavailable';

        setSettled({ request, state: { status: 'failed', reason } });
      }
    );

    return () => {
      controller.abort();

      if (url) URL.revokeObjectURL(url);
    };
  }, [request, token, id, uniqueId, size, mimeType, keep, type]);

  const state: FileState = !request
    ? { status: 'idle' }
    : settled?.request === request
      ? settled.state
      : { status: 'loading' };

  const blocked = state.status === 'failed' && state.reason === 'not_allowed';

  // Allowed from another bubble, or from the browser's prompt while this
  // popup stayed open: load without another click.
  useEffect(() => {
    if (!blocked) return undefined;

    return onDownloadsAllowed(() => setAttempt((count) => count + 1));
  }, [blocked]);

  return { state, retry: () => setAttempt((count) => count + 1) };
}
