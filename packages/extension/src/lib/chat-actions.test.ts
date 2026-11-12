import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { z } from 'zod';

import type { ChatItem } from '../hooks/use-chat-items.ts';
import {
  deleteCopy,
  deleteMessages,
  deletionOf,
  TELEGRAM_DELETE_FOR,
  telegramDeletion,
  undoSend,
  withRemoved,
} from './chat-actions.ts';
import { keep } from './inbox.ts';
import {
  type Destination,
  type HistoryEntry,
  historyEntrySchema,
  historyStore,
  INBOX_REMOVED_FOR,
  type InboxEntry,
  inboxRemovedStore,
  inboxStore,
  settingsStore,
} from './settings.ts';

const now = 1_800_000_000_000;

const photo = {
  id: 'p',
  uniqueId: 'P',
  preview: { id: 'small', uniqueId: 'S' },
};

const sent: HistoryEntry = {
  id: 'h1',
  sentAt: now - 2000,
  kind: 'page',
  status: 'sent',
  content: {
    pageUrl: 'https://a.dev/',
    sentMedia: { media: 'photo', file: photo },
  },
};

const plain: HistoryEntry = { ...sent, id: 'h2', content: { note: 'Hi' } };

const received: InboxEntry = {
  id: '7:1',
  destinationId: 'd1',
  receivedAt: now - 1000,
  media: 'video',
  file: { id: 'v', uniqueId: 'V' },
};

const other: InboxEntry = { ...received, id: '7:2', text: 'Stays' };

const out = (entry: HistoryEntry): ChatItem => ({
  direction: 'out',
  time: entry.sentAt,
  entry,
});

const into = (message: InboxEntry): ChatItem => ({
  direction: 'in',
  time: message.receivedAt,
  message,
});

describe('deletionOf', () => {
  it('splits messages by store and names every cached file', () => {
    const {
      sent: ids,
      received: inbox,
      files,
    } = deletionOf([out(sent), out(plain), into(received)]);

    expect([...ids]).toEqual(['h1', 'h2']);
    expect([...inbox]).toEqual(['7:1']);
    expect(files).toEqual(['P', 'S', 'V']);
  });

  it('names the cached file of every album message', () => {
    const album: HistoryEntry = {
      ...sent,
      id: 'h3',
      content: {
        sentAlbum: [
          { media: 'photo', file: photo },
          {
            media: 'file',
            file: { id: 'd', uniqueId: 'D' },
            fileName: 'a.pdf',
          },
        ],
      },
    };

    expect(deletionOf([out(album)]).files).toEqual(['P', 'S', 'D']);
  });
});

describe('withRemoved', () => {
  it('marks new IDs once and drops marks Telegram has moved past', () => {
    const list = [
      { id: 'a', removedAt: now - 1000 },
      { id: 'old', removedAt: now - INBOX_REMOVED_FOR },
    ];

    expect(withRemoved(list, new Set(['a', 'b']), now)).toEqual([
      { id: 'a', removedAt: now },
      { id: 'b', removedAt: now },
    ]);
  });

  it('keeps the newest marks within the cap', () => {
    const many = Array.from({ length: 1500 }, (_, index) => ({
      id: String(index),
      removedAt: now - 1,
    }));

    const next = withRemoved(many, new Set(['new']), now);

    expect(next).toHaveLength(1000);
    expect(next[0]).toEqual({ id: 'new', removedAt: now });
  });
});

describe('deleteMessages', () => {
  beforeEach(() => fakeBrowser.reset());

  it('removes messages from this browser in one write per store', async () => {
    await historyStore.set([sent, plain]);
    await inboxStore.set([received, other]);

    const write = vi.spyOn(fakeBrowser.storage.local, 'set');

    await deleteMessages([out(sent), out(plain), into(received)], { now });

    expect(await historyStore.get()).toEqual([]);
    expect(await inboxStore.get()).toEqual([other]);
    expect(await inboxRemovedStore.get()).toEqual([
      { id: '7:1', removedAt: now },
    ]);

    // One write per store, whatever the number of messages.
    const keys = write.mock.calls.flatMap(([items]) => Object.keys(items));

    expect(keys.toSorted()).toEqual(['history', 'inbox', 'inboxRemoved']);
    write.mockRestore();
  });

  it('keeps a deleted message out when Telegram returns it again', async () => {
    await inboxStore.set([received, other]);
    await deleteMessages([into(received)], { now });
    await keep([received, other]);

    expect(await inboxStore.get()).toEqual([other]);
  });
});

const chat: Destination = {
  id: 'd1',
  kind: 'bot',
  token: '123:secret',
  chatId: -100_5,
  chatTitle: 'Team',
};

/** Sent to `chat` a minute ago, as two messages. */
const recent: HistoryEntry = {
  id: 's1',
  sentAt: now - 60_000,
  kind: 'selection',
  status: 'sent',
  destinationId: 'd1',
  telegram: { botId: 123, chatId: -100_5, messageIds: [10, 11] },
  content: { text: 'Hello' },
};

const second: HistoryEntry = {
  ...recent,
  id: 's2',
  telegram: { botId: 123, chatId: -100_5, messageIds: [12] },
};

const tooOld: HistoryEntry = {
  ...recent,
  id: 's3',
  sentAt: now - TELEGRAM_DELETE_FOR,
  telegram: { botId: 123, chatId: -100_5, messageIds: [5] },
};

describe('history entries', () => {
  it('read without Telegram’s IDs, as kept before', () => {
    const { telegram: _, ...old } = recent;

    expect(historyEntrySchema.parse(old)).toEqual(old);
  });

  it('keep the entry when its IDs can’t be read', () => {
    const parsed = historyEntrySchema.parse({
      ...recent,
      telegram: { botId: 'x', messageIds: [] },
    });

    expect(parsed.id).toBe('s1');
    expect(parsed.telegram).toBeUndefined();
  });
});

describe('telegramDeletion', () => {
  it('offers a recent sent message through its chat’s bot', () => {
    expect(telegramDeletion(recent, [chat], now)).toEqual({
      can: true,
      destination: chat,
      ref: recent.telegram,
    });
  });

  it('finds the bot in another chat entry for the same chat', () => {
    const topic: Destination = { ...chat, id: 'd2', topic: { id: 7 } };

    expect(telegramDeletion(recent, [topic], now)).toMatchObject({
      can: true,
      destination: topic,
    });
  });

  it('only removes here what Telegram can’t delete', () => {
    const { telegram: _, ...legacy } = recent;
    const otherBot = { ...chat, token: '999:other' };

    expect(telegramDeletion(legacy, [chat], now)).toEqual({
      can: false,
      why: 'kept',
    });
    expect(
      telegramDeletion({ ...recent, status: 'failed' }, [chat], now)
    ).toEqual({ can: false, why: 'kept' });
    expect(telegramDeletion(tooOld, [chat], now)).toEqual({
      can: false,
      why: 'too_old',
    });
    expect(telegramDeletion(recent, [otherBot], now)).toEqual({
      can: false,
      why: 'no_chat',
    });
  });
});

type Answer = { ok: true; result: true } | { ok: false; description: string };

/** Answers each delete call in turn, recording the IDs asked for. */
function telegramAnswering(...answers: Answer[]) {
  const asked: number[][] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = z
        .union([
          z.object({ message_ids: z.array(z.number()) }),
          z
            .object({ message_id: z.number() })
            .transform(({ message_id }) => ({ message_ids: [message_id] })),
        ])
        .parse(JSON.parse(String(init?.body)));

      asked.push(body.message_ids);

      const answer = answers.shift() ?? { ok: true, result: true };

      return new Response(
        JSON.stringify(answer.ok ? answer : { ...answer, error_code: 400 })
      );
    })
  );

  return asked;
}

describe('deleteMessages in Telegram', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await settingsStore.set({
      ...(await settingsStore.get()),
      destinations: [chat],
    });
    await historyStore.set([recent, second, tooOld]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('deletes every part of each message, one call each, then here', async () => {
    const asked = telegramAnswering();

    const outcome = await deleteMessages([out(recent), out(second)], {
      inTelegram: true,
      now,
    });

    expect(asked).toEqual([[10], [11], [12]]);
    expect(outcome).toEqual({ inTelegram: 2, kept: [] });
    expect(await historyStore.get()).toEqual([tooOld]);
  });

  it('keeps here what Telegram refused, and says why', async () => {
    const refused = {
      ok: false,
      description: "Bad Request: message can't be deleted for everyone",
    } as const;

    const asked = telegramAnswering(
      { ok: true, result: true },
      { ok: true, result: true },
      refused
    );

    const outcome = await deleteMessages([out(recent), out(second)], {
      inTelegram: true,
      now,
    });

    expect(asked).toEqual([[10], [11], [12]]);
    expect(outcome).toEqual({
      inTelegram: 1,
      kept: [out(second)],
      problem: deleteCopy.refused,
    });
    expect(await historyStore.get()).toEqual([second, tooOld]);
  });

  it('counts a message Telegram can’t find as deleted', async () => {
    telegramAnswering({
      ok: false,
      description: 'Bad Request: message to delete not found',
    });

    const outcome = await deleteMessages([out(recent)], {
      inTelegram: true,
      now,
    });

    expect(outcome).toEqual({ inTelegram: 1, kept: [] });
    expect(await historyStore.get()).toEqual([second, tooOld]);
  });

  it('stops at a failure about the chat, and keeps the rest', async () => {
    const asked = telegramAnswering({
      ok: false,
      description: 'Bad Request: chat not found',
    });

    const outcome = await deleteMessages([out(recent), out(second)], {
      inTelegram: true,
      now,
    });

    expect(asked).toEqual([[10]]);
    expect(outcome).toEqual({
      inTelegram: 0,
      kept: [out(recent), out(second)],
      problem: deleteCopy.chat_unavailable,
    });
  });

  it('deletes a large selection in batches, a refused one message by message', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...second,
      id: `m${index}`,
      telegram: { botId: 123, chatId: -100_5, messageIds: [100 + index] },
    }));

    await historyStore.set(many);

    const asked = telegramAnswering({
      ok: false,
      description: "Bad Request: message can't be deleted for everyone",
    });

    const outcome = await deleteMessages(many.map(out), {
      inTelegram: true,
      now,
    });

    expect(asked[0]).toHaveLength(12);
    expect(asked.slice(1)).toEqual(many.map((_, index) => [100 + index]));
    expect(outcome.inTelegram).toBe(12);
  });

  it('removes one too old for Telegram from here only', async () => {
    const asked = telegramAnswering();

    const outcome = await deleteMessages([out(tooOld)], {
      inTelegram: true,
      now,
    });

    expect(asked).toEqual([]);
    expect(outcome).toEqual({ inTelegram: 0, kept: [] });
    expect(await historyStore.get()).toEqual([recent, second]);
  });

  it('keeps everything when Telegram can’t be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const outcome = await deleteMessages([out(recent), out(second)], {
      inTelegram: true,
      now,
    });

    expect(outcome.kept).toHaveLength(2);
    expect(await historyStore.get()).toEqual([recent, second, tooOld]);
  });
});

describe('undoSend', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await settingsStore.set({
      ...(await settingsStore.get()),
      destinations: [chat],
    });
    await historyStore.set([recent, second]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('deletes the send in Telegram, then its entry', async () => {
    const asked = telegramAnswering();
    const { telegram } = recent;

    if (!telegram) throw new Error('The fixture has no IDs');

    expect(await undoSend({ ...telegram, entryId: 's1' })).toBeUndefined();
    expect(asked).toEqual([[10], [11]]);
    expect(await historyStore.get()).toEqual([second]);
  });

  it('deletes a long text one part a call, so a part that stayed is known', async () => {
    const asked = telegramAnswering();
    const messageIds = Array.from({ length: 12 }, (_, index) => 20 + index);

    await undoSend({ botId: 123, chatId: -100_5, messageIds });

    expect(asked).toEqual(messageIds.map((id) => [id]));
  });

  it('leaves the entry when Telegram keeps the message', async () => {
    telegramAnswering({
      ok: false,
      description: 'Bad Request: MESSAGE_ID_INVALID',
    });

    const problem = await undoSend({
      botId: 123,
      chatId: -100_5,
      messageIds: [10, 11],
      entryId: 's1',
    });

    expect(problem).toBe('Telegram didn’t delete it: MESSAGE_ID_INVALID');
    expect(await historyStore.get()).toEqual([recent, second]);
  });
});
