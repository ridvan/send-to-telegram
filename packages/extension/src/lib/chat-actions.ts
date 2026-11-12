import {
  type ChatId,
  botIdOf,
  createBotClient,
  TelegramError,
} from '@send-to-telegram/core';

import type { ChatItem } from '../hooks/use-chat-items.ts';
import { failureCopy } from './failure.ts';
import {
  type Destination,
  type HistoryEntry,
  historyStore,
  INBOX_REMOVED_FOR,
  type InboxFile,
  type InboxRemoved,
  inboxRemovedStore,
  inboxStore,
  MAX_INBOX_REMOVED,
  settingsStore,
  type TelegramRef,
} from './settings.ts';
import { forgetFiles } from './telegram-files.ts';
import { lockState, touchSession } from './vault.ts';

/** Telegram lets bots delete a message for 48 hours after it was sent. */
export const TELEGRAM_DELETE_FOR = 48 * 60 * 60 * 1000;

/**
 * Stops offering a little before that: `sentAt` is taken once Telegram has
 * the message, a long text's first part went earlier, and clocks drift.
 */
const DELETE_MARGIN = 5 * 60_000;

/** `deleteMessages` takes 1 to 100 messages of one chat. */
const DELETE_BATCH = 100;

/**
 * `deleteMessages` answers true whether or not each message went: one already
 * gone, or one Telegram won't delete, is skipped without a word. Only
 * `deleteMessage` says a message stayed, so up to this many in a chat go one
 * call each. A larger selection goes in batches, taken at Telegram's word.
 */
const SINGLY_UP_TO = 10;

export const deleteCopy = {
  too_old:
    'Telegram lets bots delete messages for 48 hours only, so it stays there.',
  no_chat: 'Its chat is no longer connected, so it stays in Telegram.',
  kept: 'The message stays in Telegram.',
  locked:
    'Send to Telegram is locked. Unlock it with your password, then delete again.',
  refused:
    'It’s over 48 hours old, or the bot can no longer delete in this chat.',
  undo_refused:
    'The bot isn’t allowed to delete messages in this chat. Delete it in Telegram instead.',
  chat_unavailable:
    'The bot is no longer in this chat. Add it back to delete there.',
  rate_limited: 'Telegram is limiting the bot. Try again in a few seconds.',
} as const;

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
 * The connected chat that can delete a message: the same bot in the same
 * chat, whatever topic. Prefers the one it was sent from.
 */
function holderOf(
  ref: TelegramRef,
  destinations: Destination[],
  preferredId?: string
): Destination | undefined {
  const matches = destinations.filter(
    (destination) =>
      botIdOf(destination.token) === ref.botId &&
      String(destination.chatId) === String(ref.chatId)
  );

  return (
    matches.find((destination) => destination.id === preferredId) ?? matches[0]
  );
}

export type TelegramDeletion =
  | { can: true; destination: Destination; ref: TelegramRef }
  /** Names its copy in `deleteCopy`. */
  | { can: false; why: 'too_old' | 'no_chat' | 'kept' };

/**
 * Whether a sent message can be deleted in Telegram too. Entries kept before
 * their IDs were, and failed ones, can only be removed here.
 */
export function telegramDeletion(
  entry: HistoryEntry,
  destinations: Destination[],
  now: number
): TelegramDeletion {
  const ref = entry.telegram;

  if (entry.status !== 'sent' || !ref) return { can: false, why: 'kept' };

  if (now - entry.sentAt >= TELEGRAM_DELETE_FOR - DELETE_MARGIN) {
    return { can: false, why: 'too_old' };
  }

  const destination = holderOf(ref, destinations, entry.destinationId);

  return destination
    ? { can: true, destination, ref }
    : { can: false, why: 'no_chat' };
}

/** The sent messages among these that can be deleted in Telegram too. */
export function deletableInTelegram(
  items: ChatItem[],
  destinations: Destination[],
  now: number
): number {
  return items.filter(
    (item) =>
      item.direction === 'out' &&
      telegramDeletion(item.entry, destinations, now).can
  ).length;
}

/**
 * Why Telegram didn't delete, as copy that says what to do. Undefined when
 * the message is gone anyway: Telegram says so when it was already deleted.
 */
export function deleteFailure(cause: unknown): string | undefined {
  if (!(cause instanceof TelegramError) || cause.code === 0) {
    return failureCopy.network;
  }

  if (/message to delete not found/i.test(cause.message)) return undefined;

  if (cause.code === 401) return failureCopy.bot_unauthorized;

  if (cause.code === 403 || /chat not found/i.test(cause.message)) {
    return deleteCopy.chat_unavailable;
  }

  if (cause.code === 429) return deleteCopy.rate_limited;

  if (/can.t be deleted/i.test(cause.message)) return deleteCopy.refused;

  return `Telegram didn’t delete it: ${cause.message.replace(/^Bad Request: /, '')}`;
}

/** One sent message to delete in Telegram, with the bot that can. */
export type Doomed = { id: string; token: string; ref: TelegramRef };

/** Whole entries, never one split across calls, up to the batch size each. */
function batches(doomed: Doomed[]): Doomed[][] {
  const groups: Doomed[][] = [];
  let current: Doomed[] = [];
  let size = 0;

  for (const item of doomed) {
    const count = item.ref.messageIds.length;

    if (current.length > 0 && size + count > DELETE_BATCH) {
      groups.push(current);
      current = [];
      size = 0;
    }

    current.push(item);
    size += count;
  }

  if (current.length > 0) groups.push(current);

  return groups;
}

function deleteIn(token: string, chatId: ChatId, items: Doomed[]) {
  return createBotClient(token).call('deleteMessages', {
    chat_id: chatId,
    message_ids: items.flatMap((item) => item.ref.messageIds),
  });
}

/** Whether a failure is about one message, not the bot or the chat. */
function isAboutMessage(cause: unknown, why: string): boolean {
  return (
    cause instanceof TelegramError &&
    cause.code === 400 &&
    why !== deleteCopy.chat_unavailable
  );
}

/**
 * Deletes a chat's messages one call each, so Telegram says which stayed. A
 * failure about the bot or the chat ends it: the rest would fail the same.
 */
async function removeSingly(items: Doomed[], failures: Map<string, string>) {
  for (const [index, item] of items.entries()) {
    for (const messageId of item.ref.messageIds) {
      try {
        await createBotClient(item.token).call('deleteMessage', {
          chat_id: item.ref.chatId,
          message_id: messageId,
        });
      } catch (cause) {
        const why = deleteFailure(cause);

        // Already gone.
        if (why === undefined) continue;

        if (!isAboutMessage(cause, why)) {
          for (const rest of items.slice(index)) failures.set(rest.id, why);

          return;
        }

        failures.set(item.id, why);
        break;
      }
    }
  }
}

function messageCount(items: Doomed[]): number {
  return items.reduce((sum, item) => sum + item.ref.messageIds.length, 0);
}

/**
 * Deletes messages in Telegram, a chat at a time, one call after another to
 * stay under its limits: a few messages one by one, so each refusal is known,
 * and a large selection in batches. A batch Telegram refuses is tried again a
 * message at a time, so only the ones it won't delete stay. Returns why, by
 * `id`, for each one it kept.
 */
export async function removeFromTelegram(
  doomed: Doomed[],
  /** One call each whatever the count: for an undo, which must know. */
  { singly = false } = {}
): Promise<Map<string, string>> {
  const failures = new Map<string, string>();
  const chats = new Map<string, Doomed[]>();

  for (const item of doomed) {
    const key = `${item.token}\n${String(item.ref.chatId)}`;

    chats.set(key, [...(chats.get(key) ?? []), item]);
  }

  for (const items of chats.values()) {
    if (singly || messageCount(items) <= SINGLY_UP_TO) {
      await removeSingly(items, failures);
      continue;
    }

    for (const batch of batches(items)) {
      const [first] = batch;

      if (!first) continue;

      try {
        await deleteIn(first.token, first.ref.chatId, batch);
        continue;
      } catch (cause) {
        const why = deleteFailure(cause);

        // Already gone; in a batch, maybe only some of it was.
        if (why === undefined && batch.length === 1) continue;

        // About the bot or the chat, not the messages: each would fail too.
        const perMessage = why !== undefined && isAboutMessage(cause, why);

        if (why !== undefined && (!perMessage || batch.length === 1)) {
          for (const item of batch) failures.set(item.id, why);

          continue;
        }
      }

      for (const item of batch) {
        try {
          await deleteIn(item.token, item.ref.chatId, [item]);
        } catch (cause) {
          const why = deleteFailure(cause);

          if (why !== undefined) failures.set(item.id, why);
        }
      }
    }
  }

  return failures;
}

/** Writes each store once, however many messages go. */
async function removeHere(items: ChatItem[], now: number) {
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

export type DeleteOutcome = {
  /** Sent messages deleted in Telegram as well as here. */
  inTelegram: number;
  /** Messages Telegram refused to delete, left here so none goes silently. */
  kept: ChatItem[];
  /** Why they were kept, and what to do. */
  problem?: string;
  /** Nothing was deleted anywhere: the lock closed first. */
  locked?: true;
};

/**
 * Deletes messages from this browser and, with `inTelegram`, the sent ones
 * that still can be from Telegram too. Received messages stay in Telegram:
 * deleting what someone else wrote is theirs to do. A message Telegram
 * won't delete stays here, so the chat never shows it gone when it isn't.
 */
export async function deleteMessages(
  items: ChatItem[],
  { inTelegram = false, now = Date.now() } = {}
): Promise<DeleteOutcome> {
  const sent = items.flatMap((item) =>
    item.direction === 'out' ? [item.entry] : []
  );

  if (!inTelegram || sent.length === 0) {
    await removeHere(items, now);

    return { inTelegram: 0, kept: [] };
  }

  // Deleting counts as using the extension, for auto-lock, as sending does.
  await touchSession();

  // The bots' tokens can't be read.
  if ((await lockState()) === 'locked') {
    return { inTelegram: 0, kept: items, locked: true };
  }

  const { destinations } = await settingsStore.get();

  const doomed = sent.flatMap((entry): Doomed[] => {
    const deletion = telegramDeletion(entry, destinations, now);

    return deletion.can
      ? [{ id: entry.id, token: deletion.destination.token, ref: deletion.ref }]
      : [];
  });

  const failures = await removeFromTelegram(doomed);

  const kept = items.filter(
    (item) => item.direction === 'out' && failures.has(item.entry.id)
  );

  await removeHere(
    items.filter((item) => !kept.includes(item)),
    now
  );

  const [problem] = failures.values();

  return {
    inTelegram: doomed.length - failures.size,
    kept,
    ...(problem && { problem }),
  };
}

/** What a send hands back to undo it: its messages, and its entry if kept. */
export type SentMessages = TelegramRef & { entryId?: string | undefined };

/**
 * Deletes what was just sent from Telegram, then its history entry. Returns
 * why when Telegram kept it, and leaves the entry so the chat says so.
 */
export async function undoSend(
  sent: SentMessages
): Promise<string | undefined> {
  await touchSession();

  if ((await lockState()) === 'locked') return deleteCopy.locked;

  const { destinations } = await settingsStore.get();
  const destination = holderOf(sent, destinations);

  if (!destination) return deleteCopy.no_chat;

  const failures = await removeFromTelegram(
    [{ id: 'undo', token: destination.token, ref: sent }],
    { singly: true }
  );

  const problem = failures.get('undo');

  // Seconds old, so age isn't why.
  if (problem === deleteCopy.refused) return deleteCopy.undo_refused;

  if (problem) return problem;

  const entry = sent.entryId
    ? (await historyStore.get()).find((item) => item.id === sent.entryId)
    : undefined;

  if (entry) {
    await removeHere(
      [{ direction: 'out', time: entry.sentAt, entry }],
      Date.now()
    );
  }

  return undefined;
}
