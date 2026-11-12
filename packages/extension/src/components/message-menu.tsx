import {
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Link01Icon,
  RepeatIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import type { ChatItem } from '@/hooks/use-chat-items';
import { useQueued } from '@/hooks/use-queue';
import {
  deleteCopy,
  deleteMessages,
  type TelegramDeletion,
  telegramDeletion,
} from '@/lib/chat-actions';
import { draftFromEntry, requestSend } from '@/lib/client';
import { isHttpUrl, messageText } from '@/lib/compose';
import type {
  Destination,
  HistoryEntry,
  InboxEntry,
  Settings,
} from '@/lib/settings';

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast('Copied'),
    () => toast.error('Couldn’t copy. Select the text and copy it yourself.')
  );
}

function open(url: string) {
  void browser.tabs.create({ url });
}

/** Deletes from this browser only, saying why Telegram keeps a sent one. */
function remove(item: ChatItem, why: TelegramDeletion | undefined) {
  // A failed send that never reached Telegram leaves nothing there.
  const unsent =
    item.direction === 'out' &&
    item.entry.status === 'failed' &&
    !item.entry.telegram;

  void deleteMessages([item]).then(() =>
    toast(
      'Deleted from this browser',
      unsent
        ? {}
        : {
            description:
              why && !why.can ? deleteCopy[why.why] : deleteCopy.kept,
          }
    )
  );
}

export function MenuItem({
  icon,
  onClick,
  destructive = false,
  children,
}: {
  icon: typeof Copy01Icon;
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <ContextMenuItem
      variant={destructive ? 'destructive' : 'default'}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.8} />
      {children}
    </ContextMenuItem>
  );
}

function SentItems({
  entry,
  delivery,
}: {
  entry: HistoryEntry;
  delivery: Settings['delivery'];
}) {
  const draft = draftFromEntry(entry);
  const waiting = useQueued()(entry.id) !== undefined;
  const text = draft ? messageText(draft, delivery) : '';
  const link = entry.content?.url ?? entry.content?.pageUrl;
  const pageUrl = entry.content?.pageUrl;

  return (
    <>
      {text ? (
        <MenuItem icon={Copy01Icon} onClick={() => copy(text)}>
          Copy text
        </MenuItem>
      ) : null}
      {link ? (
        <MenuItem icon={Link01Icon} onClick={() => copy(link)}>
          Copy link
        </MenuItem>
      ) : null}
      {isHttpUrl(pageUrl) ? (
        <MenuItem icon={ArrowUpRight01Icon} onClick={() => open(pageUrl)}>
          Open page
        </MenuItem>
      ) : null}
      {draft ? (
        <MenuItem
          icon={RepeatIcon}
          onClick={async () => {
            // A failed message is replaced; a sent one stays, with a copy after it.
            const outcome = await requestSend(draft, {
              incognito: false,
              ...(entry.status === 'failed' && { retryOf: entry.id }),
            });

            if (outcome.ok) toast.success(`Sent to ${outcome.destination}`);
            else if (outcome.queued) toast(outcome.message);
            else toast.error(outcome.message);
          }}
        >
          {waiting ? 'Send now' : 'Send again'}
        </MenuItem>
      ) : null}
    </>
  );
}

function ReceivedItems({ message }: { message: InboxEntry }) {
  const { text } = message;
  const link = message.links?.[0]?.url;

  return (
    <>
      {text ? (
        <MenuItem icon={Copy01Icon} onClick={() => copy(text)}>
          Copy text
        </MenuItem>
      ) : null}
      {link ? (
        <MenuItem icon={ArrowUpRight01Icon} onClick={() => open(link)}>
          Open link
        </MenuItem>
      ) : null}
    </>
  );
}

/** What a right-click on a message in the chat offers, as in Telegram. */
export function MessageMenu({
  item,
  delivery,
  destinations,
  now,
  onSelect,
  onAskDelete,
}: {
  item: ChatItem;
  delivery: Settings['delivery'];
  /** Finds the bot that can delete a sent message in Telegram. */
  destinations: Destination[];
  now: number;
  /** Starts selecting messages, with this one selected. */
  onSelect: () => void;
  /** Asks whether to delete it in Telegram too; the menu can't hold the dialog. */
  onAskDelete: () => void;
}) {
  const deletion =
    item.direction === 'out'
      ? telegramDeletion(item.entry, destinations, now)
      : undefined;

  return (
    <ContextMenuContent>
      {item.direction === 'out' ? (
        <SentItems entry={item.entry} delivery={delivery} />
      ) : (
        <ReceivedItems message={item.message} />
      )}
      <MenuItem icon={CheckmarkCircle02Icon} onClick={onSelect}>
        Select
      </MenuItem>
      <ContextMenuSeparator />
      {/* A message only this browser keeps goes at once, as before. */}
      <MenuItem
        icon={Delete02Icon}
        destructive
        onClick={() => (deletion?.can ? onAskDelete() : remove(item, deletion))}
      >
        Delete
      </MenuItem>
    </ContextMenuContent>
  );
}
