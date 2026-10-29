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
