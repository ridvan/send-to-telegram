import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import type { ChatItem } from '../hooks/use-chat-items.ts';
import { deleteMessages, deletionOf, withRemoved } from './chat-actions.ts';
import { keep } from './inbox.ts';
import {
  type HistoryEntry,
  historyStore,
  INBOX_REMOVED_FOR,
  type InboxEntry,
  inboxRemovedStore,
  inboxStore,
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

    await deleteMessages([out(sent), out(plain), into(received)], now);

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
    await deleteMessages([into(received)], now);
    await keep([received, other]);

    expect(await inboxStore.get()).toEqual([other]);
  });
});
