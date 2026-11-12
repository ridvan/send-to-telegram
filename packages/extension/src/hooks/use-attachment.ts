import { UPLOAD_LIMIT } from '@send-to-telegram/core';
import { useRef, useState } from 'react';

import { MAX_ATTACHMENTS } from '@/lib/compose';
import { formatBytes, plural } from '@/lib/format';
import type { Attachment } from '@/lib/settings';

export type AttachedFile = {
  file: File;
  info: Attachment;
  /** Shows the file in the preview; revoked once it's removed. */
  url: string;
};

/**
 * Why Telegram would refuse the file, as copy that says what to do instead.
 * Among several files, it names the one.
 */
function refusal(file: File, named: boolean): string | undefined {
  const subject = named ? `“${file.name || 'file'}”` : 'This file';

  if (file.size === 0) return `${subject} is empty. Pick another one.`;

  if (file.size > UPLOAD_LIMIT) {
    return `${subject} is ${formatBytes(file.size)}. Bots can send files up to ${formatBytes(UPLOAD_LIMIT)}, so pick a smaller one.`;
  }

  return undefined;
}

/** Why nothing was attached: the alert's title, then what to do. */
export type AttachProblem = { title: string; message: string };

export const CANT_ATTACH = 'Can’t attach this file';

const CANT_ATTACH_MORE = 'Can’t attach more files';

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

/** The files that fit, and why any others don't. */
export type Admitted = {
  accepted: File[];
  problem: AttachProblem | undefined;
};

/** What fits next to `count` files already attached, and why the rest don't. */
export function admit(files: File[], count: number): Admitted {
  const named = files.length > 1;
  const reasons = files.map((file) => refusal(file, named));
  const sendable = files.filter((_, index) => reasons[index] === undefined);
  const accepted = sendable.slice(0, Math.max(0, MAX_ATTACHMENTS - count));
  const left = sendable.length - accepted.length;
  const reason = reasons.find((each) => each !== undefined);

  if (left > 0) {
    return {
      accepted,
      problem: {
        title: CANT_ATTACH_MORE,
        message:
          accepted.length === 0
            ? `A message takes up to ${MAX_ATTACHMENTS} files. Remove one to attach another.`
            : `A message takes up to ${MAX_ATTACHMENTS} files, so ${plural(left, { one: '# file wasn’t', other: '# files weren’t' })} attached. Remove some to attach the rest.`,
      },
    };
  }

  return {
    accepted,
    problem:
      reason === undefined
        ? undefined
        : { title: CANT_ATTACH, message: reason },
  };
}

/**
 * Up to ten files to send with the message, picked, pasted, dropped or
 * captured; two or more go as an album. `initial` is what the popup comes
 * back with after picking an area. Preview URLs left are freed with the
 * page, which lives as long as the draft.
 */
export function useAttachments(initial?: {
  files?: File[] | undefined;
  problem?: AttachProblem | undefined;
}) {
  const [first] = useState(() => admit(initial?.files ?? [], 0));

  const [attached, setAttached] = useState<AttachedFile[]>(() =>
    first.accepted.map(toAttached)
  );

  const [problem, setProblem] = useState<AttachProblem | undefined>(
    () => initial?.problem ?? first.problem
  );

  /**
   * The files as last set, not as this render saw them, so a file attached
   * while a screenshot was being taken still counts.
   */
  const current = useRef(attached);

  function update(next: AttachedFile[]) {
    current.current = next;
    setAttached(next);
  }

  /** Adds what fits; says why any file wasn't added, or clears the last why. */
  function attach(files: File[]) {
    const { accepted, problem: reason } = admit(files, current.current.length);

    setProblem(reason);

    if (accepted.length > 0) {
      update([...current.current, ...accepted.map(toAttached)]);
    }
  }

  function remove(id: string) {
    const gone = current.current.find((item) => item.info.id === id);

    if (gone) URL.revokeObjectURL(gone.url);

    update(current.current.filter((item) => item !== gone));
    setProblem(undefined);
  }

  /** Drops every file, after a send or from the draft's menu. */
  function clear() {
    for (const item of current.current) URL.revokeObjectURL(item.url);

    update([]);
    setProblem(undefined);
  }

  /** Keeps only the files not in `ids`, after those went. */
  function forget(ids: readonly string[]) {
    const went = new Set(ids);

    for (const item of current.current) {
      if (went.has(item.info.id)) URL.revokeObjectURL(item.url);
    }

    update(current.current.filter((item) => !went.has(item.info.id)));
  }

  /** Shows why nothing was attached, or clears it when `message` is undefined. */
  function refuse(message: string | undefined, title = CANT_ATTACH) {
    setProblem(message === undefined ? undefined : { title, message });
  }

  return {
    attached,
    full: attached.length >= MAX_ATTACHMENTS,
    problem,
    attach,
    remove,
    clear,
    forget,
    refuse,
  };
}
