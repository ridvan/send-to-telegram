import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  BACKUP_FORMAT,
  BackupError,
  backupFileName,
  createBackup,
  MAX_BACKUP_BYTES,
  type OpenedBackup,
  openBackup,
  planRestore,
  restoreBackup,
} from './backup.ts';
import { failureCopy } from './failure.ts';
import { lockNow, turnOnLock, unlock } from './lock.ts';
import {
  chatPhotoStore,
  defaultSettings,
  type Destination,
  historyStore,
  MAX_HISTORY,
  onboardingStore,
  sendQueueStore,
  settingsStore,
} from './settings.ts';
import { fromBase64, LockedError, toBase64, wrappingKey } from './vault.ts';

// Fast for tests; the file carries its own count.
const ITERATIONS = 1000;
const PASSWORD = 'backup password';
const TOKEN = '123:secret-token';
const PHOTO = 'data:image/webp;base64,UklGRg==';

const saved: Destination = {
  id: 'd1',
  kind: 'bot',
  token: TOKEN,
  chatId: 42,
  chatTitle: 'Saved links',
  label: 'Links',
  avatar: { kind: 'emoji', emoji: '🔖' },
};

const topic: Destination = {
  id: 'd2',
  kind: 'bot',
  token: TOKEN,
  chatId: -100123,
  chatTitle: 'Design crit',
  chatType: 'supergroup',
  topic: { id: 7, name: 'Inspiration' },
};

const settings = {
  ...defaultSettings(),
  destinations: [saved, topic],
  defaultDestinationId: 'd2',
  tags: { enabled: true, list: ['work', 'reading'] },
  history: { mode: 'minimal' as const, showInChat: false },
  appearance: {
    theme: 'dark' as const,
    showChatNames: false,
    chatBackground: 'photo' as const,
  },
  privacy: { blurMedia: true },
};

const sent = {
  id: 'h1',
  sentAt: 1_800_000_000_000,
  kind: 'link' as const,
  status: 'sent' as const,
  destinationId: 'd2',
};

async function seed() {
  await settingsStore.set(settings);
  await historyStore.set([sent]);
  await chatPhotoStore.set(PHOTO);
}

beforeEach(async () => {
  // A failed assertion would otherwise leave a spy for the next test.
  vi.restoreAllMocks();
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
  await loadEmptyStores();
});

async function loadEmptyStores() {
  // Snapshots are cached per module; read the empty storage back into them.
  await Promise.all([
    settingsStore.get(),
    historyStore.get(),
    chatPhotoStore.get(),
  ]);
}

async function backup(history = false) {
  return createBackup(PASSWORD, { history }, ITERATIONS);
}

/** A file with a payload of our own, as JSON, encrypted as the real one is. */
async function fileWith(payload: string, version = 1) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await wrappingKey(PASSWORD, salt, ITERATIONS);

  const data = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(`${BACKUP_FORMAT}:${version}`),
    },
    key,
    new TextEncoder().encode(payload)
  );

  return JSON.stringify({
    format: BACKUP_FORMAT,
    version,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(data)),
  });
}

async function problem(promise: Promise<unknown>) {
  try {
    await promise;

    return undefined;
  } catch (cause) {
    return cause instanceof BackupError ? cause.problem : cause;
  }
}

describe('backing up', () => {
  it('restores into empty storage as it was', async () => {
    await seed();

    const file = await backup(true);

    fakeBrowser.reset();
    await loadEmptyStores();

    const plan = await restoreBackup(await openBackup(file, PASSWORD));

    expect(plan).toMatchObject({ added: 2, kept: 0, historyAdded: 1 });
    expect(await settingsStore.get()).toEqual(settings);
    expect(await historyStore.get()).toEqual([sent]);
    expect(await chatPhotoStore.get()).toBe(PHOTO);
    expect((await onboardingStore.get()).completedAt).toBeTypeOf('number');
  });

  it('leaves history out unless asked', async () => {
    await seed();

    const opened = await openBackup(await backup(), PASSWORD);

    expect(opened.history).toBeUndefined();
  });

  it('leaves the photo out when the chat doesn’t draw it', async () => {
    await seed();
    await settingsStore.set({
      ...settings,
      appearance: { ...settings.appearance, chatBackground: 'waves' },
    });

    const opened = await openBackup(await backup(), PASSWORD);

    expect(opened.chatPhoto).toBeNull();
  });

  it('keeps tokens out of the parts in the clear', async () => {
    await seed();

    const file = await backup(true);
    const { data, ...clear } = JSON.parse(file);

    expect(file).not.toContain(TOKEN);
    expect(file).not.toContain('secret');
    expect(file).not.toContain('Saved links');
    expect(Object.keys(clear).sort()).toEqual([
      'cipher',
      'format',
      'kdf',
      'version',
    ]);
    expect(data).toBeTypeOf('string');
  });

  it('is refused while locked', async () => {
    await seed();
    await turnOnLock('lock password', ITERATIONS);
    await lockNow();

    await expect(backup()).rejects.toBeInstanceOf(LockedError);
  });

  it('refuses a file too large to restore', async () => {
    const long = 'x'.repeat(40_000);

    await settingsStore.set(settings);
    await historyStore.set(
      Array.from({ length: 1000 }, (_, index) => ({
        ...sent,
        id: `h${index}`,
        content: { text: long },
      }))
    );

    expect(await problem(backup(true))).toBe('too-large');
    expect(await problem(backup())).toBeUndefined();
  });

  it('names the file by the day', () => {
    expect(backupFileName(new Date(2026, 10, 1))).toBe(
      'send-to-telegram-backup-2026-11-01.json'
    );
  });
});

describe('opening a backup', () => {
  it('fails with the wrong password', async () => {
    await seed();

    expect(await problem(openBackup(await backup(), 'not the one'))).toBe(
      'wrong-password'
    );
  });

  it('fails when the ciphertext was changed', async () => {
    await seed();

    const file = JSON.parse(await backup());
    const data = fromBase64(file.data);

    data[5] = (data[5] ?? 0) ^ 1;

    const tampered = JSON.stringify({ ...file, data: toBase64(data) });

    expect(await problem(openBackup(tampered, PASSWORD))).toBe(
      'wrong-password'
    );
  });

  it('asks for an update for a newer version', async () => {
    const file = await fileWith(
      JSON.stringify({ createdAt: 1, settings: {} }),
      2
    );

    expect(await problem(openBackup(file, PASSWORD))).toBe('newer');
  });

  it('tells a file that isn’t a backup', async () => {
    expect(await problem(openBackup('hello', PASSWORD))).toBe('not-backup');
    expect(await problem(openBackup('{"settings":{}}', PASSWORD))).toBe(
      'not-backup'
    );
  });

  it('refuses a made-up iteration count', async () => {
    const file = JSON.parse(
      await fileWith(JSON.stringify({ createdAt: 1, settings: {} }))
    );

    file.kdf.iterations = 1e12;

    expect(await problem(openBackup(JSON.stringify(file), PASSWORD))).toBe(
      'not-backup'
    );
  });

  it('refuses a file too large to be a backup', async () => {
    const huge = ' '.repeat(MAX_BACKUP_BYTES + 1);

    expect(await problem(openBackup(huge, PASSWORD))).toBe('too-large');
  });

  it('drops fields this version doesn’t know', async () => {
    const file = await fileWith(
      JSON.stringify({
        createdAt: 1,
        settings: {
          ...settings,
          future: true,
          delivery: { ...settings.delivery, sparkles: 'yes' },
          destinations: [{ ...saved, mood: 'happy' }],
        },
        history: [{ ...sent, extra: 1 }],
        somethingNew: [1, 2, 3],
      })
    );

    const opened = await openBackup(file, PASSWORD);

    expect(opened.settings).not.toHaveProperty('future');
    expect(opened.settings.delivery).not.toHaveProperty('sparkles');
    expect(opened.settings.destinations).toEqual([saved]);
    expect(opened.history).toEqual([sent]);
  });

  it('refuses settings this version can’t read, instead of defaults', async () => {
    const file = await fileWith(
      JSON.stringify({
        createdAt: 1,
        settings: { ...settings, history: { mode: 'forever' } },
      })
    );

    expect(await problem(openBackup(file, PASSWORD))).toBe('unreadable');
  });
});

describe('restoring', () => {
  function opened(change: Partial<OpenedBackup> = {}): OpenedBackup {
    return {
      createdAt: 1,
      settings,
      chatPhoto: null,
      history: undefined,
      ...change,
    };
  }

  const empty = { settings: defaultSettings(), history: [], photo: null };

  it('keeps a chat already here and adds the others', () => {
    const here = { ...saved, id: 'local', label: 'Mine' };

    const plan = planRestore(opened(), {
      ...empty,
      settings: { ...defaultSettings(), destinations: [here] },
    });

    expect(plan).toMatchObject({ added: 1, kept: 1 });
    expect(plan.settings.destinations).toEqual([here, topic]);
  });

  it('adds another topic of the same chat as its own', () => {
    const general = { ...topic, id: 'general', topic: undefined };
    const other = { ...topic, id: 'other', topic: { id: 9 } };

    const plan = planRestore(opened(), {
      ...empty,
      settings: { ...defaultSettings(), destinations: [general, other] },
    });

    expect(plan).toMatchObject({ added: 2, kept: 0 });
    expect(plan.settings.destinations.map((item) => item.id)).toEqual([
      'general',
      'other',
      'd1',
      'd2',
    ]);
  });

  it('gives a chat a new ID when its ID names another place here', () => {
    // The same chat, moved to another topic here since the backup.
    const moved = { ...topic, topic: { id: 9 } };

    const plan = planRestore(opened({ history: [sent] }), {
      ...empty,
      settings: { ...defaultSettings(), destinations: [moved] },
    });

    const restored = plan.settings.destinations.find(
      (item) => item.topic?.id === 7
    );

    expect(restored?.id).not.toBe('d2');
    expect(plan.settings.destinations).toHaveLength(3);
    // History follows the chat to its new ID; the default stays as it was here.
    expect(plan.history?.[0]?.destinationId).toBe(restored?.id);
    expect(plan.settings.defaultDestinationId).toBeNull();
  });

  it('points history and the default at the chat already here', () => {
    const here = { ...topic, id: 'local' };

    const plan = planRestore(opened({ history: [sent] }), {
      ...empty,
      settings: {
        ...defaultSettings(),
        destinations: [here],
        defaultDestinationId: 'local',
      },
    });

    expect(plan.history?.[0]?.destinationId).toBe('local');
    expect(plan.settings.defaultDestinationId).toBe('local');
  });

  it('takes the backup’s default chat into an empty browser', () => {
    const plan = planRestore(opened(), empty);

    expect(plan.settings.defaultDestinationId).toBe('d2');
  });

  it('replaces preferences with the backup’s', () => {
    const plan = planRestore(opened({ chatPhoto: PHOTO }), empty);

    expect(plan.settings.tags).toEqual(settings.tags);
    expect(plan.settings.history).toEqual(settings.history);
    expect(plan.settings.appearance).toEqual(settings.appearance);
    expect(plan.settings.privacy).toEqual(settings.privacy);
    expect(plan.chatPhoto).toBe(PHOTO);
  });

  it('draws doodles when the photo background has no photo', () => {
    const plan = planRestore(opened(), empty);

    expect(plan.settings.appearance.chatBackground).toBe('doodles');
    expect(
      planRestore(opened(), { ...empty, photo: PHOTO }).settings.appearance
        .chatBackground
    ).toBe('photo');
  });

  it('merges history by entry, newest first', () => {
    const older = { ...sent, id: 'h0', sentAt: sent.sentAt - 1 };
    const newer = { ...sent, id: 'h2', sentAt: sent.sentAt + 1 };

    const plan = planRestore(opened({ history: [sent, older] }), {
      ...empty,
      history: [newer, { ...sent, kind: 'page' }],
    });

    expect(plan.historyAdded).toBe(1);
    expect(plan.history?.map((entry) => [entry.id, entry.kind])).toEqual([
      ['h2', 'link'],
      ['h1', 'page'],
      ['h0', 'link'],
    ]);
  });

  it('leaves history alone when the backup has none', () => {
    expect(planRestore(opened(), empty).history).toBeUndefined();
  });

  it('counts only the history entries that fit', () => {
    const here = Array.from({ length: MAX_HISTORY }, (_, index) => ({
      ...sent,
      id: `here${index}`,
      sentAt: sent.sentAt + 1 + index,
    }));

    const newest = { ...sent, id: 'newest', sentAt: sent.sentAt + 5000 };

    const plan = planRestore(opened({ history: [newest, sent] }), {
      ...empty,
      history: here,
    });

    // The older one is cut by the limit, so only the newest is added.
    expect(plan.history).toHaveLength(MAX_HISTORY);
    expect(plan.historyAdded).toBe(1);
  });

  it('keeps a failed message’s files from being offered again', () => {
    const file = { id: 'f1', name: 'notes.pdf', type: '', size: 3 };

    const withFile = {
      ...sent,
      id: 'h3',
      status: 'failed' as const,
      error: 'Telegram is unreachable.',
      content: { note: 'For later', attachment: file },
    };

    const album = {
      ...withFile,
      id: 'h4',
      content: { attachments: [file, { ...file, id: 'f2' }] },
    };
    // Parts of a long text that went are in Telegram, so they're not sent twice.

    const partly = {
      ...sent,
      id: 'h5',
      status: 'failed' as const,
      telegram: { botId: 123, chatId: 42, messageIds: [5] },
      partsSent: 1,
      partsOf: 99,
      content: { text: 'Long text' },
    };

    const delivered = {
      ...sent,
      id: 'h6',
      telegram: { botId: 123, chatId: 42, messageIds: [6] },
      content: { url: 'https://example.com', attachment: file },
    };

    const plan = planRestore(
      opened({ history: [withFile, album, partly, delivered] }),
      empty
    );

    const byId = new Map(plan.history?.map((entry) => [entry.id, entry]));

    for (const id of ['h3', 'h4']) {
      expect(byId.get(id)?.content).toBeUndefined();
      expect(byId.get(id)?.error).toBe(failureCopy.attachment_missing);
      expect(byId.get(id)?.status).toBe('failed');
    }

    expect(byId.get('h5')).toEqual(partly);
    expect(byId.get('h6')).toEqual(delivered);
  });

  it('keeps a message sent while it restores', async () => {
    await settingsStore.set(settings);
    await historyStore.set([sent]);

    const meanwhile = { ...sent, id: 'meanwhile', sentAt: sent.sentAt + 2 };
    const older = { ...sent, id: 'h0', sentAt: sent.sentAt - 1 };
    const read = historyStore.get;
    let racing: Promise<unknown> | undefined;

    // A send records itself just after the restore has read history.
    const spy = vi
      .spyOn(historyStore, 'get')
      .mockImplementationOnce(async () => {
        const value = await read();

        racing = historyStore.update((history) => [meanwhile, ...history]);

        return value;
      });

    await restoreBackup(opened({ history: [sent, older] }));
    await racing;
    spy.mockRestore();

    expect((await historyStore.get()).map((entry) => entry.id)).toEqual([
      'meanwhile',
      'h1',
      'h0',
    ]);
  });

  it('keeps a chat added while it restores, once', async () => {
    const local = { ...topic, id: 'local', label: 'Mine' };
    const read = settingsStore.get;
    let racing: Promise<unknown> | undefined;

    // The same chat is added here just after the restore has read settings.
    vi.spyOn(settingsStore, 'get').mockImplementationOnce(async () => {
      const value = await read();

      racing = settingsStore.update((current) => ({
        ...current,
        destinations: [...current.destinations, local],
      }));

      return value;
    });

    await restoreBackup(opened({ history: [sent] }));
    await racing;

    expect((await settingsStore.get()).destinations).toEqual([local, saved]);
    expect((await historyStore.get())[0]?.destinationId).toBe('local');
  });

  it('drops a leftover queued try for an entry it brings back', async () => {
    const failed = {
      ...sent,
      id: 'gone',
      status: 'failed' as const,
      content: { url: 'https://example.com' },
    };

    const other = { entryId: 'other', attempts: 1, since: 1, nextAt: 1 };

    await sendQueueStore.set([{ ...other, entryId: 'gone' }, other]);
    await restoreBackup(opened({ history: [failed] }));

    expect(await sendQueueStore.get()).toEqual([other]);
  });

  it('says when this browser has no room, and changes nothing', async () => {
    const here = { ...saved, id: 'local', label: 'Mine' };

    await settingsStore.set({ ...defaultSettings(), destinations: [here] });
    await chatPhotoStore.set('data:image/webp;base64,b2xk');

    const before = await browser.storage.local.get(null);
    const write = browser.storage.local.set.bind(browser.storage.local);

    const spy = vi
      .spyOn(browser.storage.local, 'set')
      .mockImplementation(async (items) => {
        if ('history' in items) {
          throw new Error('QUOTA_BYTES quota exceeded');
        }

        await write(items);
      });

    expect(
      await problem(
        restoreBackup(opened({ history: [sent], chatPhoto: PHOTO }))
      )
    ).toBe('full');
    spy.mockRestore();

    expect(await browser.storage.local.get(null)).toEqual(before);
  });

  it('puts the photo back when the settings don’t fit', async () => {
    const old = 'data:image/webp;base64,b2xk';

    await chatPhotoStore.set(old);

    const write = browser.storage.local.set.bind(browser.storage.local);

    const spy = vi
      .spyOn(browser.storage.local, 'set')
      .mockImplementation(async (items) => {
        if ('settings' in items) {
          throw new Error(
            'QuotaExceededError: storage.local API call exceeded its quota limitations.'
          );
        }

        await write(items);
      });

    expect(await problem(restoreBackup(opened({ chatPhoto: PHOTO })))).toBe(
      'full'
    );
    spy.mockRestore();

    expect(await chatPhotoStore.get()).toBe(old);
    expect((await settingsStore.get()).destinations).toEqual([]);
  });

  it('is refused while locked, and changes nothing', async () => {
    await turnOnLock('lock password', ITERATIONS);
    await lockNow();

    const before = await browser.storage.local.get(null);

    await expect(restoreBackup(opened())).rejects.toBeInstanceOf(LockedError);
    expect(await browser.storage.local.get(null)).toEqual(before);
  });

  it('seals what it writes while the lock is on', async () => {
    await turnOnLock('lock password', ITERATIONS);
    await restoreBackup(opened({ history: [sent] }));

    const stored = JSON.stringify(await browser.storage.local.get(null));

    expect(stored).not.toContain(TOKEN);
    expect((await settingsStore.get()).destinations).toEqual([saved, topic]);

    await lockNow();
    await unlock('lock password');

    expect(await historyStore.get()).toEqual([sent]);
  });
});
