import type { ChatItem } from '../hooks/use-chat-items.ts';
import { entryTitle } from './format.ts';
import type { HistoryEntry, InboxEntry } from './settings.ts';

/** Everything a sent message can be found by, lowercased. */
export function sentText(entry: HistoryEntry): string {
  const content = entry.content;

  return [
    entryTitle(entry),
    content?.text,
    content?.note,
    content?.url,
    content?.pageUrl,
    content?.pageTitle,
    content?.attachment?.name,
    ...(content?.attachments?.map((file) => file.name) ?? []),
    entry.tag && `#${entry.tag}`,
    entry.destinationName,
  ]
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase();
}

/** Everything a received message can be found by, lowercased. */
export function receivedText(message: InboxEntry): string {
  return [message.text, message.from, message.fileName, message.file?.title]
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase();
}

/**
 * Searches a chat both ways, as Telegram searches inside a chat: everything
 * until you type, then only what matches. `term` is lowercased.
 */
export function matchChatItems(items: ChatItem[], term: string): ChatItem[] {
  if (!term) return items;

  return items.filter((item) =>
    (item.direction === 'out'
      ? sentText(item.entry)
      : receivedText(item.message)
    ).includes(term)
  );
}
