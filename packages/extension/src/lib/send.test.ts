import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { send } from './send.ts';
import { type HistoryMode, historyStore, settingsStore } from './settings.ts';

const chat = {
  id: 'd1',
  kind: 'bot' as const,
  token: '123:secret',
  chatId: 42,
  chatTitle: 'Saved',
};

/** Telegram answering each send with the next message ID. */
function telegram() {
  let next = 100;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const method = String(input).split('/').at(-1);
      const message = { message_id: next++, chat: { id: 42, type: 'private' } };

      return new Response(
        JSON.stringify({
          ok: true,
          result:
            method === 'sendPhoto'
              ? { ...message, photo: [{ file_id: 'f', file_unique_id: 'F' }] }
              : message,
        })
      );
    })
  );
}

async function useHistory(mode: HistoryMode) {
  const settings = await settingsStore.get();

  await settingsStore.set({
    ...settings,
    destinations: [chat],
    history: { ...settings.history, mode },
  });
}

const longText = `${'a'.repeat(4000)}\n\n${'b'.repeat(200)}`;

describe('send', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    telegram();
    await useHistory('full');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps every part of a long text, to delete them all later', async () => {
    const outcome = await send({
      type: 'send',
      incognito: false,
      draft: { kind: 'selection', text: longText },
    });

    const [entry] = await historyStore.get();
    const telegramRef = { botId: 123, chatId: 42, messageIds: [100, 101] };

    expect(entry?.telegram).toEqual(telegramRef);
    expect(outcome).toEqual({
      ok: true,
      destination: 'Saved',
      sent: { ...telegramRef, entryId: entry?.id },
    });
  });

  it('keeps the ID of media sent', async () => {
    await send({
      type: 'send',
      incognito: false,
      draft: { kind: 'image', url: 'https://example.com/a.png' },
    });

    const [entry] = await historyStore.get();

    expect(entry).toMatchObject({
      via: 'photo',
      telegram: { botId: 123, chatId: 42, messageIds: [100] },
    });
  });

  it('keeps the IDs with times only, but no content', async () => {
    await useHistory('minimal');
    await send({
      type: 'send',
      incognito: false,
      draft: { kind: 'selection', text: 'Hi' },
    });

    const [entry] = await historyStore.get();

    expect(entry?.content).toBeUndefined();
    expect(entry?.telegram).toEqual({
      botId: 123,
      chatId: 42,
      messageIds: [100],
    });
  });

  it('stores nothing in private windows or with history off, yet can undo', async () => {
    const draft = { kind: 'selection' as const, text: 'Hi' };
    const incognito = await send({ type: 'send', incognito: true, draft });

    await useHistory('off');

    const off = await send({ type: 'send', incognito: false, draft });

    expect(await historyStore.get()).toEqual([]);
    expect(incognito).toMatchObject({ sent: { messageIds: [100] } });
    expect(off).toMatchObject({ sent: { messageIds: [101] } });
    expect(off.ok && off.sent).not.toHaveProperty('entryId');
  });
});
