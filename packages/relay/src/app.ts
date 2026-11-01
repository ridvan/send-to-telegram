import {
  type BotClient,
  type Chat,
  chatTitle,
  DEVICE_TOKEN_PATTERN,
  deliver,
  type DeviceStatus,
  outgoingMessageSchema,
  type Pairing,
  pairingRequestSchema,
  type RelayErrorCode,
  type RelayInfo,
  TelegramError,
  type Update,
  updateSchema,
} from '@send-to-telegram/core';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { pairingCode, sha256, WEBHOOK_SECRET_PATTERN } from './crypto.ts';
import type { Device, DeviceStore } from './store.ts';

export const RELAY_VERSION = '2.0.0';

/** How long a pairing link works; the extension tells people the same. */
export const PAIRING_TTL = 10 * 60_000;

export type Deps = {
  store: DeviceStore;
  bot: BotClient;
  botUsername: string;
  webhookSecret: string;
  /** False when the caller is over the limit for this kind of request. */
  allow: (
    limiter: 'send' | 'pair' | 'chat' | 'command',
    key: string
  ) => Promise<boolean>;
  now: () => number;
};

type AppEnv = { Bindings: Env; Variables: { deps: Deps } };

type AppContext = Context<AppEnv>;

function fail(
  c: AppContext,
  status: ContentfulStatusCode,
  code: RelayErrorCode,
  message: string
) {
  return c.json({ error: { code, message } }, status);
}

const unauthorized = (c: AppContext) =>
  fail(
    c,
    401,
    'unauthorized',
    'This browser isn’t linked. Connect it again from the extension.'
  );

async function tokenHashOf(c: AppContext): Promise<string | undefined> {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  return DEVICE_TOKEN_PATTERN.test(token) ? sha256(token) : undefined;
}

/**
 * Who a per-address limit counts against. An IPv6 address counts as its /64,
 * the block one connection usually gets, so cycling addresses inside it
 * doesn't reset the limit.
 */
export function clientKey(ip: string) {
  if (!ip.includes(':')) return ip;

  const [head = '', tail] = ip.toLowerCase().split('::');
  const groups = head ? head.split(':') : [];

  if (tail !== undefined) {
    const rest = tail ? tail.split(':') : [];

    groups.push(...Array<string>(8 - groups.length - rest.length).fill('0'));
    groups.push(...rest);
  }

  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16));

  return `${prefix.map((group) => group.toString(16)).join(':')}::/64`;
}

/** Room for the longest message the extension sends, in any script. */
const MAX_BODY_BYTES = 256 * 1024;

async function readJson(c: AppContext) {
  return c.req.json().catch(() => null);
}

const ABOUT =
  'This bot delivers what you send from the Send to Telegram browser extension. Install the extension, choose “Use the Send to Telegram bot” and follow the link it opens.';

/** Splits "/start@MyBot abc" into its command and argument, ignoring commands for other bots. */
export function parseCommand(text: string, botUsername: string) {
  const match = /^\/(\w+)(?:@(\w+))?(?:\s+([\s\S]*))?$/.exec(text.trim());

  if (!match?.[1]) return undefined;

  if (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase()) {
    return undefined;
  }

  return { command: match[1].toLowerCase(), argument: match[3]?.trim() ?? '' };
}

function devicesMessage(devices: Device[]) {
  if (devices.length === 0) {
    return { text: 'No browsers are linked to this chat.' };
  }

  const lines = devices.map((device) => `• ${device.client}`);

  return {
    text: `Linked browsers:\n${lines.join('\n')}`,
    reply_markup: {
      inline_keyboard: devices.map((device) => [
        {
          text: `Unlink ${device.client}`,
          callback_data: `unlink:${device.tokenHash.slice(0, 16)}`,
        },
      ]),
    },
  };
}

async function link(deps: Deps, chat: Chat, code: string) {
  const device = await deps.store.findByCode(code);
  const now = deps.now();

  if (!device || (device.pairingExpiresAt ?? 0) < now) {
    await deps.bot.call('sendMessage', {
      chat_id: chat.id,
      text: 'This link has expired. Open Send to Telegram in your browser and connect again.',
    });

    return;
  }

  await deps.store.link(
    device.tokenHash,
    { id: chat.id, title: chatTitle(chat), type: chat.type },
    now
  );
  await deps.bot.call('sendMessage', {
    chat_id: chat.id,
    text: `${device.client} is connected. Anything you send from it arrives here.\n\nSend /devices to see or unlink connected browsers.`,
  });
}

/** The button's payload: `unlink:` and the first 16 hex digits of a token hash. */
const UNLINK = /^unlink:[0-9a-f]{16}$/;

/** In a group, only admins unlink; anyone in a private chat owns it. */
async function canUnlink(deps: Deps, chat: Chat, userId: number) {
  if (chat.type === 'private') return true;

  const member = await deps.bot.call('getChatMember', {
    chat_id: chat.id,
    user_id: userId,
  });

  return member.status === 'creator' || member.status === 'administrator';
}

export async function handleUpdate(deps: Deps, update: Update) {
  const membership = update.my_chat_member;

  if (
    membership &&
    ['left', 'kicked'].includes(membership.new_chat_member.status)
  ) {
    // Removed from a group or blocked: links to that chat can't deliver anymore.
    await deps.store.removeForChat(membership.chat.id);

    return;
  }

  const callback = update.callback_query;

  if (
    callback &&
    !(callback.data && UNLINK.test(callback.data) && callback.message)
  ) {
    // A button this relay doesn't handle; answer so the client stops waiting.
    await deps.bot.call('answerCallbackQuery', {
      callback_query_id: callback.id,
    });

    return;
  }

  if (callback?.data && callback.message) {
    const chatId = callback.message.chat.id;

    if (!(await canUnlink(deps, callback.message.chat, callback.from.id))) {
      await deps.bot.call('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Only group admins can unlink browsers.',
      });

      return;
    }

    const prefix = callback.data.slice('unlink:'.length);
    const devices = await deps.store.listForChat(chatId);

    const device = devices.find((candidate) =>
      candidate.tokenHash.startsWith(prefix)
    );

    if (device) await deps.store.remove(device.tokenHash);

    await deps.bot.call('answerCallbackQuery', {
      callback_query_id: callback.id,
      text: device ? `Unlinked ${device.client}` : 'Already unlinked',
    });
    await deps.bot.call('editMessageText', {
      chat_id: chatId,
      message_id: callback.message.message_id,
      ...devicesMessage(devices.filter((candidate) => candidate !== device)),
    });

    return;
  }

  const message = update.message;

  if (message?.migrate_to_chat_id) {
    await deps.store.moveChat(message.chat.id, message.migrate_to_chat_id);

    return;
  }

  const parsed = message?.text
    ? parseCommand(message.text, deps.botUsername)
    : undefined;

  if (!message || !parsed) return;

  // Every command answers in the chat, so a group spamming them would spend
  // the bot's message limit; past this one they go unanswered.
  if (!(await deps.allow('command', String(message.chat.id)))) return;

  if (parsed.command === 'start' && parsed.argument) {
    await link(deps, message.chat, parsed.argument);

    return;
  }

  if (parsed.command === 'devices') {
    const devices = await deps.store.listForChat(message.chat.id);

    await deps.bot.call('sendMessage', {
      chat_id: message.chat.id,
      ...devicesMessage(devices),
    });

    return;
  }

  if (parsed.command === 'start' || parsed.command === 'help') {
    await deps.bot.call('sendMessage', {
      chat_id: message.chat.id,
      text: ABOUT,
    });
  }
}

/** Compares in constant time, so response timing doesn't reveal the secret. */
function sameSecret(received: string, expected: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(received);
  const b = encoder.encode(expected);
  let difference = a.byteLength ^ b.byteLength;

  for (const [index, byte] of b.entries()) {
    difference |= (a[index] ?? 0) ^ byte;
  }

  return difference === 0;
}

export function createApp(makeDeps: (env: Env) => Deps) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('deps', makeDeps(c.env));
    await next();
  });

  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        fail(c, 413, 'invalid_request', 'The message is too large to send.'),
    })
  );

  app.use(
    '/v1/*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86_400,
    })
  );

  app.onError((error, c) => {
    // Only the error's kind is logged; requests carry message content.
    console.error('Request failed', error.name);

    return fail(
      c,
      500,
      'telegram_error',
      'The relay couldn’t finish this request. Try again in a moment.'
    );
  });

  app.get('/v1/info', (c) =>
    c.json({
      botUsername: c.var.deps.botUsername,
      version: RELAY_VERSION,
    } satisfies RelayInfo)
  );

  app.post('/v1/pairings', async (c) => {
    const { deps } = c.var;
    const tokenHash = await tokenHashOf(c);

    if (!tokenHash) return unauthorized(c);

    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';

    if (!(await deps.allow('pair', clientKey(ip)))) {
      return fail(
        c,
        429,
        'rate_limited',
        'Too many links in a short time. Try again in a minute.'
      );
    }

    const body = pairingRequestSchema.safeParse(await readJson(c));

    if (!body.success) {
      return fail(
        c,
        400,
        'invalid_request',
        'Name the browser in the “client” field.'
      );
    }

    if (await deps.store.findByToken(tokenHash)) {
      return fail(c, 400, 'invalid_request', 'This token is already in use.');
    }

    const code = pairingCode();
    const expiresAt = deps.now() + PAIRING_TTL;

    await deps.store.createPairing({
      tokenHash,
      client: body.data.client,
      code,
      expiresAt,
      now: deps.now(),
    });

    return c.json(
      { code, botUsername: deps.botUsername, expiresAt } satisfies Pairing,
      201
    );
  });

  app.get('/v1/device', async (c) => {
    const { deps } = c.var;
    const tokenHash = await tokenHashOf(c);

    const device = tokenHash
      ? await deps.store.findByToken(tokenHash)
      : undefined;

    if (!device) return unauthorized(c);

    if (device.chatId === null || !device.chatType) {
      const expiresAt = device.pairingExpiresAt ?? 0;

      if (expiresAt < deps.now()) {
        await deps.store.remove(device.tokenHash);

        return unauthorized(c);
      }

      return c.json({ status: 'pending', expiresAt } satisfies DeviceStatus);
    }

    return c.json({
      status: 'linked',
      chat: { title: device.chatTitle ?? 'Telegram', type: device.chatType },
    } satisfies DeviceStatus);
  });

  app.delete('/v1/device', async (c) => {
    const tokenHash = await tokenHashOf(c);

    if (!tokenHash) return unauthorized(c);

    await c.var.deps.store.remove(tokenHash);

    return c.body(null, 204);
  });

  app.post('/v1/messages', async (c) => {
    const { deps } = c.var;
    const tokenHash = await tokenHashOf(c);

    const device = tokenHash
      ? await deps.store.findByToken(tokenHash)
      : undefined;

    if (!device || device.chatId === null) return unauthorized(c);

    if (!(await deps.allow('send', device.tokenHash))) {
      return fail(
        c,
        429,
        'rate_limited',
        'Too many messages in a short time. Try again in a minute.'
      );
    }

    if (!(await deps.allow('chat', String(device.chatId)))) {
      return fail(
        c,
        429,
        'rate_limited',
        'This chat got too many messages in a short time. Try again in a minute.'
      );
    }

    const message = outgoingMessageSchema.safeParse(await readJson(c));

    if (!message.success) {
      return fail(
        c,
        400,
        'invalid_request',
        'The message is empty or malformed.'
      );
    }

    try {
      const delivery = await deliver(deps.bot, device.chatId, message.data);

      await deps.store.touch(device.tokenHash, deps.now());

      return c.json(delivery);
    } catch (cause) {
      if (!(cause instanceof TelegramError)) throw cause;

      if (cause.code === 403 || /chat not found/i.test(cause.message)) {
        return fail(
          c,
          403,
          'chat_unavailable',
          'The bot can’t post to this chat anymore.'
        );
      }

      if (cause.code === 429) {
        return fail(
          c,
          429,
          'rate_limited',
          'Telegram is limiting messages. Try again in a few seconds.'
        );
      }

      // Code 0 is a network failure; 5xx is Telegram having trouble.
      if (cause.code === 0 || cause.code >= 500) {
        return fail(
          c,
          502,
          'telegram_error',
          'The relay couldn’t reach Telegram. Try again in a moment.'
        );
      }

      return fail(
        c,
        502,
        'telegram_error',
        `Telegram didn’t accept the message: ${cause.message.replace(/^Bad Request: /, '')}`
      );
    }
  });

  app.post('/telegram/webhook', async (c) => {
    const { deps } = c.var;
    const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? '';

    // A missing or malformed WEBHOOK_SECRET would match an empty header.
    if (
      !WEBHOOK_SECRET_PATTERN.test(deps.webhookSecret) ||
      !sameSecret(secret, deps.webhookSecret)
    ) {
      return c.body(null, 401);
    }

    const update = updateSchema.safeParse(await readJson(c));

    if (update.success) {
      try {
        await handleUpdate(deps, update.data);
      } catch (cause) {
        // Answer 200 anyway: a failing update retried forever helps no one.
        console.error(
          'Update failed',
          cause instanceof Error ? cause.name : 'unknown'
        );
      }
    }

    return c.body(null, 200);
  });

  return app;
}
