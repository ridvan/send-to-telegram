import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { z } from 'zod';

import { loadAttachment, saveAttachment } from './attachments.ts';
import { pruneUnsentFiles, send } from './send.ts';
import {
  type Attachment,
  type HistoryMode,
  historyStore,
  settingsStore,
} from './settings.ts';

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

const photo = (id: string): Attachment => ({
  id,
  name: `${id}.png`,
  type: 'image/png',
  size: 3,
});

const pdf = (id: string): Attachment => ({
  id,
  name: `${id}.pdf`,
  type: 'application/pdf',
  size: 3,
});

/** What each `sendMediaGroup` asked for: its items' types and part names. */
const mediaSchema = z.array(
  z.object({
    type: z.string(),
    media: z.string(),
    caption: z.string().optional(),
  })
);

/**
 * Telegram answering albums with a message per item, and failing albums of
 * `failing` type with the description given.
 */
function albumTelegram(failing?: { type: string; description: string }) {
  let next = 200;
  const albums: z.infer<typeof mediaSchema>[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(input).split('/').at(-1);
      const body = init?.body;

      if (method !== 'sendMediaGroup' || !(body instanceof FormData)) {
        const message = {
          message_id: next++,
          chat: { id: 42, type: 'private' },
          document: { file_id: 'd', file_unique_id: 'D' },
        };

        return new Response(JSON.stringify({ ok: true, result: message }));
      }

      const media = mediaSchema.parse(JSON.parse(String(body.get('media'))));

      albums.push(media);

      if (media[0]?.type === failing?.type) {
        return new Response(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description: failing?.description,
          })
        );
      }

      const result = media.map((item, index) => ({
        message_id: next++,
        chat: { id: 42, type: 'private' },
        ...(item.type === 'photo'
          ? { photo: [{ file_id: `p${index}`, file_unique_id: `P${index}` }] }
          : {
              document: { file_id: `d${index}`, file_unique_id: `D${index}` },
            }),
      }));

      return new Response(JSON.stringify({ ok: true, result }));
    })
  );

  return albums;
}

describe('send an album', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    globalThis.indexedDB = new IDBFactory();
    await useHistory('full');

    for (const id of ['a', 'b', 'c', 'd']) {
      await saveAttachment(id, new Blob([id]));
    }
  });

  afterEach(() => vi.unstubAllGlobals());

  it('records every message of the album, to delete or undo it whole', async () => {
    const albums = albumTelegram();

    const outcome = await send({
      type: 'send',
      incognito: false,
      draft: {
        kind: 'page',
        note: 'Shots',
        attachments: [photo('a'), photo('b'), photo('c')],
      },
    });

    const [entry] = await historyStore.get();
    const ids = [200, 201, 202];

    expect(albums).toHaveLength(1);
    expect(albums[0]?.map((item) => item.media)).toEqual([
      'attach://file0',
      'attach://file1',
      'attach://file2',
    ]);
    expect(entry?.telegram?.messageIds).toEqual(ids);
    expect(outcome).toMatchObject({ ok: true, sent: { messageIds: ids } });
    expect(entry?.content?.attachments).toHaveLength(3);
    expect(entry?.content?.attachment).toBeUndefined();
    expect(entry?.content?.sentAlbum?.map((item) => item.media)).toEqual([
      'photo',
      'photo',
      'photo',
    ]);
    expect(await loadAttachment('a')).toBeUndefined();
  });

  it('sends photos and files as two albums, the caption with the last', async () => {
    const albums = albumTelegram();

    const outcome = await send({
      type: 'send',
      incognito: false,
      draft: {
        kind: 'page',
        note: 'Shots and notes',
        attachments: [photo('a'), pdf('b'), photo('c'), pdf('d')],
      },
    });

    expect(albums.map((album) => album.map((item) => item.type))).toEqual([
      ['photo', 'photo'],
      ['document', 'document'],
    ]);
    expect(albums[0]?.some((item) => item.caption)).toBe(false);
    expect(albums[1]?.map((item) => item.caption)).toEqual([
      undefined,
      'Shots and notes',
    ]);
    expect(outcome).toMatchObject({
      ok: true,
      sent: { messageIds: [200, 201, 202, 203] },
    });
  });

  it('records what went and what didn’t when the second album fails', async () => {
    albumTelegram({
      type: 'document',
      description: 'Bad Request: failed to send message #1',
    });

    const outcome = await send({
      type: 'send',
      incognito: false,
      draft: {
        kind: 'page',
        note: 'Shots and notes',
        attachments: [photo('a'), photo('b'), pdf('c'), pdf('d')],
      },
    });

    const [failed, sent] = await historyStore.get();

    expect(outcome).toMatchObject({
      ok: false,
      reason: 'rejected',
      sentFiles: ['a', 'b'],
    });
    expect(outcome.ok || outcome.message).toMatch(
      /^Only 2 of the 4 files went\. Telegram didn’t accept the files as an album/
    );
    expect(sent).toMatchObject({
      status: 'sent',
      telegram: { messageIds: [200, 201] },
      content: { attachments: [photo('a'), photo('b')] },
    });
    // The note was the failed album's caption, so only Send again sends it.
    expect(sent?.content?.note).toBeUndefined();
    expect(failed).toMatchObject({
      status: 'failed',
      content: { note: 'Shots and notes', attachments: [pdf('c'), pdf('d')] },
    });
    // Only what went is gone; Send again still has the rest.
    expect(await loadAttachment('a')).toBeUndefined();
    expect(await loadAttachment('c')).toBeDefined();
  });

  it('keeps every file of a failed album for Send again', async () => {
    albumTelegram({ type: 'photo', description: 'Bad Request: too big' });

    await send({
      type: 'send',
      incognito: false,
      draft: { kind: 'page', attachments: [photo('a'), photo('b')] },
    });

    const [entry] = await historyStore.get();

    expect(entry).toMatchObject({
      status: 'failed',
      error:
        'Telegram didn’t accept the files as an album: too big. Send them in separate messages, or remove the one it can’t take.',
      content: { attachments: [photo('a'), photo('b')] },
    });

    vi.useFakeTimers({ toFake: ['Date'] });

    try {
      vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
      await pruneUnsentFiles();
    } finally {
      vi.useRealTimers();
    }

    expect(await loadAttachment('a')).toBeDefined();
    expect(await loadAttachment('b')).toBeDefined();
  });

  it('sends to the chat’s topic', async () => {
    albumTelegram();

    const settings = await settingsStore.get();

    await settingsStore.set({
      ...settings,
      destinations: [{ ...chat, topic: { id: 9 } }],
    });

    await send({
      type: 'send',
      incognito: false,
      draft: { kind: 'page', attachments: [photo('a'), photo('b')] },
    });

    const fetched = vi.mocked(fetch).mock.calls[0]?.[1]?.body;

    expect(
      fetched instanceof FormData && fetched.get('message_thread_id')
    ).toBe('9');
  });
});
