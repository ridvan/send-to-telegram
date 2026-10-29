import { useMemo } from 'react';

import { useStore } from '@/hooks/use-store';
import {
  type HistoryEntry,
  historyStore,
  type InboxEntry,
  inboxStore,
  type Settings,
} from '@/lib/settings';

export type ChatItem =
  | { direction: 'out'; time: number; entry: HistoryEntry }
  | { direction: 'in'; time: number; message: InboxEntry };

/** Names a message in the chat and in search, so search can point at it. */
export function chatKey(item: ChatItem): string {
  return item.direction === 'out'
    ? `out-${item.entry.id}`
    : `in-${item.message.id}`;
}

/**
 * Earlier messages in this chat both ways, newest first, or none when the chat
 * shouldn't show them. Sent entries from 1.x have no chat, so they count only
 * when there's one chat. Sent entries from `sentSince` on are left out: the
 * draft already stands for what this popup sent.
 */
export function useChatItems(
  settings: Settings,
  destinationId: string | undefined,
  sentSince = Infinity
): ChatItem[] {
  const history = useStore(historyStore);
  const inbox = useStore(inboxStore);
  const singleChat = settings.destinations.length === 1;

  const shown = settings.history.mode === 'full' && settings.history.showInChat;

  return useMemo(() => {
    if (!shown) return [];

    const sent = history.flatMap((entry): ChatItem[] => {
      const inChat = entry.destinationId
        ? entry.destinationId === destinationId
        : singleChat;

      return entry.content && inChat && entry.sentAt < sentSince
        ? [{ direction: 'out', time: entry.sentAt, entry }]
        : [];
    });

    const received = inbox.flatMap((message): ChatItem[] =>
      message.destinationId === destinationId
        ? [{ direction: 'in', time: message.receivedAt, message }]
        : []
    );

    return [...sent, ...received].toSorted((a, b) => b.time - a.time);
  }, [history, inbox, destinationId, singleChat, shown, sentSince]);
}
