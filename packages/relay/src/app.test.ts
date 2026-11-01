import {
  type BotClient,
  type BotMethod,
  pairingSchema,
  type Chat,
  TelegramError,
  type Update,
} from '@send-to-telegram/core';
import { describe, expect, it } from 'vitest';

import {
  clientKey,
  createApp,
  type Deps,
  PAIRING_TTL,
  parseCommand,
} from './app.ts';
import { sha256 } from './crypto.ts';
import type { Device, DeviceStore } from './store.ts';

function memoryStore(): DeviceStore {
  const devices = new Map<string, Device & { lastUsedAt?: number }>();

  return {
    async createPairing({ tokenHash, client, code, expiresAt, now }) {
      devices.set(tokenHash, {
        tokenHash,
        client,
        pairingCode: code,
        pairingExpiresAt: expiresAt,
        chatId: null,
        chatTitle: null,
        chatType: null,
        createdAt: now,
        linkedAt: null,
      });
    },
    findByToken: async (tokenHash) => devices.get(tokenHash),
    findByCode: async (code) =>
      [...devices.values()].find((device) => device.pairingCode === code),
    async link(tokenHash, chat, now) {
      const device = devices.get(tokenHash);

      if (!device) return;

      devices.set(tokenHash, {
        ...device,
        chatId: chat.id,
        chatTitle: chat.title,
        chatType: chat.type,
        linkedAt: now,
        pairingCode: null,
        pairingExpiresAt: null,
      });
    },
    async touch(tokenHash, now) {
      const device = devices.get(tokenHash);

      if (device) device.lastUsedAt = now;
    },
    remove: async (tokenHash) => void devices.delete(tokenHash),
    listForChat: async (chatId) =>
      [...devices.values()].filter((device) => device.chatId === chatId),
    async removeForChat(chatId) {
      for (const device of devices.values()) {
        if (device.chatId === chatId) devices.delete(device.tokenHash);
      }
    },
    async moveChat(fromChatId, toChatId) {
      for (const device of devices.values()) {
        if (device.chatId === fromChatId) {
          device.chatId = toChatId;
          device.chatType = 'supergroup';
        }
      }
    },
    async purgeExpired() {},
  };
}

type Sent = { method: BotMethod; params: Parameters<BotClient['call']>[1] };

type Limiter = Parameters<Deps['allow']>[0];

function setup({
  webhookSecret = 'secret-secret-secret',
  memberStatus = 'member',
} = {}) {
  const sent: Sent[] = [];
  let clock = 1_000_000;
  const blocked = new Set<Limiter>();
  let failure: TelegramError | undefined;
  const store = memoryStore();

  const bot: BotClient = {
    async call(method, params) {
      if (failure) throw failure;

      sent.push({ method, params });

      // SAFETY: tests only read message_id, or status for getChatMember.
      return {
        message_id: sent.length,
        chat: { id: 7, type: 'private' },
        status: memberStatus,
      } as never;
    },
  };

  const deps: Deps = {
    store,
    bot,
    botUsername: 'RelayBot',
    webhookSecret,
    allow: async (limiter) => !blocked.has(limiter),
    now: () => clock,
  };

  const app = createApp(() => deps);

  return {
    app,
    store,
    sent,
    advance: (ms: number) => {
      clock += ms;
    },
    block: (...limiters: Limiter[]) => {
      for (const limiter of limiters) blocked.add(limiter);
    },
    failWith: (error: TelegramError) => {
      failure = error;
    },
  };
}

const token = 'a'.repeat(43);

const auth = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

type App = ReturnType<typeof setup>['app'];

function update(app: App, body: Omit<Update, 'update_id'>) {
  return app.request('/telegram/webhook', {
    method: 'POST',
    headers: {
      'X-Telegram-Bot-Api-Secret-Token': 'secret-secret-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ update_id: 1, ...body }),
  });
}

const privateChat = { id: 7, type: 'private', first_name: 'Ada' } as const;

function webhook(app: App, text: string, chat: Chat = privateChat) {
  return update(app, { message: { message_id: 1, text, chat } });
}

async function pair(app: App) {
  const response = await app.request('/v1/pairings', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ client: 'Chrome on macOS' }),
  });

  expect(response.status).toBe(201);

  return pairingSchema.parse(await response.json());
}

describe('parseCommand', () => {
  it('reads commands addressed to this bot only', () => {
    expect(parseCommand('/start abc', 'RelayBot')).toEqual({
      command: 'start',
      argument: 'abc',
    });
    expect(parseCommand('/start@relaybot abc', 'RelayBot')).toEqual({
      command: 'start',
      argument: 'abc',
    });
    expect(parseCommand('/start@OtherBot abc', 'RelayBot')).toBeUndefined();
    expect(parseCommand('hello', 'RelayBot')).toBeUndefined();
  });
});

describe('clientKey', () => {
  it('counts an IPv6 address as its /64', () => {
    expect(clientKey('203.0.113.9')).toBe('203.0.113.9');
    expect(clientKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:0DB8:0001:0002:ffff:0:0:9')).toBe(
      '2001:db8:1:2::/64'
    );
    expect(clientKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(clientKey('::1')).toBe('0:0:0:0::/64');
  });
});

describe('relay', () => {
  it('links a browser through /start and delivers its messages', async () => {
    const { app, sent } = setup();
    const { code } = await pair(app);

    const pending = await app.request('/v1/device', { headers: auth });

    expect(await pending.json()).toMatchObject({ status: 'pending' });

    await webhook(app, `/start ${code}`);

    const linked = await app.request('/v1/device', { headers: auth });

    expect(await linked.json()).toEqual({
      status: 'linked',
      chat: { title: 'Ada', type: 'private' },
    });

    const response = await app.request('/v1/messages', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        kind: 'text',
        text: 'hi',
        linkPreview: false,
        silent: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({
      method: 'sendMessage',
      params: { chat_id: 7, text: 'hi' },
    });
  });

  it('stores only a hash of the device token', async () => {
    const { app, store } = setup();

    await pair(app);

    expect(await store.findByToken(token)).toBeUndefined();
    expect(await store.findByToken(await sha256(token))).toBeDefined();
  });

  it('refuses expired links and forgets them', async () => {
    const { app, sent, advance } = setup();
    const { code } = await pair(app);

    advance(PAIRING_TTL + 1);
    await webhook(app, `/start ${code}`);

    expect(sent.at(-1)?.params).toMatchObject({
      text: expect.stringContaining('expired'),
    });
    expect((await app.request('/v1/device', { headers: auth })).status).toBe(
      401
    );
  });

  it('rejects webhooks without the secret', async () => {
    const { app } = setup();

    const response = await app.request('/telegram/webhook', {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(401);
  });

  it('rate-limits sends and rejects unlinked devices', async () => {
    const { app, block } = setup();

    const message = JSON.stringify({
      kind: 'text',
      text: 'hi',
      linkPreview: false,
      silent: true,
    });

    expect(
      (
        await app.request('/v1/messages', {
          method: 'POST',
          headers: auth,
          body: message,
        })
      ).status
    ).toBe(401);

    const { code } = await pair(app);

    await webhook(app, `/start ${code}`);
    block('send');

    expect(
      (
        await app.request('/v1/messages', {
          method: 'POST',
          headers: auth,
          body: message,
        })
      ).status
    ).toBe(429);
  });

  it('unlinks from the extension', async () => {
    const { app } = setup();
    const { code } = await pair(app);

    await webhook(app, `/start ${code}`);
    expect(
      (await app.request('/v1/device', { method: 'DELETE', headers: auth }))
        .status
    ).toBe(204);
    expect((await app.request('/v1/device', { headers: auth })).status).toBe(
      401
    );
  });

  it('refuses webhooks when the relay has no usable secret', async () => {
    const { app } = setup({ webhookSecret: '' });

    const response = await app.request('/telegram/webhook', {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(401);
  });

  it('links a group through /start addressed to the bot', async () => {
    const { app } = setup();
    const { code } = await pair(app);

    await webhook(app, `/start@RelayBot ${code}`, {
      id: -42,
      type: 'group',
      title: 'Reading list',
    });

    expect(
      await (await app.request('/v1/device', { headers: auth })).json()
    ).toEqual({
      status: 'linked',
      chat: { title: 'Reading list', type: 'group' },
    });
  });

  it('lists linked browsers and unlinks one from its button', async () => {
    const { app, sent, store } = setup();
    const { code } = await pair(app);

    await webhook(app, `/start ${code}`);
    await webhook(app, '/devices');

    const list = sent.at(-1);
    const hash = await sha256(token);

    expect(list?.params).toMatchObject({
      chat_id: 7,
      text: 'Linked browsers:\n• Chrome on macOS',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Unlink Chrome on macOS',
              callback_data: `unlink:${hash.slice(0, 16)}`,
            },
          ],
        ],
      },
    });

    await update(app, {
      callback_query: {
        id: 'q1',
        from: { id: 7, is_bot: false, first_name: 'Ada' },
        data: `unlink:${hash.slice(0, 16)}`,
        message: { message_id: 9, chat: privateChat },
      },
    });

    expect(await store.findByToken(hash)).toBeUndefined();
    expect(sent.slice(-2)).toMatchObject([
      {
        method: 'answerCallbackQuery',
        params: { text: 'Unlinked Chrome on macOS' },
      },
      {
        method: 'editMessageText',
        params: { message_id: 9, text: 'No browsers are linked to this chat.' },
      },
    ]);
  });

  it('answers buttons it does not handle', async () => {
    const { app, sent } = setup();

    await update(app, {
      callback_query: {
        id: 'q2',
        from: { id: 7, is_bot: false, first_name: 'Ada' },
        data: 'unknown',
      },
    });

    expect(sent).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: 'q2' } },
    ]);
  });

  it('unlinks every browser when the bot is removed or blocked', async () => {
    const { app } = setup();
    const { code } = await pair(app);

    await webhook(app, `/start ${code}`);
    await update(app, {
      my_chat_member: {
        chat: privateChat,
        from: { id: 7, is_bot: false, first_name: 'Ada' },
        new_chat_member: { status: 'kicked' },
      },
    });

    expect((await app.request('/v1/device', { headers: auth })).status).toBe(
      401
    );
  });

  it('follows a group that became a supergroup', async () => {
    const { app } = setup();
    const { code } = await pair(app);
    const oldGroup = { id: -42, type: 'group', title: 'Reading list' } as const;

    await webhook(app, `/start ${code}`, oldGroup);
    await update(app, {
      message: { message_id: 2, chat: oldGroup, migrate_to_chat_id: -1001 },
    });

    expect(
      await (await app.request('/v1/device', { headers: auth })).json()
    ).toMatchObject({ chat: { type: 'supergroup' } });
  });

  it('says when Telegram is unreachable rather than rejecting', async () => {
    const { app, failWith } = setup();
    const { code } = await pair(app);

    await webhook(app, `/start ${code}`);
    failWith(new TelegramError(0, 'Could not reach Telegram'));

    const response = await app.request('/v1/messages', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        kind: 'text',
        text: 'hi',
        linkPreview: false,
        silent: true,
      }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: 'telegram_error',
        message: 'The relay couldn’t reach Telegram. Try again in a moment.',
      },
    });
  });
  it('limits how much one chat receives', async () => {
    const { app, block } = setup();
    const { code } = await pair(app);

    await webhook(app, `/start ${code}`);
    block('chat');

    const response = await app.request('/v1/messages', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        kind: 'text',
        text: 'hi',
        linkPreview: false,
        silent: true,
      }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: 'rate_limited' },
    });
  });

  it('refuses bodies larger than any real message', async () => {
    const { app } = setup();

    const response = await app.request('/v1/messages', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ kind: 'text', text: 'x'.repeat(300 * 1024) }),
    });

    expect(response.status).toBe(413);
  });

  it('ignores commands from a chat over its limit', async () => {
    const { app, sent, block } = setup();

    block('command');
    await webhook(app, '/help');

    expect(sent).toEqual([]);
  });

  it('lets only group admins unlink', async () => {
    const group = { id: -42, type: 'group', title: 'Reading list' } as const;

    const press = (app: App, hash: string) =>
      update(app, {
        callback_query: {
          id: 'q3',
          from: { id: 8, is_bot: false, first_name: 'Grace' },
          data: `unlink:${hash.slice(0, 16)}`,
          message: { message_id: 9, chat: group },
        },
      });

    const hash = await sha256(token);

    const member = setup();

    await webhook(member.app, `/start ${(await pair(member.app)).code}`, group);
    await press(member.app, hash);

    expect(await member.store.findByToken(hash)).toBeDefined();
    expect(member.sent.at(-1)).toMatchObject({
      method: 'answerCallbackQuery',
      params: { text: 'Only group admins can unlink browsers.' },
    });

    const admin = setup({ memberStatus: 'administrator' });

    await webhook(admin.app, `/start ${(await pair(admin.app)).code}`, group);
    await press(admin.app, hash);

    expect(await admin.store.findByToken(hash)).toBeUndefined();
  });
});
