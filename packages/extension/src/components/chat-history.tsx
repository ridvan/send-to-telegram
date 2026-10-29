import { useId, useState } from 'react';

import { ReceivedMessage, SentMessage } from '@/components/message-preview';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type ChatItem, chatKey } from '@/hooks/use-chat-items';
import { draftFromEntry, requestSend } from '@/lib/client';
import { dayKey, entryTitle, formatDay, groupByDay } from '@/lib/format';
import { chatRowId } from '@/lib/reveal';
import type { HistoryEntry, Settings } from '@/lib/settings';

/** A day or two of messages at a time, so the popup opens fast. */
const PAGE = 40;

/** What a search result is called for screen readers. */
function pickLabel(item: ChatItem) {
  const text =
    item.direction === 'out'
      ? entryTitle(item.entry)
      : (item.message.text ?? item.message.fileName ?? item.message.media);

  const short = text && text.length > 80 ? `${text.slice(0, 79)}…` : text;

  return short ? `Show in chat: ${short}` : 'Show in chat';
}

/** A date between messages, as Telegram marks where a day begins. */
function DayPill({ day, now, id }: { day: number; now: number; id?: string }) {
  return (
    <h2
      id={id}
      className="sticky top-0 z-1 self-center rounded-full bg-service px-2.5 py-0.5 text-xs font-medium text-service-foreground backdrop-blur-sm"
    >
      {formatDay(day, now)}
    </h2>
  );
}

/** Why a message didn't go out, and a way to send it again in place. */
function SendAgain({ entry }: { entry: HistoryEntry }) {
  const [sending, setSending] = useState(false);
  const draft = draftFromEntry(entry);

  return (
    <p className="text-right text-xs text-destructive">
      {entry.error ?? 'Not sent.'}{' '}
      {draft ? (
        <Button
          variant="link"
          size="text"
          aria-disabled={sending}
          onClick={async () => {
            if (sending) return;

            setSending(true);
            // Replaces this entry, so the message moves to the end once sent.
            await requestSend(draft, { incognito: false, retryOf: entry.id });
            setSending(false);
          }}
        >
          {sending ? <Spinner /> : null}
          Send again
        </Button>
      ) : null}
    </p>
  );
}

/**
 * Messages in this chat, oldest first, a page at a time. Above the draft it
 * ends with today's date; search results end where they end, and pick a
 * message with `onPick`.
 */
export function ChatHistory({
  items,
  delivery,
  botToken,
  now,
  draftBelow,
  onPick,
  focusKey,
}: {
  /** From `useChatItems`, newest first. */
  items: ChatItem[];
  delivery: Settings['delivery'];
  /** Downloads received media, for a chat with your own bot. */
  botToken: string | undefined;
  now: number;
  draftBelow: boolean;
  onPick?: (key: string) => void;
  /** A message picked in search, which must be on the page to scroll to. */
  focusKey?: string | undefined;
}) {
  const [pages, setPages] = useState(1);
  // The chat and search results can both be on the page.
  const dayIds = useId();

  // Enough pages to reach the picked message, however far back it is.
  const target = focusKey
    ? items.findIndex((item) => chatKey(item) === focusKey)
    : -1;

  const shown = Math.max(pages, Math.ceil((target + 1) / PAGE)) * PAGE;

  if (items.length === 0) return null;

  const days = groupByDay(
    items.slice(0, shown).toReversed(),
    (item) => item.time
  );

  const lastDay = days.at(-1)?.[0];

  return (
    <>
      {items.length > shown ? (
        // Older messages go on top; the chat stays where it was scrolled.
        <Button
          variant="service"
          size="xs"
          onClick={() => setPages(shown / PAGE + 1)}
          className="self-center"
        >
          Show older messages
        </Button>
      ) : null}
      {days.map(([day, messages]) => (
        <section
          key={day}
          aria-labelledby={`${dayIds}-${day}`}
          className="flex flex-col gap-3"
        >
          <DayPill day={day} now={now} id={`${dayIds}-${day}`} />
          <ol className="flex flex-col gap-3">
            {messages.map((item) => {
              const key = chatKey(item);

              // Search results pick; the chat's own rows can be scrolled to.
              const row = onPick
                ? {
                    pick: { label: pickLabel(item), onPick: () => onPick(key) },
                  }
                : { id: chatRowId(key) };

              return item.direction === 'out' ? (
                <SentMessage
                  key={key}
                  entry={item.entry}
                  delivery={delivery}
                  footer={
                    item.entry.status === 'failed' ? (
                      <SendAgain entry={item.entry} />
                    ) : undefined
                  }
                  {...row}
                />
              ) : (
                <ReceivedMessage
                  key={key}
                  message={item.message}
                  token={botToken}
                  {...row}
                />
              );
            })}
          </ol>
        </section>
      ))}
      {/* The draft is today's, even when the last message is older. */}
      {draftBelow && lastDay !== dayKey(now) ? (
        <DayPill day={now} now={now} />
      ) : null}
    </>
  );
}
