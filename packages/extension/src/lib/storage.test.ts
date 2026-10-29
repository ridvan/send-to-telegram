import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { historyStore, inboxStore } from './settings.ts';
import { loadStores } from './storage.ts';

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
