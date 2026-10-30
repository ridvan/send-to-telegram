import type { IncomingMessage, Update } from '@send-to-telegram/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  checkInbox,
  inboxEntriesIn,
  isSameChat,
  keep,
  toInboxEntry,
} from './inbox.ts';
import {
  type BotDestination,
  inboxRemovedStore,
  inboxStore,
} from './settings.ts';

const me = { id: 7, type: 'private', first_name: 'Rıdvan' } as const;

const group = {
  id: -100123,
  type: 'supergroup',
  title: 'Design crit',
  username: 'designcrit',
} as const;

const ana = { id: 8, is_bot: false, first_name: 'Ana' };

function message(fields: Partial<IncomingMessage>): IncomingMessage {
  return { message_id: 1, chat: me, date: 1_800_000_000, ...fields };
}

describe('isSameChat', () => {
  it('matches numeric IDs, typed or as text, and usernames', () => {
    expect(isSameChat(group, -100123)).toBe(true);
    expect(isSameChat(group, '-100123')).toBe(true);
    expect(isSameChat(group, '@DesignCrit')).toBe(true);
    expect(isSameChat(group, 7)).toBe(false);
    expect(isSameChat(me, '@designcrit')).toBe(false);
  });
});

describe('toInboxEntry', () => {
  it('keeps the text and when it was sent', () => {
    expect(toInboxEntry(message({ text: 'Hello' }), 'd1')).toEqual({
      id: '7:1',
      destinationId: 'd1',
      receivedAt: 1_800_000_000_000,
      text: 'Hello',
    });
  });

  it('leaves out commands and messages with nothing to show', () => {
    const command = { type: 'bot_command', offset: 0, length: 6 };

    expect(
      toInboxEntry(message({ text: '/start abc', entities: [command] }), 'd1')
    ).toBeUndefined();
    expect(toInboxEntry(message({}), 'd1')).toBeUndefined();
    expect(toInboxEntry(message({ text: '/ means or' }), 'd1')).toMatchObject({
      text: '/ means or',
    });
  });

  it('turns found and hidden links into absolute URLs', () => {
    const entry = toInboxEntry(
      message({
        text: 'See example.com/a and this',
        entities: [
          { type: 'url', offset: 4, length: 13 },
          { type: 'text_link', offset: 22, length: 4, url: 'https://b.dev/' },
          { type: 'text_link', offset: 0, length: 3, url: 'tg://user?id=1' },
          { type: 'bold', offset: 0, length: 3 },
        ],
      }),
      'd1'
    );

    expect(entry?.links).toEqual([
      { offset: 4, length: 13, url: 'https://example.com/a' },
      { offset: 22, length: 4, url: 'https://b.dev/' },
    ]);
  });

  it('shows media by kind, with the caption and its links', () => {
    expect(
      toInboxEntry(
        message({
          photo: [{ file_id: 'p' }],
          caption: 'https://a.dev',
          caption_entities: [{ type: 'url', offset: 0, length: 13 }],
        }),
        'd1'
      )
    ).toMatchObject({
      media: 'photo',
      text: 'https://a.dev',
      links: [{ offset: 0, length: 13, url: 'https://a.dev' }],
    });
    expect(
      toInboxEntry(
        message({ document: { file_id: 'f', file_name: 'plan.pdf' } }),
        'd1'
      )
    ).toMatchObject({ media: 'file', fileName: 'plan.pdf' });
    expect(
      toInboxEntry(message({ sticker: { file_id: 's', emoji: '👍' } }), 'd1')
    ).toMatchObject({ text: '👍' });
  });

  it('keeps what it takes to download media, never a download path', () => {
    const photo = toInboxEntry(
      message({
        photo: [
          { file_id: 's', file_unique_id: 'S', width: 90, height: 60 },
          { file_id: 'm', file_unique_id: 'M', width: 800, height: 533 },
          {
            file_id: 'l',
            file_unique_id: 'L',
            width: 1280,
            height: 853,
            file_size: 180_000,
          },
        ],
      }),
      'd1'
    );

    expect(photo?.file).toEqual({
      id: 'l',
      uniqueId: 'L',
      width: 1280,
      height: 853,
      size: 180_000,
      preview: { id: 'm', uniqueId: 'M', width: 800, height: 533 },
    });

    const song = toInboxEntry(
      message({
        audio: {
          file_id: 'a',
          file_unique_id: 'A',
          duration: 214,
          mime_type: 'audio/mpeg',
          title: 'Song',
          thumbnail: { file_id: 't', file_unique_id: 'T' },
        },
      }),
      'd1'
    );

    expect(song).toMatchObject({
      media: 'audio',
      file: {
        id: 'a',
        uniqueId: 'A',
        duration: 214,
        mimeType: 'audio/mpeg',
        title: 'Song',
        preview: { id: 't', uniqueId: 'T' },
      },
    });
    expect(
      toInboxEntry(message({ animation: { file_id: 'g' } }), 'd1')?.media
    ).toBe('animation');
  });

  it('names the sender only in groups', () => {
    expect(
      toInboxEntry(message({ chat: group, from: ana, text: 'Hi' }), 'd1')?.from
    ).toBe('Ana');
    expect(
      toInboxEntry(message({ from: ana, text: 'Hi' }), 'd1')?.from
    ).toBeUndefined();
  });
});

const destination: BotDestination = {
  id: 'd1',
  kind: 'bot',
  token: '1:x',
  chatId: -100123,
};

describe('inboxEntriesIn', () => {
  it('keeps messages from the destination’s chat only, not channel posts', () => {
    const updates: Update[] = [
      { update_id: 1, message: message({ chat: group, text: 'In group' }) },
      { update_id: 2, message: message({ text: 'Elsewhere' }) },
      {
        update_id: 3,
        channel_post: message({ chat: group, message_id: 2, text: 'Post' }),
      },
      {
        update_id: 4,
        my_chat_member: {
          chat: group,
          from: ana,
          new_chat_member: { status: 'member' },
        },
      },
    ];

    expect(
      inboxEntriesIn(updates, destination).map((entry) => entry.text)
    ).toEqual(['In group']);
  });
});

describe('checkInbox', () => {
  const signal = new AbortController().signal;

  /** What the Bot API answers to `getUpdates`. */
  type Answer =
    | { ok: true; result: Update[] }
    | { ok: false; error_code: number; description: string };

  function answer(body: Answer) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body)))
    );
  }

  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.unstubAllGlobals());

  it('keeps each message once, however often it reads', async () => {
    answer({
      ok: true,
      result: [
        { update_id: 1, message: message({ chat: group, text: 'One' }) },
      ],
    });

    expect(await checkInbox(destination, signal)).toBe('ok');
    expect(await checkInbox(destination, signal)).toBe('ok');
    expect((await inboxStore.get()).map((entry) => entry.text)).toEqual([
      'One',
    ]);
  });

  it('reports a bot whose updates go to a webhook', async () => {
    answer({
      ok: false,
      error_code: 409,
      description: 'Conflict: can’t use getUpdates while webhook is active',
    });

    expect(await checkInbox(destination, signal)).toBe('elsewhere');
    expect(await inboxStore.get()).toEqual([]);
  });
});

describe('keep', () => {
  beforeEach(() => fakeBrowser.reset());

  const fresh = {
    id: '7:1',
    destinationId: 'd1',
    receivedAt: 1_800_000_000_000,
    media: 'photo',
    file: { id: 'l', uniqueId: 'L' },
  } as const;

  it('fills in a message kept before media could be shown', async () => {
    const { file: _file, ...old } = fresh;

    await inboxStore.set([old]);
    await keep([fresh]);

    expect(await inboxStore.get()).toEqual([fresh]);
  });

  it('writes nothing when every message reads the same', async () => {
    await keep([fresh]);

    const set = vi.spyOn(inboxStore, 'set');

    await keep([{ ...fresh, file: { uniqueId: 'L', id: 'l' } }]);

    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });

  it('leaves out messages deleted from this browser', async () => {
    const other = { ...fresh, id: '7:2' };

    await inboxRemovedStore.set([{ id: fresh.id, removedAt: Date.now() }]);
    await keep([fresh, other]);
    await keep([fresh, other]);

    expect(await inboxStore.get()).toEqual([other]);
  });

  it('drops a deleted message a read already under way put back', async () => {
    await inboxStore.set([fresh]);
    await inboxRemovedStore.set([{ id: fresh.id, removedAt: Date.now() }]);
    await keep([]);

    expect(await inboxStore.get()).toEqual([]);
  });
});
