import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { z } from 'zod';

import { loadAttachment, saveAttachment } from './attachments.ts';
import { lockNow, turnOnLock, unlock } from './lock.ts';
import { QUEUE_ALARM, scheduleWakeUp } from './queue.ts';
import {
  onQueueAlarm,
  pruneQueue,
  send,
  type SendRequest,
  sendQueued,
} from './send.ts';
import {
  type Attachment,
  type HistoryMode,
  historyStore,
  sendQueueStore,
  settingsStore,
} from './settings.ts';

const MINUTE = 60_000;

const chat = {
  id: 'd1',
  kind: 'bot' as const,
  token: '123:secret',
  chatId: 42,
  chatTitle: 'Saved',
};

/** How Telegram answers one request: a failure, or `ok` with the next ID. */
type Answer =
  | 'ok'
  | 'offline'
  | { code: number; description?: string; retryAfter?: number };

/**
 * Telegram answering requests in turn with `answers`, then `ok` to every
 * one after. Returns the texts it was sent, in order.
 */
function telegram(...answers: Answer[]) {
  let next = 100;
  const texts: string[] = [];

  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const answer = answers.shift() ?? 'ok';

    if (answer === 'offline') throw new TypeError('Failed to fetch');

    if (answer !== 'ok') {
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: answer.code,
          description: answer.description ?? 'Failed',
          ...(answer.retryAfter !== undefined && {
            parameters: { retry_after: answer.retryAfter },
          }),
        })
      );
    }

    const body = z
      .looseObject({ text: z.string().optional() })
      .parse(JSON.parse(String(init?.body)));

    texts.push(body.text ?? '');

    return new Response(
      JSON.stringify({
        ok: true,
        result: { message_id: next++, chat: { id: 42, type: 'private' } },
      })
    );
  });

  vi.stubGlobal('fetch', fetch);

  return { fetch, texts };
}

async function useHistory(mode: HistoryMode) {
  const settings = await settingsStore.get();

  await settingsStore.set({
    ...settings,
    destinations: [chat],
    history: { ...settings.history, mode },
  });
}

const page: SendRequest = {
  type: 'send',
  incognito: false,
  draft: { kind: 'page', pageUrl: 'https://example.com/' },
};

const longText = `${'a'.repeat(4000)}\n\n${'b'.repeat(200)}`;

const selection: SendRequest = {
  type: 'send',
  incognito: false,
  draft: { kind: 'selection', text: longText },
};

/**
 * Lets every wait pass at once until `work` is done. Files are read between
 * waits, on real ticks, so one pass of the fake clock may come too soon.
 */
async function settle<T>(work: Promise<T>): Promise<T> {
  let done = false;

  void work.finally(() => {
    done = true;
  });

  while (!done) {
    await vi.runAllTimersAsync();
    await new Promise((resolve) => setImmediate(resolve));
  }

  return work;
}

/** Sends, letting every wait in it pass at once. */
function sendNow(request: SendRequest) {
  return settle(send(request));
}

const fakeTimers: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'Date'],
};

/** Key derivation waits on real timers; the fake clock carries on after. */
async function withRealTimers<T>(run: () => Promise<T>) {
  const now = Date.now();

  vi.useRealTimers();
  await run();
  vi.useFakeTimers(fakeTimers);
  vi.setSystemTime(now);
}

/** Telegram's answer to a send that went, as message `id`. */
function sentAs(id: number) {
  return new Response(
    JSON.stringify({
      ok: true,
      result: { message_id: id, chat: { id: 42, type: 'private' } },
    })
  );
}

/** Long enough to leave for the queue, so no wait is left pending in place. */
function limited() {
  return new Response(
    JSON.stringify({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: 120 },
    })
  );
}

/**
 * Holds the first request until `answer` is called, then sends every later
 * one as Telegram would.
 */
function holdFirst() {
  let answer: (response: Response) => void = () => {};
  let next = 200;

  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        if (fetch.mock.calls.length === 1) answer = resolve;
        else resolve(sentAs(next++));
      })
  );

  vi.stubGlobal('fetch', fetch);

  return { fetch, answer: (response: Response) => answer(response) };
}

/** Moves the clock on, then runs what the alarm would. */
async function later(ms: number) {
  vi.setSystemTime(Date.now() + ms);
  await settle(sendQueued());
}

beforeEach(async () => {
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
  vi.useFakeTimers(fakeTimers);
  vi.setSystemTime(1_800_000_000_000);
  vi.stubGlobal('navigator', { onLine: true, language: 'en-US' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await useHistory('full');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('trying again in place', () => {
  it('waits out a short rate limit, then sends once', async () => {
    const { fetch } = telegram({ code: 429, retryAfter: 2 });

    expect(await sendNow(page)).toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('tries a network failure three times at most, then queues it', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline', 'offline');

    const outcome = await sendNow(page);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'network',
      queued: true,
    });
    expect(outcome.ok || outcome.message).toBe(
      'Couldn’t reach Telegram. Trying again in 1 min.'
    );
  });

  it('goes on from the part of a long text that failed', async () => {
    const { fetch, texts } = telegram('ok', { code: 502 });

    const outcome = await sendNow(selection);
    const [entry] = await historyStore.get();

    expect(outcome).toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(texts.map((text) => text[0])).toEqual(['a', 'b']);
    expect(entry?.telegram?.messageIds).toEqual([100, 101]);
  });

  it('leaves a long rate limit for later', async () => {
    const { fetch } = telegram({ code: 429, retryAfter: 120 });

    const outcome = await sendNow(page);
    const [item] = await sendQueueStore.get();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ queued: true, reason: 'rate_limited' });
    expect(item?.nextAt).toBe(Date.now() + 121_000);
  });

  it('doesn’t wait while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false, language: 'en-US' });
    const { fetch } = telegram('offline');

    const outcome = await sendNow(page);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(outcome.ok || outcome.message).toBe(
      'Couldn’t reach Telegram. Sending when you’re back online.'
    );
  });

  it.each([
    ['a revoked token', { code: 401, description: 'Unauthorized' }],
    ['a removed bot', { code: 403, description: 'Forbidden: bot was kicked' }],
    [
      'a chat that’s gone',
      { code: 400, description: 'Bad Request: chat not found' },
    ],
    [
      'a deleted topic',
      { code: 400, description: 'Bad Request: message thread not found' },
    ],
  ])('never tries %s again', async (_name, answer) => {
    const { fetch } = telegram(answer, 'ok');

    const outcome = await sendNow(page);
    const [entry] = await historyStore.get();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.ok || outcome.queued).toBeUndefined();
    expect(entry?.status).toBe('failed');
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('never queues a draft that can’t be sent', async () => {
    const { fetch } = telegram();

    const outcome = await sendNow({
      ...page,
      draft: {
        kind: 'page',
        attachment: { id: 'gone', name: 'a.pdf', type: '', size: 1 },
      },
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: 'unsendable' });
    expect(await sendQueueStore.get()).toEqual([]);
  });
});

describe('the queue', () => {
  it('keeps only entry IDs, tries and times, reusing the failed entry', async () => {
    telegram('offline', 'offline', 'offline');

    await sendNow(page);

    const [entry] = await historyStore.get();
    const queue = await sendQueueStore.get();

    expect(entry).toMatchObject({
      status: 'failed',
      content: { pageUrl: 'https://example.com/' },
    });
    expect(queue).toEqual([
      {
        entryId: entry?.id,
        attempts: 1,
        since: Date.now(),
        nextAt: Date.now() + MINUTE,
      },
    ]);
  });

  it('sends a waiting message when it’s due, as a normal sent one', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline');

    await sendNow(page);

    const [failed] = await historyStore.get();

    await later(30_000);
    expect(fetch).toHaveBeenCalledTimes(3);

    await later(30_000);

    const [entry] = await historyStore.get();

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(entry).toMatchObject({
      id: failed?.id,
      status: 'sent',
      telegram: { botId: 123, chatId: 42, messageIds: [100] },
    });
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('backs off between tries, then gives up as a normal failure', async () => {
    telegram(...Array<Answer>(200).fill({ code: 500 }));

    await sendNow(page);

    const nextWaits: number[] = [];

    for (let tries = 0; tries < 40; tries++) {
      const [item] = await sendQueueStore.get();

      if (!item) break;

      nextWaits.push(Math.round((item.nextAt - Date.now()) / MINUTE));
      await later(item.nextAt - Date.now());
    }

    const [entry] = await historyStore.get();

    expect(nextWaits.slice(0, 7)).toEqual([1, 2, 5, 10, 30, 60, 60]);
    // A day: 48 minutes of backoff, then hourly, for 29 tries in all.
    expect(nextWaits.length).toBe(28);
    expect(entry).toMatchObject({
      status: 'failed',
      error: expect.any(String),
    });
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('sends only the rest of a long text that stopped part of the way', async () => {
    const { texts } = telegram('ok', 'offline', 'offline', 'offline');

    await sendNow(selection);

    const [failed] = await historyStore.get();

    expect(failed).toMatchObject({
      status: 'failed',
      partsSent: 1,
      telegram: { messageIds: [100] },
    });

    await later(MINUTE);

    const [entry] = await historyStore.get();

    expect(texts.map((text) => text[0])).toEqual(['a', 'b']);
    expect(entry).toMatchObject({
      status: 'sent',
      telegram: { messageIds: [100, 101] },
    });
  });

  it.each([
    ['private windows', 'full', true],
    ['Times only', 'minimal', false],
    ['history off', 'off', false],
  ] as const)('queues nothing for %s', async (_name, mode, incognito) => {
    await useHistory(mode);
    const { fetch } = telegram('offline', 'offline', 'offline', 'offline');

    const outcome = await sendNow({ ...page, incognito });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(outcome).toMatchObject({ ok: false, reason: 'network' });
    expect(outcome.ok || outcome.queued).toBeUndefined();
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('tries nothing while locked, and goes on after unlocking', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline');

    await sendNow(page);
    await withRealTimers(async () => {
      await turnOnLock('correct horse', 1000);
      await lockNow();
    });

    await later(2 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(3);

    await withRealTimers(() => unlock('correct horse'));

    await later(0);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect((await historyStore.get())[0]?.status).toBe('sent');
  });

  it('sends once when Send again is pressed during a try', async () => {
    telegram('offline', 'offline', 'offline');
    await sendNow(page);

    const [failed] = await historyStore.get();
    let answer: (response: Response) => void = () => {};

    const slow = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        })
    );

    vi.stubGlobal('fetch', slow);
    vi.setSystemTime(Date.now() + MINUTE);

    const queued = sendQueued();

    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1));

    const byHand = send({ ...page, retryOf: failed?.id });

    answer(
      new Response(
        JSON.stringify({
          ok: true,
          result: { message_id: 7, chat: { id: 42, type: 'private' } },
        })
      )
    );
    await vi.runAllTimersAsync();
    await queued;

    expect(await byHand).toMatchObject({ ok: true });
    expect(slow).toHaveBeenCalledTimes(1);

    // Pressed again on the stale entry, after it went.
    expect(await sendNow({ ...page, retryOf: failed?.id })).toMatchObject({
      ok: true,
      sent: { messageIds: [7] },
    });
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('starts over when sent by hand, out of the queue if it goes', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline');

    await sendNow(page);

    const [failed] = await historyStore.get();

    expect(await sendNow({ ...page, retryOf: failed?.id })).toMatchObject({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('drops a message deleted from history', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline');

    await sendNow(page);
    await historyStore.set([]);
    await pruneQueue();

    expect(await sendQueueStore.get()).toEqual([]);

    await later(MINUTE);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('leaves a try the worker stopped in the middle of for you to check', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline');

    await sendNow(page);
    await sendQueueStore.update((queue) =>
      queue.map((item) => ({ ...item, tryingSince: Date.now() }))
    );

    await later(MINUTE);

    const [entry] = await historyStore.get();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(entry?.error).toMatch(/Check the chat in Telegram/);
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('wakes on its alarm when the next try is due', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline');

    await sendNow(page);
    await scheduleWakeUp();

    const alarm = await browser.alarms.get(QUEUE_ALARM);

    expect(alarm?.scheduledTime).toBe(Date.now() + MINUTE);

    vi.setSystemTime(Date.now() + MINUTE);
    browser.alarms.onAlarm.addListener((fired) => void onQueueAlarm(fired));
    await fakeBrowser.alarms.onAlarm.trigger({
      name: QUEUE_ALARM,
      scheduledTime: Date.now(),
      persistAcrossSessions: true,
    });
    await vi.runAllTimersAsync();
    await vi.waitFor(async () =>
      expect((await historyStore.get())[0]?.status).toBe('sent')
    );

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(await browser.alarms.get(QUEUE_ALARM)).toBeUndefined();
  });

  it('keeps a message that fails again where it was in history', async () => {
    telegram('offline', 'offline', 'offline');
    await sendNow(page);

    const [waiting] = await historyStore.get();

    vi.setSystemTime(Date.now() + 10_000);
    telegram();
    await sendNow({
      ...page,
      draft: { kind: 'page', pageUrl: 'https://b.example/' },
    });

    telegram({ code: 500 }, { code: 500 }, { code: 500 });
    await later(MINUTE);

    const history = await historyStore.get();

    expect(history.map((entry) => entry.status)).toEqual(['sent', 'failed']);
    expect(history[1]).toMatchObject({
      id: waiting?.id,
      sentAt: waiting?.sentAt,
    });
    expect(await sendQueueStore.get()).toMatchObject([{ attempts: 2 }]);
  });

  it('queues only the album that didn’t go, carrying its tries over', async () => {
    const file = (id: string, type: string): Attachment => ({
      id,
      name: id,
      type,
      size: 1,
    });

    const files = [
      file('a', 'image/png'),
      file('b', 'image/png'),
      file('c', 'application/pdf'),
      file('d', 'application/pdf'),
    ];

    await withRealTimers(() =>
      Promise.all(files.map(({ id }) => saveAttachment(id, new Blob([id]))))
    );

    let documentsReach = false;
    let next = 300;

    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const media = z
          .array(z.looseObject({ type: z.string() }))
          .parse(
            JSON.parse(
              String(init?.body instanceof FormData && init.body.get('media'))
            )
          );

        if (media[0]?.type === 'document' && !documentsReach) {
          throw new TypeError('Failed to fetch');
        }

        return new Response(
          JSON.stringify({
            ok: true,
            result: media.map(() => ({
              message_id: next++,
              chat: { id: 42, type: 'private' },
            })),
          })
        );
      }
    );

    vi.stubGlobal('fetch', fetch);

    const outcome = await sendNow({
      ...page,
      draft: { kind: 'page', attachments: files },
    });

    const [rest, sent] = await historyStore.get();
    const [item] = await sendQueueStore.get();

    expect(outcome).toMatchObject({
      ok: false,
      queued: true,
      sentFiles: ['a', 'b'],
    });
    expect(sent).toMatchObject({
      status: 'sent',
      telegram: { messageIds: [300, 301] },
    });
    expect(rest).toMatchObject({
      status: 'failed',
      content: { attachments: [files[2], files[3]] },
    });
    expect(item).toMatchObject({ entryId: rest?.id, attempts: 1 });
    // The rest's files stay for the next try.
    expect(await loadAttachment('c')).toBeDefined();

    documentsReach = true;
    await later(MINUTE);

    expect((await historyStore.get())[0]).toMatchObject({
      id: rest?.id,
      status: 'sent',
      telegram: { messageIds: [302, 303] },
    });
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it.each([
    ['fails again', limited],
    ['goes', () => sentAs(7)],
  ])(
    'drops a message deleted while the queue tries it, when the try %s',
    async (_name, response) => {
      telegram('offline', 'offline', 'offline');
      await sendNow(page);

      const held = holdFirst();

      vi.setSystemTime(Date.now() + MINUTE);

      const queued = sendQueued();

      await vi.waitFor(() => expect(held.fetch).toHaveBeenCalledTimes(1));

      // Deleted in the popup, which the background follows by pruning.
      await historyStore.set([]);
      await pruneQueue();

      held.answer(response());
      await settle(queued);

      expect(await historyStore.get()).toEqual([]);
      expect(await sendQueueStore.get()).toEqual([]);
    }
  );

  it('goes on with the queue when a try can’t be recorded, and tries it again', async () => {
    telegram('offline', 'offline', 'offline');
    await sendNow(page);
    await withRealTimers(() => turnOnLock('correct horse', 1000));

    const held = holdFirst();

    vi.setSystemTime(Date.now() + MINUTE);

    const queued = sendQueued();

    await vi.waitFor(() => expect(held.fetch).toHaveBeenCalledTimes(1));

    // Auto-lock, mid-try: the failure can't be written to sealed history.
    await lockNow();
    held.answer(limited());
    await settle(queued);

    const [item] = await sendQueueStore.get();

    expect(item?.tryingSince).toBeUndefined();
    expect(await browser.alarms.get(QUEUE_ALARM)).toBeDefined();

    await withRealTimers(() => unlock('correct horse'));
    await later(0);

    const [entry] = await historyStore.get();

    expect(held.fetch).toHaveBeenCalledTimes(2);
    expect(entry?.status).toBe('sent');
  });

  it('leaves alone a message sent by hand while an earlier one was tried', async () => {
    telegram(...Array<Answer>(6).fill('offline'));
    await sendNow(page);
    await sendNow({
      ...page,
      draft: { kind: 'page', pageUrl: 'https://b.example/' },
    });

    const [second] = await historyStore.get();
    const held = holdFirst();

    vi.setSystemTime(Date.now() + MINUTE);

    const queued = sendQueued();

    await vi.waitFor(() => expect(held.fetch).toHaveBeenCalledTimes(1));

    // Sent from the popup meanwhile, then the connection went.
    await sendNow({ ...page, retryOf: second?.id });
    vi.stubGlobal('navigator', { onLine: false, language: 'en-US' });
    held.answer(sentAs(7));
    await settle(queued);

    expect(held.fetch).toHaveBeenCalledTimes(2);
    expect(await sendQueueStore.get()).toEqual([]);
  });

  it('tries at once what waited for the connection, when it comes back during a run', async () => {
    telegram('offline', 'offline', 'offline');
    await sendNow(page);
    vi.setSystemTime(Date.now() + 30_000);
    telegram('offline', 'offline', 'offline');
    await sendNow({
      ...page,
      draft: { kind: 'page', pageUrl: 'https://b.example/' },
    });

    const held = holdFirst();

    // The first is due, the second in half a minute.
    vi.setSystemTime(Date.now() + 30_000);

    const queued = sendQueued();

    await vi.waitFor(() => expect(held.fetch).toHaveBeenCalledTimes(1));

    const online = sendQueued({ early: true });

    held.answer(sentAs(7));
    await settle(Promise.all([queued, online]));

    expect(held.fetch).toHaveBeenCalledTimes(2);
    expect((await historyStore.get()).map((entry) => entry.status)).toEqual([
      'sent',
      'sent',
    ]);
  });

  it('stops a long text whose parts would split differently now', async () => {
    const { texts } = telegram('ok', 'offline', 'offline', 'offline');

    const titled: SendRequest = {
      ...page,
      draft: {
        kind: 'page',
        note: longText,
        pageTitle: 'Example',
        pageUrl: 'https://example.com/',
      },
    };

    await sendNow(titled);

    // Without a preview, the title goes with the link.
    const settings = await settingsStore.get();

    await settingsStore.set({
      ...settings,
      delivery: { ...settings.delivery, linkPreview: false },
    });
    await later(MINUTE);

    const [entry] = await historyStore.get();

    expect(texts).toHaveLength(1);
    expect(entry).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/Check the chat in Telegram/),
      telegram: { messageIds: [100] },
    });
    expect(entry?.partsSent).toBeUndefined();
    expect(await sendQueueStore.get()).toEqual([]);

    // Sent again after that, it goes whole.
    await sendNow({ ...titled, retryOf: entry?.id });
    expect(texts.map((text) => text[0])).toEqual(['a', 'a', 'b']);
  });

  it('goes on with a long text when a setting changes that doesn’t split it', async () => {
    const { texts } = telegram('ok', 'offline', 'offline', 'offline');

    await sendNow(selection);

    const settings = await settingsStore.get();

    await settingsStore.set({
      ...settings,
      delivery: { ...settings.delivery, linkPreview: false },
    });
    await later(MINUTE);

    expect(texts.map((text) => text[0])).toEqual(['a', 'b']);
    expect((await historyStore.get())[0]?.status).toBe('sent');
  });

  it('waits offline without spending tries', async () => {
    const { fetch } = telegram('offline', 'offline', 'offline');

    await sendNow(page);
    vi.stubGlobal('navigator', { onLine: false, language: 'en-US' });
    await later(5 * MINUTE);

    const [item] = await sendQueueStore.get();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(item).toMatchObject({ attempts: 1, nextAt: Date.now() + MINUTE });
  });
});
