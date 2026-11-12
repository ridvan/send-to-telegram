import {
  type Chat,
  type ChatId,
  createBotClient,
  type IncomingMessage,
  type MessageEntity,
  type PhotoSize,
  TelegramError,
  type Update,
} from '@send-to-telegram/core';

import { BOT_UPDATES, topicIdOf } from './bot-setup.ts';
import { isHttpUrl } from './compose.ts';
import {
  type BotDestination,
  type InboxEntry,
  inboxEntrySchema,
  inboxRemovedStore,
  type InboxFile,
  type InboxPicture,
  inboxStore,
  MAX_INBOX,
  settingsStore,
} from './settings.ts';

/** Whether a chat is the one a destination sends to, by ID or @username. */
export function isSameChat(chat: Chat, chatId: ChatId): boolean {
  const id = String(chatId);

  if (id.startsWith('@')) {
    return chat.username?.toLowerCase() === id.slice(1).toLowerCase();
  }

  return chat.id === Number(id);
}

/** Links Telegram found in the text, or ones written behind other words. */
function linksIn(text: string, entities: MessageEntity[] | undefined) {
  return (entities ?? []).flatMap(({ type, offset, length, url }) => {
    const target =
      type === 'text_link'
        ? url
        : type === 'url'
          ? text.slice(offset, offset + length)
          : undefined;

    if (!target) return [];

    // Telegram marks bare domains such as `example.com/page` as links too.
    const absolute = /^[a-z][\w+.-]*:\/\//i.test(target)
      ? target
      : `https://${target}`;

    return isHttpUrl(absolute) ? [{ offset, length, url: absolute }] : [];
  });
}

function toPicture(size: PhotoSize): InboxPicture {
  return {
    id: size.file_id,
    uniqueId: size.file_unique_id ?? size.file_id,
    ...(size.width && { width: size.width }),
    ...(size.height && { height: size.height }),
  };
}

type Playable = NonNullable<IncomingMessage['audio']>;

function toFile(item: Playable): InboxFile {
  return {
    ...toPicture(item),
    ...(item.file_size && { size: item.file_size }),
    ...(item.mime_type && { mimeType: item.mime_type }),
    ...(item.duration && { duration: item.duration }),
    ...(item.thumbnail && { preview: toPicture(item.thumbnail) }),
    ...(item.title && { title: item.title }),
  };
}

/** Wide enough to fill a bubble on a 2x screen without the full photo. */
const PREVIEW_WIDTH = 640;

/** What a message carries besides text, and how to download it. */
export function attachmentOf(
  message: IncomingMessage
): Pick<InboxEntry, 'media' | 'file' | 'fileName'> | undefined {
  const largest = message.photo?.at(-1);

  if (message.photo && largest) {
    const preview =
      message.photo.find((size) => (size.width ?? 0) >= PREVIEW_WIDTH) ??
      largest;

    return {
      media: 'photo',
      file: {
        ...toPicture(largest),
        ...(largest.file_size && { size: largest.file_size }),
        preview: toPicture(preview),
      },
    };
  }

  const playables = [
    ['video', message.video],
    ['animation', message.animation],
    ['voice', message.voice],
    ['audio', message.audio],
    ['file', message.document],
  ] as const;

  for (const [media, item] of playables) {
    if (item) {
      return {
        media,
        file: toFile(item),
        ...(item.file_name && { fileName: item.file_name }),
      };
    }
  }

  return undefined;
}

/** The same message's ID however often it's read. */
function entryIdOf(message: IncomingMessage) {
  return `${message.chat.id}:${message.message_id}`;
}

/**
 * What the chat draws for a message, or undefined for one it leaves out:
 * commands, and kinds it can't show, such as a member joining or a poll.
 */
export function toInboxEntry(
  message: IncomingMessage,
  destinationId: string,
  now = Date.now()
): InboxEntry | undefined {
  // `/start` and other commands are for the bot, not the conversation.
  const command = message.entities?.some(
    (entity) => entity.type === 'bot_command' && entity.offset === 0
  );

  if (command) return undefined;

  const attachment = attachmentOf(message);
  const written = message.text ?? message.caption;
  const text = written ?? message.sticker?.emoji;

  if (!text && !attachment) return undefined;

  const links = written
    ? linksIn(
        written,
        message.text ? message.entities : message.caption_entities
      )
    : [];

  const group =
    message.chat.type === 'group' || message.chat.type === 'supergroup';

  return {
    id: entryIdOf(message),
    destinationId,
    receivedAt: message.date ? message.date * 1000 : now,
    ...(group && message.from && { from: message.from.first_name }),
    ...(text && { text }),
    ...(links.length > 0 && { links }),
    ...attachment,
  };
}

/**
 * Whether a message belongs to a destination. One with a topic shows what
 * was written in that topic. One without shows the rest of the chat: General,
 * and topics no other destination of the same bot covers, so each message
 * lands in exactly one place and nothing that showed before goes missing.
 */
export function belongsTo(
  message: IncomingMessage,
  destination: BotDestination,
  destinations: readonly BotDestination[]
): boolean {
  if (!isSameChat(message.chat, destination.chatId)) return false;

  const topic = topicIdOf(message);

  if (destination.topic) return destination.topic.id === topic;

  if (topic === undefined) return true;

  return !destinations.some(
    (other) =>
      other.topic?.id === topic &&
      other.token === destination.token &&
      isSameChat(message.chat, other.chatId)
  );
}

/**
 * Messages for a destination, from a batch of updates; `destinations` are all
 * of them, so topics with their own go there. Channel posts are left out: a
 * channel isn't written to the bot, and its admin bot can get its own posts
 * back, which would show what you sent twice.
 */
export function inboxEntriesIn(
  updates: Update[],
  destination: BotDestination,
  destinations: readonly BotDestination[] = [destination]
): InboxEntry[] {
  return updates.flatMap((update) => {
    const message = update.message;

    if (!message || !belongsTo(message, destination, destinations)) return [];

    const entry = toInboxEntry(message, destination.id);

    return entry ? [entry] : [];
  });
}

/** Messages a read saw, and the destinations it filed them for. */
type Read = {
  messageIds: ReadonlySet<string>;
  destinationIds: ReadonlySet<string>;
};

/**
 * Adds new messages and replaces ones that read differently now, such as a
 * photo kept before media could be shown. Messages deleted from this browser
 * stay out, even when a read that started before the delete brings one back.
 * With `read`, a message it saw that none of its destinations claims now is
 * dropped from them, such as one kept for a topic the chat has moved from.
 * Writes nothing when all match.
 */
export async function keep(entries: InboxEntry[], read?: Read) {
  const [inbox, removedList] = await Promise.all([
    inboxStore.get(),
    inboxRemovedStore.get(),
  ]);

  const removed = new Set(removedList.map((item) => item.id));
  const claimed = new Set(entries.map((entry) => entry.id));

  const unclaimed = (entry: InboxEntry) =>
    read !== undefined &&
    read.destinationIds.has(entry.destinationId) &&
    read.messageIds.has(entry.id) &&
    !claimed.has(entry.id);

  const stored = new Map(
    inbox.map((entry) => [entry.id, JSON.stringify(entry)])
  );

  // Parsed like stored entries, so the keys come out in the same order.
  const changed = entries.flatMap((fresh) => {
    const entry = inboxEntrySchema.parse(fresh);

    return removed.has(entry.id) ||
      stored.get(entry.id) === JSON.stringify(entry)
      ? []
      : [entry];
  });

  const dropped = inbox.some(
    (entry) => removed.has(entry.id) || unclaimed(entry)
  );

  if (changed.length === 0 && !dropped) return;

  const replaced = new Set(changed.map((entry) => entry.id));

  await inboxStore.set(
    [
      ...changed,
      ...inbox.filter(
        (entry) =>
          !replaced.has(entry.id) && !removed.has(entry.id) && !unclaimed(entry)
      ),
    ]
      .toSorted((a, b) => b.receivedAt - a.receivedAt)
      .slice(0, MAX_INBOX)
  );
}

/**
 * `elsewhere` when Telegram hands this bot's updates to someone else: a
 * webhook, or another app reading them right now.
 */
export type InboxCheck = 'ok' | 'elsewhere';

/**
 * Reads what was sent to the bot in a destination's chat, or its topic, and
 * keeps it. Like
 * `findChats`, it never confirms updates, so the bot's other clients still
 * get them; Telegram holds them for 24 hours and returns the oldest 100.
 */
export async function checkInbox(
  destination: BotDestination,
  signal: AbortSignal
): Promise<InboxCheck> {
  const bot = createBotClient(destination.token, (input, init) =>
    fetch(input, { ...init, signal })
  );

  try {
    const updates = await bot.call('getUpdates', {
      allowed_updates: BOT_UPDATES,
    });

    // Chats as they are now: one moved to another topic or removed while
    // Telegram answered has had its messages dropped, and would get them back.
    const { destinations } = await settingsStore.get();
    const current = destinations.find((each) => each.id === destination.id);

    if (!current) return 'ok';

    // One read covers every topic of this chat, so a message moves to a topic
    // added since as soon as either is opened.
    const sharing = [
      current,
      ...destinations.filter(
        (other) =>
          other.id !== current.id &&
          other.token === current.token &&
          String(other.chatId) === String(current.chatId)
      ),
    ];

    await keep(
      sharing.flatMap((each) => inboxEntriesIn(updates, each, sharing)),
      {
        messageIds: new Set(
          updates.flatMap(({ message }) =>
            message ? [entryIdOf(message)] : []
          )
        ),
        destinationIds: new Set(sharing.map((each) => each.id)),
      }
    );

    return 'ok';
  } catch (cause) {
    if (cause instanceof TelegramError && cause.code === 409) {
      return 'elsewhere';
    }

    throw cause;
  }
}
