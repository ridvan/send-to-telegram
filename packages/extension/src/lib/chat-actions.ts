import type { ChatItem } from '../hooks/use-chat-items.ts';
import {
  historyStore,
  INBOX_REMOVED_FOR,
  type InboxFile,
  type InboxRemoved,
  inboxRemovedStore,
  inboxStore,
  MAX_INBOX_REMOVED,
} from './settings.ts';
import { forgetFiles } from './telegram-files.ts';

/** The lasting IDs that name a file's cached copies, its preview's too. */
function cachedIds(file: InboxFile | undefined): string[] {
  if (!file) return [];

  return file.preview
    ? [file.uniqueId, file.preview.uniqueId]
    : [file.uniqueId];
}

/** What deleting these messages touches: each store's IDs and cached files. */
export function deletionOf(items: ChatItem[]) {
  const sent = new Set<string>();
  const received = new Set<string>();
  const files: string[] = [];

  for (const item of items) {
    if (item.direction === 'out') {
      sent.add(item.entry.id);
      files.push(...cachedIds(item.entry.content?.sentMedia?.file));
    } else {
      received.add(item.message.id);
      files.push(...cachedIds(item.message.file));
    }
  }

  return { sent, received, files };
}

/**
 * Marks received messages deleted, newest first, and drops marks old enough
 * that Telegram no longer returns their messages.
 */
export function withRemoved(
  list: InboxRemoved[],
  ids: ReadonlySet<string>,
  now: number
): InboxRemoved[] {
  const added = [...ids].map((id) => ({ id, removedAt: now }));

  const kept = list.filter(
    (item) => !ids.has(item.id) && now - item.removedAt < INBOX_REMOVED_FOR
  );

  return [...added, ...kept].slice(0, MAX_INBOX_REMOVED);
}

/**
 * Deletes messages from this browser only; Telegram keeps them. Writes each
 * store once, however many messages go.
 */
export async function deleteMessages(items: ChatItem[], now = Date.now()) {
  const { sent, received, files } = deletionOf(items);

  if (received.size > 0) {
    // Marked first, so a read already under way can't bring them back.
    await inboxRemovedStore.update((list) => withRemoved(list, received, now));
    await inboxStore.update((inbox) =>
      inbox.filter((entry) => !received.has(entry.id))
    );
  }

  if (sent.size > 0) {
    await historyStore.update((history) =>
      history.filter((entry) => !sent.has(entry.id))
    );
  }

  await forgetFiles(files);
}
