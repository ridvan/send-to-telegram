import {
  type BotClient,
  type BotMethod,
  pairingSchema,
} from '@send-to-telegram/core';
import { describe, expect, it } from 'vitest';

import { createApp, type Deps, PAIRING_TTL, parseCommand } from './app.ts';
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
    async purgeExpired() {},
  };
}

type Sent = { method: BotMethod; params: Parameters<BotClient['call']>[1] };

function setup() {
  const sent: Sent[] = [];
  let clock = 1_000_000;
  let allowed = true;
  const store = memoryStore();

  const bot: BotClient = {
    async call(method, params) {
      sent.push({ method, params });

      // SAFETY: tests only read message_id from these results.
      return {
        message_id: sent.length,
        chat: { id: 7, type: 'private' },
      } as never;
    },
  };

  const deps: Deps = {
    store,
    bot,
    botUsername: 'RelayBot',
    webhookSecret: 'secret-secret-secret',
    allow: async () => allowed,
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
    block: () => {
      allowed = false;
    },
  };
}

const token = 'a'.repeat(43);

const auth = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

function webhook(app: ReturnType<typeof setup>['app'], text: string) {
  return app.request('/telegram/webhook', {
    method: 'POST',
    headers: {
      'X-Telegram-Bot-Api-Secret-Token': 'secret-secret-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 1,
        text,
        chat: { id: 7, type: 'private', first_name: 'Ada' },
      },
    }),
  });
}

async function pair(app: ReturnType<typeof setup>['app']) {
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
    block();

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
});
