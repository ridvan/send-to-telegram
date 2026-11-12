import {
  type Chat,
  type ChatId,
  createBotClient,
  type IncomingMessage,
  TelegramError,
  type Update,
} from '@send-to-telegram/core';

import { failureCopy, toSendFailure } from './failure.ts';
import type { Topic } from './settings.ts';

export const TEST_MESSAGE =
  'Connected. Anything you send from your browser will arrive here.';

/** Checks the token with Telegram and returns the bot's public username. */
export async function verifyToken(token: string): Promise<string> {
  try {
    const bot = await createBotClient(token).call('getMe', undefined);

    return bot.username ?? bot.first_name;
  } catch (cause) {
    if (cause instanceof TelegramError && cause.code === 401) {
      throw new Error(
        'Telegram doesn’t recognize this token. Copy it again from BotFather.',
        { cause }
      );
    }

    throw new Error(failureCopy.network, { cause });
  }
}

/** A chat that wrote to the bot, or one topic of a forum group. */
export type FoundChat = { chat: Chat; topic?: Topic };

/** Where a message was written: its topic, or the chat itself for General. */
export function topicIdOf(message: IncomingMessage): number | undefined {
  return message.is_topic_message ? message.message_thread_id : undefined;
}

/**
 * Bots can't list a forum's topics, so names come from what Telegram sends
 * along: the message that created a topic, one that renamed it, or the
 * creating message that topic messages carry as their reply. Later updates
 * win, so a rename shows.
 */
export function topicNamesIn(updates: Update[]): Map<string, string> {
  const names = new Map<string, string>();

  for (const { message } of updates) {
    const topic = message && topicIdOf(message);

    if (!message || topic === undefined) continue;

    const key = `${message.chat.id}:${topic}`;

    const named =
      message.forum_topic_edited?.name ?? message.forum_topic_created?.name;

    if (named) {
      names.set(key, named);
      continue;
    }

    // The creating message holds the first name, not a later rename.
    const first =
      message.reply_to_message?.message_id === topic
        ? message.reply_to_message.forum_topic_created?.name
        : undefined;

    if (first && !names.has(key)) names.set(key, first);
  }

  return names;
}

function chatsIn(update: Update): FoundChat[] {
  const chats: FoundChat[] = [];

  if (update.message) {
    const topic = topicIdOf(update.message);

    chats.push({
      chat: update.message.chat,
      ...(topic !== undefined && { topic: { id: topic } }),
    });
  }

  if (update.channel_post) chats.push({ chat: update.channel_post.chat });

  // A bot added to a group reports it here even before anyone writes.
  if (
    update.my_chat_member &&
    update.my_chat_member.new_chat_member.status !== 'left' &&
    update.my_chat_member.new_chat_member.status !== 'kicked'
  ) {
    chats.push({ chat: update.my_chat_member.chat });
  }

  return chats;
}

/** Tells chats and their topics apart, as destinations do. */
export function foundChatKey({ chat, topic }: FoundChat): string {
  return topic ? `${chat.id}:${topic.id}` : String(chat.id);
}

/**
 * Telegram remembers the last list a bot asked for, so every read passes the
 * same one; `my_chat_member` reports groups the bot joined before anyone wrote.
 */
export const BOT_UPDATES = ['message', 'channel_post', 'my_chat_member'];

export type ChatLookup =
  | { status: 'ok'; chats: FoundChat[] }
  /** The bot has a webhook, so Telegram keeps its updates from us. */
  | { status: 'webhook' };

/**
 * Lists chats, and topics in forum groups, that recently wrote to the bot,
 * newest first. Updates are only read, never confirmed, so a webhook or
 * other client still receives them.
 */
export async function findChats(token: string): Promise<ChatLookup> {
  try {
    const updates = await createBotClient(token).call('getUpdates', {
      allowed_updates: BOT_UPDATES,
    });

    const names = topicNamesIn(updates);
    const byKey = new Map<string, FoundChat>();

    for (const update of updates.toReversed()) {
      for (const found of chatsIn(update)) {
        const key = foundChatKey(found);
        const name = names.get(key);

        if (byKey.has(key)) continue;

        byKey.set(
          key,
          found.topic && name
            ? { ...found, topic: { ...found.topic, name } }
            : found
        );
      }
    }

    return { status: 'ok', chats: [...byKey.values()] };
  } catch (cause) {
    if (cause instanceof TelegramError && cause.code === 409) {
      return { status: 'webhook' };
    }

    throw toSendFailure(cause);
  }
}

/** Looks up a chat entered by hand, which also proves the bot can reach it. */
export async function lookUpChat(token: string, chatId: ChatId): Promise<Chat> {
  try {
    return await createBotClient(token).call('getChat', { chat_id: chatId });
  } catch (cause) {
    if (cause instanceof TelegramError && cause.code === 400) {
      throw new Error(
        'The bot can’t find this chat. Send the bot a message there first, or add it to the group.',
        { cause }
      );
    }

    throw toSendFailure(cause);
  }
}

/** Proves the bot can post there; to a topic, when one is given. */
export async function sendTestMessage(
  token: string,
  chatId: ChatId,
  topic?: number
) {
  try {
    await createBotClient(token).call('sendMessage', {
      chat_id: chatId,
      ...(topic !== undefined && { message_thread_id: topic }),
      text: TEST_MESSAGE,
      disable_notification: true,
    });
  } catch (cause) {
    throw toSendFailure(cause);
  }
}

export type TopicLink =
  | { ok: true; id: number }
  | { ok: false; message: string };

/**
 * Reads a topic from its link, as Telegram copies it (`t.me/c/123/42` or
 * `t.me/group/42`, or a message link in it with one more number), or from
 * the bare number. For when the bot can't see the topic's messages.
 */
export function parseTopicLink(input: string, chatId: ChatId): TopicLink {
  const text = input.trim();

  const invalid = {
    ok: false,
    message: 'Paste a link like https://t.me/c/1234567890/42, or the number.',
  } as const;

  if (/^\d+$/.test(text)) {
    const id = Number(text);

    return id > 0 ? { ok: true, id } : invalid;
  }

  const match =
    /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:c\/(\d+)|(\w{4,}))\/(\d+)(?:\/\d+)?\/?(?:\?.*)?$/i.exec(
      text
    );

  if (!match?.[3]) return invalid;

  const [, internal, username, thread] = match;
  const chat = String(chatId);

  const elsewhere = internal
    ? /^-?\d+$/.test(chat) && chat !== `-100${internal}`
    : chat.startsWith('@') &&
      chat.slice(1).toLowerCase() !== username?.toLowerCase();

  if (elsewhere) {
    return {
      ok: false,
      message: 'This link is to another group. Copy the link from this one.',
    };
  }

  const id = Number(thread);

  return id > 0 ? { ok: true, id } : invalid;
}
