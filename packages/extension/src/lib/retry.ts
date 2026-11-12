import { type BotClient, TelegramError } from '@send-to-telegram/core';

import { SendFailure } from './failure.ts';

/**
 * Tries made within one send, while the popup's spinner turns. The waits
 * stay well under the 30 seconds an idle service worker is given.
 */
export const IN_PLACE = {
  /** Tries of one request, the first included. */
  attempts: 3,
  /** Before the second and third try after a network error or a 5xx. */
  delays: [1000, 3000],
  /** The longest `retry_after` waited out in place; a longer one is scheduled. */
  maxRetryAfter: 5000,
  /** All the waits of one send together. */
  budget: 10_000,
} as const;

/**
 * Why a send may go if tried again, or undefined when it can't succeed as
 * it is: a revoked token, a chat or topic that's gone, media Telegram turned
 * down, a compose error or a missing file.
 *
 * Only failures where the message certainly didn't go count:
 * - `network`: fetch rejected, which is how browsers report a connection
 *   that couldn't be made (offline, DNS, refused, TLS). Fetch can't tell
 *   that apart from a connection dropped after the whole request went and
 *   before Telegram answered, which would send twice. That window is
 *   Telegram's handling time, and no timeout of ours widens it.
 * - `rate_limited`: Telegram said to wait, so it didn't send.
 * - `server`: a 5xx, Telegram or its front servers saying it failed. Not
 *   504, a timeout after the request reached a server that may still send.
 *
 * An answer that came but couldn't be read (a 200 with a broken body) is not
 * retried: the message likely went.
 */
export type Retryable =
  | { kind: 'network' }
  | { kind: 'rate_limited'; afterMs: number }
  | { kind: 'server' };

export function retryableOf(cause: unknown): Retryable | undefined {
  // A failure this extension worded, about Telegram's error underneath.
  const error = cause instanceof SendFailure ? cause.cause : cause;

  if (!(error instanceof TelegramError)) return undefined;

  if (error.code === 0) return { kind: 'network' };

  if (error.code === 429) {
    return { kind: 'rate_limited', afterMs: (error.retryAfter ?? 1) * 1000 };
  }

  if (error.code >= 500 && error.code < 600 && error.code !== 504) {
    return { kind: 'server' };
  }

  return undefined;
}

/** False when the browser knows it's offline; waiting in place won't help then. */
export function isOnline(): boolean {
  return globalThis.navigator?.onLine ?? true;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** How long to wait before trying a request again in place, if at all. */
function inPlaceDelay(cause: unknown, attempt: number): number | undefined {
  const retry = retryableOf(cause);

  if (!retry || attempt >= IN_PLACE.attempts) return undefined;

  if (retry.kind === 'rate_limited') {
    return retry.afterMs <= IN_PLACE.maxRetryAfter ? retry.afterMs : undefined;
  }

  if (retry.kind === 'network' && !isOnline()) return undefined;

  return IN_PLACE.delays[attempt - 1];
}

/**
 * Tries each request again in place on a short wait. Each call stands for
 * one message, so a long text or a second album goes on from the part that
 * failed, and nothing that went is sent again.
 */
export function retryInPlace(bot: BotClient): BotClient {
  let waited = 0;

  return {
    async call(method, params) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await bot.call(method, params);
        } catch (cause) {
          const delay = inPlaceDelay(cause, attempt);

          if (delay === undefined || waited + delay > IN_PLACE.budget) {
            throw cause;
          }

          waited += delay;
          await wait(delay);
        }
      }
    },
  };
}
