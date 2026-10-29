import {
  type Chat,
  type ChatId,
  createBotClient,
  TelegramError,
  type Update,
} from '@send-to-telegram/core';

import { failureCopy, toSendFailure } from './failure.ts';

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

function chatsIn(update: Update): Chat[] {
  const chats: Chat[] = [];

  if (update.message) chats.push(update.message.chat);

  if (update.channel_post) chats.push(update.channel_post.chat);

  // A bot added to a group reports it here even before anyone writes.
  if (
    update.my_chat_member &&
    update.my_chat_member.new_chat_member.status !== 'left' &&
    update.my_chat_member.new_chat_member.status !== 'kicked'
  ) {
    chats.push(update.my_chat_member.chat);
  }

  return chats;
}

/**
 * Telegram remembers the last list a bot asked for, so every read passes the
 * same one; `my_chat_member` reports groups the bot joined before anyone wrote.
 */
export const BOT_UPDATES = ['message', 'channel_post', 'my_chat_member'];

export type ChatLookup =
  | { status: 'ok'; chats: Chat[] }
  /** The bot has a webhook, so Telegram keeps its updates from us. */
  | { status: 'webhook' };

/**
 * Lists chats that recently wrote to the bot, newest first. Updates are only
 * read, never confirmed, so a webhook or other client still receives them.
 */
export async function findChats(token: string): Promise<ChatLookup> {
  try {
    const updates = await createBotClient(token).call('getUpdates', {
      allowed_updates: BOT_UPDATES,
    });

    const byId = new Map<number, Chat>();

    for (const update of updates.toReversed()) {
      for (const chat of chatsIn(update)) {
        if (!byId.has(chat.id)) byId.set(chat.id, chat);
      }
    }

    return { status: 'ok', chats: [...byId.values()] };
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

export async function sendTestMessage(token: string, chatId: ChatId) {
  try {
    await createBotClient(token).call('sendMessage', {
      chat_id: chatId,
      text: TEST_MESSAGE,
      disable_notification: true,
    });
  } catch (cause) {
    throw toSendFailure(cause);
  }
}
