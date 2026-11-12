import { browser } from 'wxt/browser';

import { formatCount, plural } from './format.ts';
import type { Retryable } from './retry.ts';
import {
  type HistoryEntry,
  type QueuedSend,
  sendQueueStore,
  type Settings,
} from './settings.ts';

const MINUTE = 60_000;

/** Sends tried again later, after the in-place tries gave out. */
export const QUEUE = {
  /**
   * Waits after the 1st, 2nd, 3rd… failed try; the last repeats. Starts at a
   * minute, which older Chrome versions held alarms to at the least.
   */
  delays: [1, 2, 5, 10, 30, 60].map((minutes) => minutes * MINUTE),
  /** Tries in all, the first send included. */
  maxAttempts: 30,
  /** Given up this long after the first try failed. */
  maxAge: 24 * 60 * MINUTE,
  /** How often to look again while offline; these looks aren't tries. */
  offlineCheck: MINUTE,
} as const;

export const QUEUE_ALARM = 'send-queue';

/**
 * Whether a failed send may wait in the queue: only where its failed entry
 * already keeps the message, so nothing is stored twice or anywhere new.
 */
export function canQueue(settings: Settings, incognito: boolean): boolean {
  return !incognito && settings.history.mode === 'full';
}

/** The queue's item after another failed try, or undefined to give up. */
export function nextTry(
  entryId: string,
  retry: Retryable,
  previous: QueuedSend | undefined,
  now = Date.now()
): QueuedSend | undefined {
  const attempts = (previous?.attempts ?? 0) + 1;
  const since = previous?.since ?? now;
  const delay = QUEUE.delays[Math.min(attempts, QUEUE.delays.length) - 1] ?? 0;

  const notBefore =
    retry.kind === 'rate_limited' ? now + retry.afterMs + 1000 : undefined;

  const nextAt = Math.max(now + delay, notBefore ?? 0);

  if (attempts >= QUEUE.maxAttempts || nextAt - since > QUEUE.maxAge) {
    return undefined;
  }

  return {
    entryId,
    attempts,
    since,
    nextAt,
    ...(notBefore !== undefined && { notBefore }),
  };
}

export function queueItem(entryId: string) {
  return sendQueueStore
    .get()
    .then((queue) => queue.find((item) => item.entryId === entryId));
}

/** Adds or replaces the entry's place in the queue. */
export function enqueue(item: QueuedSend) {
  return sendQueueStore.update((queue) => [
    ...queue.filter((other) => other.entryId !== item.entryId),
    item,
  ]);
}

export function dequeue(entryId: string) {
  return sendQueueStore.update((queue) =>
    queue.some((item) => item.entryId === entryId)
      ? queue.filter((item) => item.entryId !== entryId)
      : queue
  );
}

/** Marks a try under way, so one cut off by the worker stopping isn't repeated. */
export function markTrying(entryId: string, now = Date.now()) {
  return sendQueueStore.update((queue) =>
    queue.map((item) =>
      item.entryId === entryId ? { ...item, tryingSince: now } : item
    )
  );
}

/** Unmarks a try that certainly sent nothing, so it's tried again, not set aside. */
export function doneTrying(entryId: string) {
  return sendQueueStore.update((queue) =>
    queue.map((item) => {
      if (item.entryId !== entryId) return item;

      const { tryingSince: _, ...rest } = item;

      return rest;
    })
  );
}

/** Moves an item's next look, if it's still queued. */
export function putOff(entryId: string, nextAt: number) {
  return sendQueueStore.update((queue) =>
    queue.map((item) => (item.entryId === entryId ? { ...item, nextAt } : item))
  );
}

/**
 * Whether an item can still go: its entry is in history, still failed and
 * still keeps the message. One deleted, sent by hand or stripped of its
 * content by a history setting drops out.
 */
export function stillQueued(
  entry: HistoryEntry | undefined,
  settings: Settings
): entry is HistoryEntry {
  return (
    entry?.status === 'failed' &&
    entry.content !== undefined &&
    settings.history.mode === 'full'
  );
}

/** Wakes the worker when the next queued send is due, or stops waking it. */
export async function scheduleWakeUp() {
  const queue = await sendQueueStore.get();

  if (queue.length === 0) {
    await browser.alarms.clear(QUEUE_ALARM);

    return;
  }

  // One a stopped worker left mid-try is due at once, to be set aside.
  const when = Math.min(
    ...queue.map((item) => item.tryingSince ?? item.nextAt)
  );

  // Chrome fires an alarm a second out at the soonest, and may fire it later.
  await browser.alarms.create(QUEUE_ALARM, {
    when: Math.max(when, Date.now() + 1000),
  });
}

/** Whether a try is under way or about to be, so Send now would add nothing. */
export function isTrying(item: QueuedSend, now = Date.now()): boolean {
  return item.tryingSince !== undefined || item.nextAt <= now;
}

/** What a waiting message says in place of an error. */
export function waitingCopy(
  item: QueuedSend,
  online: boolean,
  now = Date.now()
): string {
  if (!online) return 'Sending when you’re back online';

  if (isTrying(item, now)) return 'Trying again now';

  const minutes = Math.ceil((item.nextAt - now) / MINUTE);

  if (minutes < 60) return `Trying again in ${formatCount(minutes)} min`;

  return plural(Math.round(minutes / 60), {
    one: 'Trying again in # hour',
    other: 'Trying again in # hours',
  });
}
