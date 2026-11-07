import { takeHandoff } from '@/lib/area';
import { deleteAttachment, loadAttachment } from '@/lib/attachments';
import type { Attachment } from '@/lib/settings';
import { activeTab, readSelection } from '@/lib/tabs';

/**
 * What the popup had before it closed to pick an area, and what came of it.
 * The file is read once the popup is unlocked: it may be sealed.
 */
export type Resume = {
  note?: string;
  destinationId?: string;
  attachment?: Attachment;
  problem?: string;
};

export type PageContext = {
  url?: string;
  title?: string;
  favIconUrl?: string;
  incognito: boolean;
  selection?: string;
  /** Where to take a screenshot from; the popup's tab is its window's active one. */
  tabId?: number;
  windowId?: number;
  resume?: Resume;
};

async function resumeIn(tabId: number): Promise<Resume | undefined> {
  const handoff = await takeHandoff(tabId).catch((cause: unknown) => {
    console.error('Could not read what the popup left', cause);

    return undefined;
  });

  if (!handoff) return undefined;

  return {
    ...(handoff.note && { note: handoff.note }),
    ...(handoff.destinationId && { destinationId: handoff.destinationId }),
    ...(handoff.attachment && { attachment: handoff.attachment }),
    ...(handoff.problem && { problem: handoff.problem }),
  };
}

/**
 * Reads the draft's file back, once: the draft keeps its own copy. Undefined
 * when it's gone; one that can't be read stays for the cleanup to remove.
 */
async function takeResumedFile(
  attachment: Attachment
): Promise<File | undefined> {
  try {
    const blob = await loadAttachment(attachment.id);

    await deleteAttachment(attachment.id);

    return blob && new File([blob], attachment.name, { type: attachment.type });
  } catch (cause) {
    console.error('Could not read the file back', cause);

    return undefined;
  }
}

let resumed: Promise<File | undefined> | undefined;

/**
 * The draft's file, read once the popup is unlocked. The same promise every
 * time, as React's `use` needs.
 */
export function resumedFile(attachment: Attachment) {
  resumed ??= takeResumedFile(attachment);

  return resumed;
}

/** The tab the popup was opened over; `activeTab` grants its URL for this click. */
export async function loadPage(): Promise<PageContext> {
  const tab = await activeTab();
  const selection = await readSelection(tab?.id, 0, undefined);
  const resume = tab?.id === undefined ? undefined : await resumeIn(tab.id);

  return {
    incognito: tab?.incognito ?? false,
    ...(tab?.url && { url: tab.url }),
    ...(tab?.title && { title: tab.title }),
    ...(tab?.favIconUrl && { favIconUrl: tab.favIconUrl }),
    ...(selection && { selection }),
    ...(tab && { windowId: tab.windowId }),
    ...(tab?.id !== undefined && { tabId: tab.id }),
    ...(resume && { resume }),
  };
}
