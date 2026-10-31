import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import * as attachments from './attachments.ts';
import { loadAttachment, saveAttachment } from './attachments.ts';
import {
  changePassword,
  lockNow,
  resetPassword,
  setAutoLock,
  turnOffLock,
  turnOnLock,
  unlock,
} from './lock.ts';
import { pruneUnsentFiles, send } from './send.ts';
import { historyStore, settingsStore } from './settings.ts';
import {
  envelopeSchema,
  fromBase64,
  LockedError,
  lockState,
  readVault,
  sealJson,
  toBase64,
  writeVault,
} from './vault.ts';

// Fast for tests; the real count is stored with each wrapped key.
const ITERATIONS = 1000;
const PASSWORD = 'correct horse';

const settings = {
  destinations: [
    {
      id: 'd1',
      kind: 'bot',
      token: '123:secret-token',
      chatId: 42,
      chatTitle: 'Saved links',
    },
  ],
};

const sent = {
  id: 'h1',
  sentAt: 1_800_000_000_000,
  kind: 'page',
  status: 'sent',
  content: { pageUrl: 'https://example.com/private' },
};

async function stored(key: string) {
  return JSON.stringify((await browser.storage.local.get(key))[key]);
}

async function attachmentText(id: string) {
  return (await loadAttachment(id))?.text();
}

beforeEach(async () => {
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
  await browser.storage.local.set({ settings, history: [sent] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('turning on the lock', () => {
  it('encrypts chats and history, which still read while unlocked', async () => {
    const code = await turnOnLock(PASSWORD, ITERATIONS);

    expect(code).toMatch(/^([A-HJ-NP-Z2-9]{4}-){7}[A-HJ-NP-Z2-9]{4}$/);
    expect(await stored('settings')).not.toContain('secret-token');
    expect(await stored('settings')).not.toContain('Saved links');
    expect(await stored('history')).not.toContain('example.com');
    expect(await lockState()).toBe('unlocked');

    const [destination] = (await settingsStore.get()).destinations;

    expect(destination).toMatchObject({ token: '123:secret-token' });
    expect(await historyStore.get()).toEqual([sent]);
  });

  it('encrypts files attached before and after', async () => {
    await saveAttachment('before', new Blob(['first']));
    await turnOnLock(PASSWORD, ITERATIONS);
    await saveAttachment('after', new Blob(['second'], { type: 'text/plain' }));

    expect(await attachmentText('before')).toBe('first');
    expect((await loadAttachment('after'))?.type).toBe('text/plain');

    await lockNow();

    await expect(loadAttachment('before')).rejects.toBeInstanceOf(LockedError);
    await expect(loadAttachment('after')).rejects.toBeInstanceOf(LockedError);

    await unlock(PASSWORD);

    expect(await attachmentText('after')).toBe('second');
  });
});

describe('while locked', () => {
  beforeEach(async () => {
    await turnOnLock(PASSWORD, ITERATIONS);
    await lockNow();
  });

  it('refuses reads and writes, leaving the sealed data', async () => {
    const before = await stored('history');

    expect(await lockState()).toBe('locked');
    await expect(settingsStore.get()).rejects.toBeInstanceOf(LockedError);
    await expect(historyStore.get()).rejects.toBeInstanceOf(LockedError);
    await expect(historyStore.set([])).rejects.toBeInstanceOf(LockedError);
    expect(await stored('history')).toBe(before);
  });

  it('keeps files a locked history might still retry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await unlock(PASSWORD);
    await saveAttachment('retry', new Blob(['again']));
    await lockNow();
    vi.setSystemTime(Date.now() + 2 * 60 * 60_000);

    await pruneUnsentFiles();
    await unlock(PASSWORD);

    expect(await attachmentText('retry')).toBe('again');
  });

  it('sends nothing and records nothing', async () => {
    const before = await stored('history');

    const outcome = await send({
      type: 'send',
      incognito: false,
      draft: { kind: 'page', pageUrl: 'https://example.com/' },
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'locked' });
    expect(await stored('history')).toBe(before);
  });

  it('unlocks with the password only', async () => {
    expect(await unlock('wrong password')).toBe(false);
    expect(await lockState()).toBe('locked');
    expect(await unlock(PASSWORD)).toBe(true);
    expect(await historyStore.get()).toEqual([sent]);
  });

  it('sets a new password with the recovery code, typed loosely', async () => {
    fakeBrowser.reset();
    await browser.storage.local.set({ settings });

    const code = await turnOnLock(PASSWORD, ITERATIONS);

    await lockNow();

    expect(await resetPassword('AAAA-BBBB', 'new password')).toBe(false);

    const typed = code.toLowerCase().replaceAll('-', ' ');

    expect(await resetPassword(typed, 'new password')).toBe(true);
    expect(await lockState()).toBe('unlocked');

    await lockNow();

    expect(await unlock(PASSWORD)).toBe(false);
    expect(await unlock('new password')).toBe(true);
  });

  it('reads tampered data as unreadable instead of failing', async () => {
    await unlock(PASSWORD);

    const envelope = envelopeSchema.parse(
      (await browser.storage.local.get('settings')).settings
    );

    const data = fromBase64(envelope.data);

    data[0] = (data[0] ?? 0) ^ 1;
    await browser.storage.local.set({
      settings: { ...envelope, data: toBase64(data) },
    });

    expect((await settingsStore.get()).destinations).toEqual([]);
  });
});

describe('changing the lock', () => {
  beforeEach(async () => {
    await turnOnLock(PASSWORD, ITERATIONS);
  });

  it('changes the password only with the current one', async () => {
    expect(await changePassword('wrong password', 'another one')).toBe(false);
    expect(await changePassword(PASSWORD, 'another one')).toBe(true);

    await lockNow();

    expect(await unlock(PASSWORD)).toBe(false);
    expect(await unlock('another one')).toBe(true);
  });

  it('doesn’t count reading sealed data as a use', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await setAutoLock('15m');

    for (let minute = 0; minute < 16; minute += 2) {
      vi.setSystemTime(Date.now() + 2 * 60_000);
      await historyStore.get().catch(() => undefined);
    }

    expect(await lockState()).toBe('locked');
  });

  it('locks once the auto-lock time passes without use', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await setAutoLock('15m');
    vi.setSystemTime(Date.now() + 14 * 60_000);

    expect(await lockState()).toBe('unlocked');

    vi.setSystemTime(Date.now() + 2 * 60_000);

    expect(await lockState()).toBe('locked');
  });

  it('turns off with the password and stores everything in the clear', async () => {
    expect(await turnOffLock('wrong password')).toBe(false);
    expect(await turnOffLock(PASSWORD)).toBe(true);
    expect(await stored('settings')).toContain('secret-token');
    expect(await stored('history')).toContain('example.com');
    expect(await readVault()).toBeUndefined();
    expect(await lockState()).toBe('off');
  });

  it('opens a write sealed by another page while turning off', async () => {
    // Sealed by a page that read the vault before the turn-off began.
    const late = await sealJson('history', JSON.stringify([sent]));

    const setStored = browser.storage.local.set.bind(browser.storage.local);

    const removeStored = browser.storage.local.remove.bind(
      browser.storage.local
    );

    // It lands just after the first pass, as the vault goes.
    vi.spyOn(browser.storage.local, 'remove').mockImplementation(
      async (keys) => {
        await setStored({ history: late });
        await removeStored(keys);
      }
    );

    await turnOffLock(PASSWORD);

    expect(await stored('history')).toContain('example.com');
  });

  it('finishes a turn-off that stopped partway at the next unlock', async () => {
    const vault = await readVault();

    if (!vault) throw new Error('The lock should be on');

    await writeVault({ ...vault, turningOff: true });
    await lockNow();

    expect(await lockState()).toBe('locked');
    expect(await unlock(PASSWORD)).toBe(true);
    expect(await lockState()).toBe('off');
    expect(await stored('settings')).toContain('secret-token');
  });
});

describe('a turn-on that fails', () => {
  it('is undone, so it can be tried again', async () => {
    await saveAttachment('file', new Blob(['kept']));

    const rewrite = vi
      .spyOn(attachments, 'rewriteAttachments')
      .mockRejectedValueOnce(new Error('Quota exceeded'));

    await expect(turnOnLock(PASSWORD, ITERATIONS)).rejects.toThrow('Quota');
    rewrite.mockRestore();

    expect(await lockState()).toBe('off');
    expect(await stored('settings')).toContain('secret-token');
    expect(await turnOnLock(PASSWORD, ITERATIONS)).toBeTruthy();
  });

  it('is undone at the next unlock when it stopped partway', async () => {
    await turnOnLock(PASSWORD, ITERATIONS);

    const vault = await readVault();

    if (!vault) throw new Error('The lock should be on');

    await writeVault({ ...vault, turningOn: true });
    await lockNow();

    expect(await unlock(PASSWORD)).toBe(true);
    expect(await lockState()).toBe('off');
    expect(await stored('settings')).toContain('secret-token');
  });
});

describe('the 1.x backup', () => {
  it('is sealed with the rest and opened again when the lock goes off', async () => {
    await browser.storage.local.set({
      legacyBackup: { savedAt: 1, data: { options: { botToken: '9:old' } } },
    });

    await turnOnLock(PASSWORD, ITERATIONS);

    expect(await stored('legacyBackup')).not.toContain('9:old');

    await turnOffLock(PASSWORD);

    expect(await stored('legacyBackup')).toContain('9:old');
  });
});
