import { UPLOAD_LIMIT } from '@send-to-telegram/core';
import { useState } from 'react';

import { formatBytes } from '@/lib/format';
import type { Attachment } from '@/lib/settings';

export type AttachedFile = {
  file: File;
  info: Attachment;
  /** Shows the file in the preview; revoked once it's replaced or removed. */
  url: string;
};

/** Why Telegram would refuse the file, as copy that says what to do instead. */
function refusal(file: File): string | undefined {
  if (file.size === 0) return 'This file is empty. Pick another one.';

  if (file.size > UPLOAD_LIMIT) {
    return `This file is ${formatBytes(file.size)}. Bots can send files up to ${formatBytes(UPLOAD_LIMIT)}, so pick a smaller one.`;
  }

  return undefined;
}

/** Why nothing was attached: the alert's title, then what to do. */
export type AttachProblem = { title: string; message: string };

export const CANT_ATTACH = 'Can’t attach this file';

function problemWith(file: File): AttachProblem | undefined {
  const reason = refusal(file);

  return reason === undefined
    ? undefined
    : { title: CANT_ATTACH, message: reason };
}

function toAttached(file: File): AttachedFile {
  return {
    file,
    url: URL.createObjectURL(file),
    info: {
      id: crypto.randomUUID(),
      name: file.name || 'file',
      type: file.type,
      size: file.size,
    },
  };
}

/**
 * One file to send with the message, picked, pasted, dropped or captured.
 * `initial` is what the popup comes back with after picking an area. The last
 * preview URL is freed with the page, which lives as long as the draft.
 */
export function useAttachment(initial?: {
  file?: File | undefined;
  problem?: AttachProblem | undefined;
}) {
  const [attached, setAttached] = useState<AttachedFile | undefined>(() =>
    initial?.file && !problemWith(initial.file)
      ? toAttached(initial.file)
      : undefined
  );

  const [problem, setProblem] = useState<AttachProblem | undefined>(
    () => initial?.problem ?? (initial?.file && problemWith(initial.file))
  );

  /**
   * Swaps the file, freeing the URL of the one it replaces. Reads the current
   * file rather than this render's, so a file attached while a screenshot
   * was being taken is freed too.
   */
  function replace(next: AttachedFile | undefined) {
    setAttached((current) => {
      if (current && current !== next) URL.revokeObjectURL(current.url);

      return next;
    });
  }

  function attach(file: File) {
    const reason = problemWith(file);

    setProblem(reason);

    if (!reason) replace(toAttached(file));
  }

  function remove() {
    replace(undefined);
    setProblem(undefined);
  }

  /** Shows why nothing was attached, or clears it when `message` is undefined. */
  function refuse(message: string | undefined, title = CANT_ATTACH) {
    setProblem(message === undefined ? undefined : { title, message });
  }

  return { attached, problem, attach, remove, refuse };
}
