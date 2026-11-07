import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  handoffWaiting,
  pickForPopup,
  type SelectAreaRequest,
  takeHandoff,
} from './area.ts';
import { loadAttachment, saveAttachment } from './attachments.ts';
import { CaptureError } from './screenshot.ts';

const file = { id: 'f1', name: 'notes.txt', type: 'text/plain', size: 5 };

const request: SelectAreaRequest = {
  type: 'select-area',
  tabId: 3,
  windowId: 1,
  note: 'Look',
  destinationId: 'd1',
  attachment: file,
};

async function stored(id: string) {
  return (await loadAttachment(id))?.text();
}

beforeEach(async () => {
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
  await saveAttachment(file.id, new Blob(['hello']));
});

describe('pickForPopup', () => {
  it('gives the draft and its file back when cancelled', async () => {
    expect(await pickForPopup(request, async () => 'cancelled')).toBe(true);

    expect(await takeHandoff(3)).toMatchObject({
      note: 'Look',
      destinationId: 'd1',
      attachment: file,
    });
    expect(await stored(file.id)).toBe('hello');
  });

  it('says why when the page refuses, keeping the file', async () => {
    await pickForPopup(request, async () => {
      throw new CaptureError('Open a website and try again.');
    });

    expect(await takeHandoff(3)).toMatchObject({
      attachment: file,
      problem: 'Open a website and try again.',
    });
  });

  it('leaves the pick under way to reopen the popup', async () => {
    expect(await pickForPopup(request, async () => 'busy')).toBe(false);

    expect(await handoffWaiting()).toBe(false);
    expect(await stored(file.id)).toBeUndefined();
  });

  it('deletes the file of a draft it replaces', async () => {
    await pickForPopup(request, async () => 'cancelled');
    await pickForPopup(
      { ...request, tabId: 4, attachment: undefined },
      async () => 'cancelled'
    );

    expect(await stored(file.id)).toBeUndefined();
  });
});

describe('takeHandoff', () => {
  it('keeps another tab’s draft for that tab', async () => {
    await pickForPopup(request, async () => 'cancelled');

    expect(await takeHandoff(4)).toBeUndefined();
    expect(await handoffWaiting()).toBe(true);
    expect(await takeHandoff(3)).toBeDefined();
    expect(await handoffWaiting()).toBe(false);
  });

  it('drops an old draft and its file', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    try {
      await pickForPopup(request, async () => 'cancelled');
      vi.setSystemTime(Date.now() + 6 * 60_000);

      expect(await handoffWaiting()).toBe(false);
      expect(await takeHandoff(3)).toBeUndefined();
      expect(await stored(file.id)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
