import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { downloadFile } from './telegram-files.ts';

const photo = { id: 'p', uniqueId: 'P' };
const options = { signal: new AbortController().signal, keep: false };

describe('downloadFile', () => {
  beforeEach(() => fakeBrowser.reset());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks nothing of Telegram until downloads are allowed', async () => {
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(
      async () => false
    );

    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);

    await expect(
      downloadFile('1:x', photo, { ...options, type: 'image/jpeg' })
    ).rejects.toMatchObject({ reason: 'not_allowed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloads the file getFile points at, typed for players', async () => {
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(
      async () => true
    );

    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/getFile')
        ? new Response(
            JSON.stringify({
              ok: true,
              result: { file_id: 'p', file_path: 'photos/file_0.jpg' },
            })
          )
        : new Response('bytes')
    );

    vi.stubGlobal('fetch', fetch);

    const blob = await downloadFile('1:x', photo, {
      ...options,
      type: 'image/jpeg',
    });

    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('bytes');
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      'https://api.telegram.org/file/bot1:x/photos/file_0.jpg'
    );
  });

  it('turns down files over 20 MB from their size alone', async () => {
    await expect(
      downloadFile(
        '1:x',
        { ...photo, size: 48_000_000 },
        { ...options, type: 'video/mp4' }
      )
    ).rejects.toMatchObject({ reason: 'too_big' });
  });
});
