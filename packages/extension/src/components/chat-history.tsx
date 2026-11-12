import { type ReactNode, useId, useState } from 'react';

import { announceDeletion } from '@/components/announce-deletion';
import { DeleteDialog } from '@/components/delete-dialog';
import { MessageMenu } from '@/components/message-menu';
import { ReceivedMessage, SentMessage } from '@/components/message-preview';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type ChatItem, chatKey } from '@/hooks/use-chat-items';
import { draftFromEntry, requestSend } from '@/lib/client';
import { dayKey, entryTitle, formatDay, groupByDay } from '@/lib/format';
import { deleteMessages } from '@/lib/chat-actions';
import { chatRowId } from '@/lib/reveal';
import type { Destination, HistoryEntry, Settings } from '@/lib/settings';

/** A day or two of messages at a time, so the popup opens fast. */
const PAGE = 40;

/** A message's start, for screen readers to tell it apart. */
function describe(item: ChatItem) {
  const text =
    item.direction === 'out'
      ? entryTitle(item.entry)
      : (item.message.text ?? item.message.fileName ?? item.message.media);

  return text && text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function label(action: string, item: ChatItem) {
  const text = describe(item);

  return text ? `${action}: ${text}` : action;
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
  destinations,
  botToken,
  now,
  draftBelow,
  intro,
  onPick,
  select,
  focusKey,
}: {
  /** From `useChatItems`, newest first. */
  items: ChatItem[];
  delivery: Settings['delivery'];
  /** Finds the bot that can delete a sent message in Telegram. */
  destinations: Destination[];
  /** Downloads received media, for a chat with your own bot. */
  botToken: string | undefined;
  now: number;
  draftBelow: boolean;
  /** Where the chat begins, above its oldest message once that's shown. */
  intro?: ReactNode;
  /** Set while searching: a message is picked, not used. */
  onPick?: ((key: string) => void) | undefined;
  /**
   * Selecting messages: the keys checked and how one is toggled. Without it,
   * a message's menu starts selecting with `onStart`.
   */
  select: {
    selected: ReadonlySet<string> | undefined;
    onToggle: (key: string) => void;
    onStart: (key: string) => void;
  };
  /** A message picked in search, which must be on the page to scroll to. */
  focusKey?: string | undefined;
}) {
  const [pages, setPages] = useState(1);
  // A sent message whose menu asked to delete it, held outside the menu.
  const [deleting, setDeleting] = useState<ChatItem>();
  // The chat and search results can both be on the page.
  const dayIds = useId();

  // Enough pages to reach the picked message, however far back it is.
  const target = focusKey
    ? items.findIndex((item) => chatKey(item) === focusKey)
    : -1;

  const shown = Math.max(pages, Math.ceil((target + 1) / PAGE)) * PAGE;

  if (items.length === 0) return intro ?? null;

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
      ) : (
        intro
      )}
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

              // Rows can be scrolled to. While searching they're picked, and
              // while selecting they're checked, instead of used. The menu
              // stays mounted either way, so one closing can finish.
              const row = {
                id: chatRowId(key),
                menu: (
                  <MessageMenu
                    item={item}
                    delivery={delivery}
                    destinations={destinations}
                    now={now}
                    onSelect={() => select.onStart(key)}
                    onAskDelete={() => setDeleting(item)}
                  />
                ),
                ...(onPick
                  ? {
                      pick: {
                        label: label('Show in chat', item),
                        onPick: () => onPick(key),
                      },
                    }
                  : select.selected && {
                      select: {
                        selected: select.selected.has(key),
                        label: label('Select', item),
                        onToggle: () => select.onToggle(key),
                      },
                    }),
              };

              return item.direction === 'out' ? (
                <SentMessage
                  key={key}
                  entry={item.entry}
                  delivery={delivery}
                  token={botToken}
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
      <DeleteDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
        count={1}
        deletable={1}
        onConfirm={async (inTelegram) => {
          if (!deleting) return;

          announceDeletion(await deleteMessages([deleting], { inTelegram }), 1);
        }}
      />
      {/* The draft is today's, even when the last message is older. */}
      {draftBelow && lastDay !== dayKey(now) ? (
        <DayPill day={now} now={now} />
      ) : null}
    </>
  );
}
