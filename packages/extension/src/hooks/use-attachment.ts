import { UPLOAD_LIMIT } from '@send-to-telegram/core';
import { useEffect, useRef, useState } from 'react';

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

/** One file to send with the message, picked, pasted or dropped. */
export function useAttachment() {
  const [attached, setAttached] = useState<AttachedFile>();
  const [problem, setProblem] = useState<string>();
  const shown = useRef<string>(undefined);

  /** Frees the URL the preview showed, once its file is replaced or gone. */
  function release() {
    if (shown.current) URL.revokeObjectURL(shown.current);

    shown.current = undefined;
  }

  useEffect(() => release, []);

  function attach(file: File) {
    const reason = refusal(file);

    setProblem(reason);

    if (reason) return;

    release();
    shown.current = URL.createObjectURL(file);

    setAttached({
      file,
      url: shown.current,
      info: {
        id: crypto.randomUUID(),
        name: file.name || 'file',
        type: file.type,
        size: file.size,
      },
    });
  }

  function remove() {
    release();
    setAttached(undefined);
    setProblem(undefined);
  }

  return { attached, problem, attach, remove, refuse: setProblem };
}
