import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { z } from 'zod';

import { historyStore, inboxStore } from './settings.ts';
import { defineStore, loadStores } from './storage.ts';

describe('loadStores', () => {
  beforeEach(() => fakeBrowser.reset());

  it('reads what was saved before the page opened into every store', async () => {
    const received = {
      id: '7:1',
      destinationId: 'd1',
      receivedAt: 1_800_000_000_000,
      text: 'Sent from my phone',
    };

    const sent = {
      id: 'h1',
      sentAt: 1_800_000_000_000,
      kind: 'page',
      status: 'sent',
      content: { pageUrl: 'https://example.com/' },
    };

    await browser.storage.local.set({ inbox: [received], history: [sent] });
    await loadStores();

    expect(inboxStore.snapshot()).toEqual([received]);
    expect(historyStore.snapshot()).toEqual([sent]);
  });
});

describe('update', () => {
  it('applies changes made at the same time one after another, losing none', async () => {
    fakeBrowser.reset();

    const list = defineStore('concurrent', z.array(z.string()), () => []);

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((item) =>
        list.update((items) => [...items, item])
      )
    );

    expect([...(await list.get())].toSorted()).toEqual(['a', 'b', 'c', 'd']);
  });
});
