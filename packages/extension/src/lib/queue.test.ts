import { TelegramError } from '@send-to-telegram/core';
import { describe, expect, it } from 'vitest';

import { SendFailure } from './failure.ts';
import { nextTry, QUEUE, waitingCopy } from './queue.ts';
import { retryableOf } from './retry.ts';

const MINUTE = 60_000;
const network = { kind: 'network' } as const;

describe('nextTry', () => {
  it('backs off from a minute to an hour, then hourly', () => {
    let item = nextTry('e', network, undefined, 0);
    const waits: number[] = [];

    for (let at = 0; item && waits.length < 8;) {
      waits.push((item.nextAt - at) / MINUTE);
      at = item.nextAt;
      item = nextTry('e', network, item, at);
    }

    expect(waits).toEqual([1, 2, 5, 10, 30, 60, 60, 60]);
  });

  it('waits at least as long as Telegram asked', () => {
    const item = nextTry(
      'e',
      { kind: 'rate_limited', afterMs: 600_000 },
      undefined,
      0
    );

    expect(item).toMatchObject({ nextAt: 601_000, notBefore: 601_000 });
  });

  it('gives up after its last try', () => {
    const last = {
      entryId: 'e',
      attempts: QUEUE.maxAttempts - 1,
      since: 0,
      nextAt: 0,
    };

    expect(nextTry('e', network, last, MINUTE)).toBeUndefined();
  });

  it('gives up a day after the first failure', () => {
    const first = nextTry('e', network, undefined, 0);

    expect(first).toBeDefined();
    expect(nextTry('e', network, first, QUEUE.maxAge - MINUTE)).toBeUndefined();
  });
});

describe('retryableOf', () => {
  it('retries what certainly didn’t go: network failures, rate limits and 5xx', () => {
    expect(retryableOf(new TelegramError(0, 'Could not reach'))).toEqual({
      kind: 'network',
    });
    expect(retryableOf(new TelegramError(429, 'Too Many', 7))).toEqual({
      kind: 'rate_limited',
      afterMs: 7000,
    });
    expect(retryableOf(new TelegramError(502, 'Bad Gateway'))).toEqual({
      kind: 'server',
    });
  });

  it('never retries what can’t succeed, or may have gone', () => {
    for (const code of [400, 401, 403, 504, 200]) {
      expect(retryableOf(new TelegramError(code, 'No'))).toBeUndefined();
    }

    expect(retryableOf(new Error('Compose'))).toBeUndefined();
    expect(
      retryableOf(new SendFailure('unsendable', 'The file is no longer saved.'))
    ).toBeUndefined();
  });
});

describe('waitingCopy', () => {
  const item = { entryId: 'e', attempts: 1, since: 0, nextAt: 2 * MINUTE };

  it('says when it tries again, or that it waits for the connection', () => {
    expect(waitingCopy(item, true, 0)).toBe('Trying again in 2 min');
    expect(waitingCopy({ ...item, nextAt: 90 * MINUTE }, true, 0)).toBe(
      'Trying again in 2 hours'
    );
    expect(waitingCopy(item, false, 0)).toBe('Sending when you’re back online');
    expect(waitingCopy(item, true, 3 * MINUTE)).toBe('Trying again now');
  });
});
