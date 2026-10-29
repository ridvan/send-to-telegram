import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { z } from 'zod';

import {
  LEGACY_KEYS,
  legacyStorageSchema,
  migrateLegacy,
  migrateStoredLegacyData,
} from './legacy.ts';
import { settingsStore } from './settings.ts';

/** `defaultSettings` exactly as 1.2.0 wrote it on install. */
const v12Defaults = {
  connections: {
    use: 0,
    setup: { 0: { name: 'Default', key: '', chatId: '' } },
  },
  actions: {
    sendMessage: {
      disableNotificationSound: true,
      disablePreview: true,
      addSourceLink: true,
    },
    sendImage: {
      disableNotificationSound: true,
      disablePreview: false,
      sendAs: 'photo',
      addSourceLink: true,
      useWeservProxy: false,
    },
  },
  logs: { active: true, type: 'everything' },
  hashtags: {
    active: false,
    use: 0,
    setup: {
      0: {
        tags: ['links', 'work', 'fun', 'personal', 'art', 'news'],
        default: { active: false, tagIndex: 0 },
      },
    },
  },
};

let ids = 0;
const nextId = () => `id-${++ids}`;

/** Any JSON storage could hold, including what 1.x left in a bad state. */
type StoredJson = z.infer<ReturnType<typeof z.json>>;

function migrate(stored: Record<string, StoredJson>) {
  return migrateLegacy(legacyStorageSchema.parse(stored), nextId);
}

describe('migrateLegacy', () => {
  it('keeps an untouched 1.2 install unconfigured', () => {
    const result = migrate({ options: v12Defaults, totalMessageCount: 0 });

    expect(result.configured).toBe(false);
    expect(result.settings.destinations).toEqual([]);
    expect(result.settings.delivery).toEqual({
      silent: true,
      linkPreview: false,
      sourceButton: true,
      imageMode: 'photo',
    });
    expect(result.settings.tags).toEqual({
      enabled: false,
      list: ['links', 'work', 'fun', 'personal', 'art', 'news'],
    });
    expect(result.settings.history.mode).toBe('full');
  });

  it('carries over a configured bot, its preferences and hashtags', () => {
    const result = migrate({
      options: {
        ...v12Defaults,
        connections: {
          use: 0,
          setup: {
            0: {
              name: 'Default',
              key: '123456:ABC-token',
              chatId: '987654321',
            },
          },
        },
        actions: {
          sendMessage: {
            disableNotificationSound: false,
            disablePreview: false,
            addSourceLink: false,
          },
          sendImage: { sendAs: 'document' },
        },
        logs: { active: true, type: 'timestamp' },
        hashtags: {
          active: true,
          use: 0,
          setup: { 0: { tags: ['Work', '#ideas', 'read-later', 'work'] } },
        },
      },
      totalMessageCount: 42,
    });

    expect(result.configured).toBe(true);
    expect(result.sent).toBe(42);
    expect(result.settings.destinations).toEqual([
      {
        id: expect.any(String),
        kind: 'bot',
        token: '123456:ABC-token',
        chatId: 987654321,
      },
    ]);
    expect(result.settings.defaultDestinationId).toBe(
      result.settings.destinations[0]?.id
    );
    expect(result.settings.delivery).toEqual({
      silent: false,
      linkPreview: true,
      sourceButton: false,
      imageMode: 'document',
    });
    // Hyphens break Telegram hashtags, so "read-later" cannot come along.
    expect(result.settings.tags).toEqual({
      enabled: true,
      list: ['work', 'ideas'],
    });
    expect(result.settings.history.mode).toBe('minimal');
  });

  it('handles 1.0 installs, which had no hashtags key', () => {
    const { hashtags: _missing, ...v10 } = v12Defaults;

    const result = migrate({
      options: { ...v10, logs: { active: false, type: 'everything' } },
    });

    expect(result.settings.tags.enabled).toBe(false);
    expect(result.settings.history.mode).toBe('off');
  });

  it('keeps every account and the active one as default', () => {
    const result = migrate({
      options: {
        ...v12Defaults,
        connections: {
          use: '1',
          setup: {
            0: { name: 'Default', key: '1:a', chatId: '-100200' },
            1: { name: 'Team', key: '2:b', chatId: '@channel' },
            2: { name: 'Empty', key: '', chatId: '' },
          },
        },
      },
    });

    expect(
      result.settings.destinations.map((destination) => destination.label)
    ).toEqual([undefined, 'Team']);
    expect(result.settings.defaultDestinationId).toBe(
      result.settings.destinations[1]?.id
    );
  });

  it('maps logs and skips unreadable ones', () => {
    const result = migrate({
      options: v12Defaults,
      messageLogs: [
        {
          type: 'text',
          status: 'success',
          timestamp: 3,
          content: { text: 'Hello', tabUrl: 'https://a.com' },
          hashtag: 'work',
        },
        {
          type: 'photo',
          status: 'success',
          timestamp: 5,
          content: {
            srcUrl: 'https://a.com/i.png',
            tabUrl: 'https://a.com',
            fileID: 'x',
          },
        },
        { type: 'page', status: 'success', timestamp: 1, content: false },
        {
          type: 'link',
          status: 'fail',
          timestamp: 4,
          content: false,
          errorLog: { ok: false, description: 'Bad Request: chat not found' },
        },
        { nonsense: true },
        'garbage',
      ],
    });

    expect(
      result.history.map((entry) => [entry.kind, entry.status, entry.sentAt])
    ).toEqual([
      ['image', 'sent', 5],
      ['link', 'failed', 4],
      ['selection', 'sent', 3],
      ['page', 'sent', 1],
    ]);
    expect(result.history[0]?.content).toEqual({
      url: 'https://a.com/i.png',
      pageUrl: 'https://a.com',
    });
    expect(result.history[1]?.error).toBe('Bad Request: chat not found');
    expect(result.history[2]).toMatchObject({
      tag: 'work',
      content: { text: 'Hello', pageUrl: 'https://a.com' },
    });
    expect(result.history[3]?.content).toBeUndefined();
  });

  it('never throws on corrupt storage', () => {
    expect(() =>
      migrate({ options: 'broken', messageLogs: 'nope', totalMessageCount: -4 })
    ).not.toThrow();
    expect(
      migrate({ options: { connections: 7, actions: null } }).configured
    ).toBe(false);
  });
});

describe('migrateStoredLegacyData', () => {
  beforeEach(() => fakeBrowser.reset());

  it('moves 1.x data to the new keys and keeps a backup', async () => {
    await browser.storage.local.set({
      options: {
        ...v12Defaults,
        connections: {
          use: 0,
          setup: { 0: { name: 'Default', key: '1:a', chatId: '5' } },
        },
      },
      messageLogs: [
        { type: 'page', status: 'success', timestamp: 1, content: false },
      ],
      totalMessageCount: 9,
      hideWizard: true,
      lastAPIResponse: {},
    });

    const migration = await migrateStoredLegacyData('1.2.0');

    expect(migration?.configured).toBe(true);

    const stored = await browser.storage.local.get(null);

    for (const key of LEGACY_KEYS) expect(stored).not.toHaveProperty(key);

    expect(stored).toMatchObject({
      stats: { sent: 9 },
      onboarding: { migratedFrom: '1.2.0', completedAt: expect.any(Number) },
      legacyBackup: { data: { totalMessageCount: 9, hideWizard: true } },
    });
    expect((await settingsStore.get()).destinations).toHaveLength(1);
  });

  it('does nothing on a fresh install or a second run', async () => {
    expect(await migrateStoredLegacyData(undefined)).toBeUndefined();

    await browser.storage.local.set({ options: v12Defaults });
    await migrateStoredLegacyData('1.2.0');

    expect(await migrateStoredLegacyData('1.2.0')).toBeUndefined();
  });

  it('finishes cleanup left by an interrupted run', async () => {
    await browser.storage.local.set({ options: v12Defaults, settings: {} });

    expect(await migrateStoredLegacyData('1.2.0')).toBeUndefined();
    expect(await browser.storage.local.get('options')).toEqual({});
  });
});
