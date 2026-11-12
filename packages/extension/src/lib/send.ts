import {
  type BotClient,
  botIdOf,
  createBotClient,
  deliver,
  deliverAlbum,
  type Delivery,
  type IncomingMessage,
  type OutgoingMessage,
  PartlySent,
  TelegramError,
  Upload,
} from '@send-to-telegram/core';
import { browser } from 'wxt/browser';
import { z } from 'zod';

import { handoffWaiting } from './area.ts';
import {
  deleteAttachment,
  loadAttachment,
  pruneAttachments,
} from './attachments.ts';
import {
  type AlbumGroup,
  compose,
  type ComposedAlbum,
  type ComposedUpload,
  type Draft,
  draftFiles,
  draftSchema,
  withFiles,
} from './compose.ts';
import {
  failureCopy,
  failureReasonSchema,
  SendFailure,
  toSendFailure,
} from './failure.ts';
import { draftFromEntry } from './client.ts';
import { plural } from './format.ts';
import { attachmentOf } from './inbox.ts';
import {
  canQueue,
  dequeue,
  doneTrying,
  enqueue,
  markTrying,
  nextTry,
  putOff,
  QUEUE,
  QUEUE_ALARM,
  queueItem,
  scheduleWakeUp,
  stillQueued,
  waitingCopy,
} from './queue.ts';
import {
  isOnline,
  type Retryable,
  retryableOf,
  retryInPlace,
} from './retry.ts';
import {
  type Attachment,
  type Destination,
  defaultDestination,
  destinationName,
  type HistoryEntry,
  historyStore,
  MAX_HISTORY,
  type QueuedSend,
  type SentAlbumItem,
  sendQueueStore,
  type Settings,
  settingsStore,
  statsStore,
  type TelegramRef,
  telegramRefSchema,
} from './settings.ts';
import { LockedError, lockState, touchSession } from './vault.ts';

export const sendRequestSchema = z.object({
  type: z.literal('send'),
  draft: draftSchema,
  incognito: z.boolean(),
  /** A failed history entry this send replaces. */
  retryOf: z.string().optional(),
});

export type SendRequest = z.infer<typeof sendRequestSchema>;

export const sendOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    destination: z.string(),
    /**
     * What undoing the send deletes, and the history entry it removes. Here
     * even when nothing was recorded, as in private windows.
     */
    sent: telegramRefSchema
      .extend({ entryId: z.string().optional() })
      .optional(),
  }),
  z.object({
    ok: z.literal(false),
    reason: failureReasonSchema,
    message: z.string(),
    /**
     * Files that went before the rest failed, by attachment ID, so the draft
     * keeps only what didn't.
     */
    sentFiles: z.array(z.string()).optional(),
    /**
     * Waiting to be tried again, from its history entry: the draft is in
     * the chat now, not lost.
     */
    queued: z.boolean().optional(),
  }),
]);

export type SendOutcome = z.infer<typeof sendOutcomeSchema>;

/**
 * Some of an album's files went and the rest didn't, when photos and files
 * went as two albums. Carries what went, to record and delete it.
 */
export class PartialSend extends Error {
  override name = 'PartialSend';
  readonly delivery: Delivery;
  readonly sent: Attachment[];
  readonly failure: SendFailure;

  constructor(delivery: Delivery, sent: Attachment[], failure: SendFailure) {
    super(failure.message, { cause: failure });
    this.delivery = delivery;
    this.sent = sent;
    this.failure = failure;
  }
}

async function uploadOf(attachment: Attachment): Promise<Upload> {
  const blob = await loadAttachment(attachment.id);

  if (!blob) {
    throw new SendFailure('unsendable', failureCopy.attachment_missing);
  }

  return new Upload(blob, attachment.name);
}

/** What several deliveries add up to, as one message's. */
function combined(deliveries: Delivery[]): Delivery {
  const messageIds = deliveries.flatMap((delivery) => delivery.messageIds);

  const album = deliveries.flatMap(
    (delivery) => delivery.album ?? (delivery.sent ? [delivery.sent] : [])
  );

  return {
    messageId: messageIds.at(-1) ?? 0,
    messageIds,
    via: deliveries[0]?.via ?? 'document',
    album,
  };
}

/**
 * Says which rule Telegram applied to an album, and what to do about it.
 * Undefined for failures that aren't about the files, which read as usual.
 */
function albumFailure(cause: unknown): SendFailure | undefined {
  if (!(cause instanceof TelegramError) || cause.code !== 400) return undefined;

  if (toSendFailure(cause).reason !== 'rejected') return undefined;

  return new SendFailure(
    'rejected',
    `Telegram didn’t accept the files as an album: ${cause.message.replace(/^Bad Request: /, '')}. Send them in separate messages, or remove the one it can’t take.`,
    { cause }
  );
}

async function sendGroup(
  bot: BotClient,
  destination: Destination,
  group: AlbumGroup,
  uploads: Upload[],
  silent: boolean
): Promise<Delivery> {
  const [upload] = uploads;

  // Telegram takes 2 to 10 files as an album; one goes as it would alone.
  if (uploads.length === 1 && upload) {
    return deliver(
      bot,
      destination.chatId,
      {
        kind: group.kind,
        upload,
        silent,
        ...(group.caption && { caption: group.caption }),
        ...(group.caption &&
          group.captionEntities && { captionEntities: group.captionEntities }),
      },
      destination.topic?.id
    );
  }

  try {
    return await deliverAlbum(
      bot,
      destination.chatId,
      {
        kind: group.kind,
        uploads,
        silent,
        ...(group.caption && { caption: group.caption }),
        ...(group.caption &&
          group.captionEntities && { captionEntities: group.captionEntities }),
      },
      destination.topic?.id
    );
  } catch (cause) {
    throw albumFailure(cause) ?? cause;
  }
}

/**
 * Sends each group in turn. Every file is read first, so a missing one
 * stops the send before anything goes. When a later group fails, what went
 * is reported with it, not hidden behind the failure.
 */
async function transmitAlbum(
  bot: BotClient,
  destination: Destination,
  album: ComposedAlbum
): Promise<Delivery> {
  const uploads = await Promise.all(
    album.groups.map((group) => Promise.all(group.attachments.map(uploadOf)))
  );

  const deliveries: Delivery[] = [];
  const sent: Attachment[] = [];

  for (const [index, group] of album.groups.entries()) {
    try {
      deliveries.push(
        await sendGroup(
          bot,
          destination,
          group,
          uploads[index] ?? [],
          album.silent
        )
      );
    } catch (cause) {
      if (deliveries.length === 0) throw cause;

      throw new PartialSend(combined(deliveries), sent, toSendFailure(cause));
    }

    sent.push(...group.attachments);
  }

  return combined(deliveries);
}

export async function transmit(
  destination: Destination,
  message: OutgoingMessage | ComposedUpload | ComposedAlbum,
  {
    bot = createBotClient(destination.token),
    skipParts = 0,
  }: {
    bot?: BotClient;
    /** Parts of a long text that went in an earlier try. */
    skipParts?: number;
  } = {}
): Promise<Delivery> {
  if (message.kind === 'album') {
    return transmitAlbum(bot, destination, message);
  }

  if ('attachment' in message) {
    const upload = await uploadOf(message.attachment);
    const { attachment: _attachment, ...rest } = message;

    return deliver(
      bot,
      destination.chatId,
      { ...rest, upload },
      destination.topic?.id
    );
  }

  return deliver(
    bot,
    destination.chatId,
    message,
    destination.topic?.id,
    skipParts
  );
}

/**
 * Names the text a long message was split from, cheaply: FNV-1a over its
 * UTF-16 code units. Only the text decides where it's cut.
 */
function fingerprint(text: string): number {
  let hash = 0x81_1c_9d_c5;

  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01_00_01_93);
  }

  return hash >>> 0;
}

const resplitCopy =
  'Part of this message already went, and changed settings would now split the rest differently. Check the chat in Telegram before you send it again: it goes from the start.';

function findDestination(settings: Settings, id: string | undefined) {
  const destination = id
    ? settings.destinations.find((candidate) => candidate.id === id)
    : defaultDestination(settings);

  if (!destination) {
    throw new SendFailure('no_destination', failureCopy.no_destination);
  }

  return destination;
}

/** Where Telegram put a delivery, to delete it there later. */
export function telegramRef(
  destination: Destination,
  delivery: Delivery
): TelegramRef | undefined {
  const botId = botIdOf(destination.token);

  if (botId === undefined || delivery.messageIds.length === 0) return undefined;

  return { botId, chatId: destination.chatId, messageIds: delivery.messageIds };
}

/** One album message as the chat shows it again; none for one it can't. */
function albumItemOf(message: IncomingMessage): SentAlbumItem[] {
  const media = attachmentOf(message);

  if (!media?.media || !media.file) return [];

  return [
    {
      media: media.media,
      file: media.file,
      ...(media.fileName && { fileName: media.fileName }),
    },
  ];
}

function historyEntry(
  draft: Draft,
  settings: Settings,
  result: {
    destination?: Destination;
    delivery?: Delivery;
    failure?: SendFailure;
    /**
     * Parts of a long text that went before it failed, their IDs, and the
     * text they were split from. A count of 0 keeps the IDs alone.
     */
    partsSent?: { count: number; messageIds: number[]; split?: number };
    /** The entry this one replaces, which keeps its ID. */
    id?: string;
    /** Kept by a try the queue made that failed again, so it stays in place. */
    sentAt?: number;
  }
): HistoryEntry {
  const keepContent = settings.history.mode === 'full';
  const files = draftFiles(draft);

  // One file left of an album that half went is in `album` alone.
  const message =
    result.delivery?.sent ??
    (files.length === 1 ? result.delivery?.album?.[0] : undefined);

  const sent = message && attachmentOf(message);

  const delivered =
    result.delivery ??
    (result.partsSent && {
      messageId: result.partsSent.messageIds.at(-1) ?? 0,
      messageIds: result.partsSent.messageIds,
      via: 'text' as const,
    });

  const telegram =
    result.destination &&
    delivered &&
    telegramRef(result.destination, delivered);

  const sentMedia =
    sent?.media && sent.file
      ? { media: sent.media, file: sent.file }
      : undefined;

  const sentAlbum =
    files.length > 1 ? result.delivery?.album?.flatMap(albumItemOf) : undefined;

  return {
    id: result.id ?? crypto.randomUUID(),
    sentAt: result.sentAt ?? Date.now(),
    kind: draft.kind,
    status: result.failure ? 'failed' : 'sent',
    ...(result.destination && {
      destinationId: result.destination.id,
      destinationName: destinationName(result.destination),
    }),
    ...(draft.tag && { tag: draft.tag }),
    ...(result.delivery && { via: result.delivery.via }),
    ...(telegram && { telegram }),
    ...(result.partsSent &&
      result.partsSent.count > 0 && { partsSent: result.partsSent.count }),
    // Derived from the text, so kept only with it.
    ...(keepContent &&
      result.partsSent &&
      result.partsSent.count > 0 &&
      result.partsSent.split !== undefined && {
        partsOf: result.partsSent.split,
      }),
    ...(result.failure && { error: result.failure.message }),
    ...(keepContent && {
      content: {
        ...(draft.text && { text: draft.text }),
        ...(draft.text && draft.entities && { entities: draft.entities }),
        ...(draft.url && { url: draft.url }),
        ...(draft.note && { note: draft.note }),
        ...(draft.pageUrl && { pageUrl: draft.pageUrl }),
        ...(draft.pageTitle && { pageTitle: draft.pageTitle }),
        ...(draft.attachment && { attachment: draft.attachment }),
        ...(files.length > 1 && { attachments: files }),
        ...(sentMedia && { sentMedia }),
        ...(sentAlbum && sentAlbum.length > 0 && { sentAlbum }),
      },
    }),
  };
}

/**
 * Records a try the queue made, only while its entry is still in history:
 * one deleted during the try stays deleted. One that failed again stays
 * where it is: it keeps its time, so moving it to the top would break the
 * newest-first order history is kept in. Says whether the entry was there.
 */
async function recordQueued(
  entry: HistoryEntry,
  { inPlace }: { inPlace: boolean }
): Promise<boolean> {
  let found = false;

  await historyStore.update((history) => {
    found = history.some((item) => item.id === entry.id);

    if (!found) return history;

    return inPlace
      ? history.map((item) => (item.id === entry.id ? entry : item))
      : [entry, ...history.filter((item) => item.id !== entry.id)].slice(
          0,
          MAX_HISTORY
        );
  });

  return found;
}

function record(entry: HistoryEntry, replaces: string | undefined) {
  return historyStore.update((history) =>
    [entry, ...history.filter((item) => item.id !== replaces)].slice(
      0,
      MAX_HISTORY
    )
  );
}

/** Keeps the files that failed messages in history could send again. */
export async function pruneUnsentFiles() {
  const history = await historyStore.get().catch((cause: unknown) => {
    // Locked history can't say which files it could still retry, so none go.
    if (cause instanceof LockedError) return undefined;

    throw cause;
  });

  if (!history) return;

  const retryable = history.flatMap((entry) =>
    entry.status === 'failed' && entry.content
      ? draftFiles(entry.content).map((file) => file.id)
      : []
  );

  await pruneAttachments(new Set(retryable));
}

const action = browser.action ?? browser.browserAction;
let clearBadge: ReturnType<typeof setTimeout> | undefined;

/** A check mark that clears itself, or an alert that stays until the popup opens. */
export async function showBadge(ok: boolean) {
  clearTimeout(clearBadge);
  await action.setBadgeBackgroundColor({ color: ok ? '#15803d' : '#b91c1c' });
  await action.setBadgeTextColor?.({ color: '#ffffff' });
  await action.setBadgeText({ text: ok ? '✓' : '!' });

  if (ok) clearBadge = setTimeout(() => void settleBadge(), 2000);
}

/** Something waits in the popup, where the browser wouldn't open it for us. */
export async function showWaitingBadge() {
  clearTimeout(clearBadge);
  await action.setBadgeBackgroundColor({ color: '#2aabee' });
  await action.setBadgeTextColor?.({ color: '#ffffff' });
  await action.setBadgeText({ text: '1' });
}

/**
 * Messages wait to be tried again: a quiet mark, not an alert. One for
 * another send's failure stays until the popup opens.
 */
async function showQueuedBadge() {
  if ((await action.getBadgeText({})) === '!') return;

  clearTimeout(clearBadge);
  await action.setBadgeBackgroundColor({ color: '#6b7280' });
  await action.setBadgeTextColor?.({ color: '#ffffff' });
  await action.setBadgeText({ text: '…' });
}

/**
 * Points to a draft still waiting for the popup, or to messages waiting to
 * be tried again, or clears the badge.
 */
async function settleBadge() {
  if (await handoffWaiting()) await showWaitingBadge();
  else if ((await sendQueueStore.get()).length > 0) await showQueuedBadge();
  else await action.setBadgeText({ text: '' });
}

/** Follows the queue, leaving an alert or a tick to settle on its own. */
async function refreshQueuedBadge() {
  const text = await action.getBadgeText({});

  if (text !== '!' && text !== '✓') await settleBadge();
}

/**
 * Opening the popup shows what a failure badge pointed at. A waiting badge
 * stays while its draft waits for the popup on another tab.
 */
export async function clearFailureBadge() {
  const text = await action.getBadgeText({});

  if (text === '!' || text === '1') await settleBadge();
}

/**
 * Records a send that failed before reaching Telegram, like a screenshot the
 * page refused, so the popup can say why the badge is red. It keeps no
 * content, so nothing offers to send a message that never existed.
 */
export async function recordUnsent(
  draft: Draft,
  incognito: boolean,
  error: string
) {
  await showBadge(false);

  const settings = await settingsStore.get();

  if (incognito || settings.history.mode === 'off') return;

  await record(
    {
      id: crypto.randomUUID(),
      sentAt: Date.now(),
      kind: draft.kind,
      status: 'failed',
      error,
      ...(draft.tag && { tag: draft.tag }),
    },
    undefined
  );
}

function deleteFiles(files: Attachment[]) {
  return Promise.all(files.map((file) => deleteAttachment(file.id)));
}

/** What a send that will be tried again says in place of its error. */
function queuedMessage(retry: Retryable, next: QueuedSend): string {
  const lead = {
    network: 'Couldn’t reach Telegram.',
    rate_limited: 'Telegram is limiting messages.',
    server: 'Telegram is having trouble.',
  }[retry.kind];

  return `${lead} ${waitingCopy(next, isOnline())}.`;
}

/**
 * How a failure ends: in the queue when it may go later and its entry keeps
 * the message, or as a plain failure. Returns the queue's new item, if any.
 */
async function queueOrFail(
  entryId: string,
  cause: unknown,
  queueable: boolean,
  queued: QueuedSend | undefined
): Promise<{ retry: Retryable; next: QueuedSend } | undefined> {
  const retry = retryableOf(cause);
  const next = retry && queueable ? nextTry(entryId, retry, queued) : undefined;

  if (retry && next) {
    await enqueue(next);
    await scheduleWakeUp();
    await showQueuedBadge();

    return { retry, next };
  }

  // Given up, or never worth another try.
  if (queued) {
    await dequeue(entryId);
    await scheduleWakeUp();
  }

  await showBadge(false);

  return undefined;
}

/**
 * Photos went as one album and files didn't, or the other way round. What
 * went is recorded as sent, with its IDs so it can be deleted, and what
 * didn't as failed, so Send again sends only that, and the queue too.
 */
async function partlySent(
  request: SendRequest,
  settings: Settings,
  destination: Destination,
  partial: PartialSend,
  { entryId, queued }: { entryId: string; queued: QueuedSend | undefined }
): Promise<SendOutcome> {
  const { draft, incognito } = request;
  const remember = !incognito && settings.history.mode !== 'off';
  const files = draftFiles(draft);
  const went = new Set(partial.sent.map((file) => file.id));
  const rest = files.filter((file) => !went.has(file.id));
  const restId = crypto.randomUUID();

  const sentPart: Draft = {
    kind: draft.kind,
    ...(draft.destinationId && { destinationId: draft.destinationId }),
  };

  console.error('Send partly failed', partial.failure.cause);

  if (!incognito) {
    await statsStore.update((stats) => ({ sent: stats.sent + 1 }));
  }

  // Deleted while the queue tried it: what went isn't brought back.
  let kept = remember;

  if (remember) {
    // The text went as the last album's caption, so not with these.
    const sentEntry = historyEntry(
      withFiles(sentPart, partial.sent),
      settings,
      {
        destination,
        delivery: partial.delivery,
        id: entryId,
      }
    );

    if (queued) kept = await recordQueued(sentEntry, { inPlace: false });
    else await record(sentEntry, request.retryOf);
  }

  if (kept) {
    await record(
      historyEntry(withFiles(draft, rest), settings, {
        destination,
        failure: partial.failure,
        id: restId,
      }),
      undefined
    );
  }

  await deleteFiles(kept ? partial.sent : files);

  // What went is no longer in the queue; what didn't takes its place.
  if (queued) await dequeue(entryId);

  if (remember && !kept) {
    await scheduleWakeUp();

    return {
      ok: false,
      reason: partial.failure.reason,
      message: partial.failure.message,
    };
  }

  const waiting = await queueOrFail(
    restId,
    partial.failure,
    canQueue(settings, incognito),
    queued
  );

  const sentNote = plural(partial.sent.length, {
    one: `Only # of the ${files.length} files went.`,
    other: `Only # of the ${files.length} files went.`,
  });

  return {
    ok: false,
    reason: partial.failure.reason,
    message: `${sentNote} ${waiting ? queuedMessage(waiting.retry, waiting.next) : partial.failure.message}`,
    sentFiles: [...went],
    ...(waiting && { queued: true }),
  };
}

async function findEntry(id: string): Promise<HistoryEntry | undefined> {
  return (await historyStore.get()).find((entry) => entry.id === id);
}

/** A try the queue made went just before Send again was pressed. */
function alreadySent(entry: HistoryEntry): SendOutcome {
  return {
    ok: true,
    destination: entry.destinationName ?? 'Telegram',
    ...(entry.telegram && {
      sent: { ...entry.telegram, entryId: entry.id },
    }),
  };
}

export type SendOptions = {
  /** A try the queue makes on its own, with its place in the queue. */
  queued?: QueuedSend;
};

/**
 * Sends under way, by the history entry they send again. Pressing Send again
 * while the queue tries the same message joins that try, and the other way
 * round, so it can't go twice.
 */
const inFlight = new Map<string, Promise<SendOutcome>>();

/**
 * Sends a draft and records the outcome. Private windows leave no history and
 * do not count towards the total, as in 1.x.
 */
export function send(
  request: SendRequest,
  options: SendOptions = {}
): Promise<SendOutcome> {
  const id = request.retryOf;

  if (id === undefined) return sendOnce(request, options);

  const running = inFlight.get(id);

  if (running) return running;

  const run = sendOnce(request, options).finally(() => inFlight.delete(id));

  inFlight.set(id, run);

  return run;
}

async function sendOnce(
  request: SendRequest,
  { queued }: SendOptions
): Promise<SendOutcome> {
  // A send counts as using the extension, for auto-lock. The queue's own
  // tries don't, or a waiting message would keep it from ever locking.
  if (!queued) await touchSession();

  // Chats and their tokens can't be read, and nothing can be recorded.
  if ((await lockState()) === 'locked') {
    return { ok: false, reason: 'locked', message: failureCopy.locked };
  }

  const settings = await settingsStore.get();
  const { draft, incognito } = request;
  const remember = !incognito && settings.history.mode !== 'off';
  const replaces = request.retryOf;
  const earlier = replaces ? await findEntry(replaces) : undefined;
  // Sent again, a message keeps its entry, so the queue and the chat follow it.
  const entryId = replaces ?? crypto.randomUUID();

  if (earlier?.status === 'sent') return alreadySent(earlier);

  if (queued) {
    // Deleted, or its content dropped by a history setting, since it was queued.
    if (!stillQueued(earlier, settings)) {
      await dequeue(entryId);

      return { ok: false, reason: 'unsendable', message: 'Not queued' };
    }

    await markTrying(entryId);
  } else if (replaces && (await queueItem(replaces))) {
    // Sent by hand: out of the queue, which starts over if this fails too.
    await dequeue(replaces);
  }

  // Parts of a long text that went in an earlier try, left out this time.
  const skipParts = earlier?.partsSent ?? 0;
  const sentBefore = skipParts > 0 ? (earlier?.telegram?.messageIds ?? []) : [];
  let destination: Destination | undefined;
  let message: ReturnType<typeof compose> | undefined;
  let split: number | undefined;
  let resplit = false;

  try {
    destination = findDestination(settings, draft.destinationId);
    message = compose(draft, settings.delivery);
    split = message.kind === 'text' ? fingerprint(message.text) : undefined;

    // Changed settings would cut the text elsewhere, so going on from the
    // same part could repeat or skip some of it.
    if (skipParts > 0 && (split === undefined || split !== earlier?.partsOf)) {
      resplit = true;

      throw new SendFailure('unsendable', resplitCopy);
    }

    const sent = await transmit(destination, message, {
      bot: retryInPlace(createBotClient(destination.token)),
      skipParts: message.kind === 'text' ? skipParts : 0,
    });

    const delivery =
      sentBefore.length > 0
        ? { ...sent, messageIds: [...sentBefore, ...sent.messageIds] }
        : sent;

    await showBadge(true);

    if (!incognito) {
      await statsStore.update((stats) => ({ sent: stats.sent + 1 }));
    }

    let recordedId: string | undefined;

    if (remember) {
      const entry = historyEntry(draft, settings, {
        destination,
        delivery,
        id: entryId,
      });

      // Deleted while the queue tried it: it went, but isn't brought back.
      if (!queued) await record(entry, replaces);

      if (!queued || (await recordQueued(entry, { inPlace: false }))) {
        recordedId = entry.id;
      }
    }

    if (queued) {
      await dequeue(entryId);
      await scheduleWakeUp();
    }

    const ref = telegramRef(destination, delivery);

    await deleteFiles(draftFiles(draft));

    void pruneUnsentFiles().catch((cause: unknown) => {
      console.error('Could not clear unsent files', cause);
    });

    return {
      ok: true,
      destination: destinationName(destination),
      ...(ref && {
        sent: { ...ref, ...(recordedId && { entryId: recordedId }) },
      }),
    };
  } catch (cause) {
    if (cause instanceof PartialSend && destination) {
      return partlySent(request, settings, destination, cause, {
        entryId,
        queued,
      });
    }

    const failure = toSendFailure(cause);

    // What of a long text went, so another try sends only the rest. Once the
    // text would split differently, only their IDs stay, to delete them.
    const partsSent =
      cause instanceof PartlySent && message?.kind === 'text'
        ? {
            count: skipParts + cause.messageIds.length,
            messageIds: [...sentBefore, ...cause.messageIds],
            ...(split !== undefined && { split }),
          }
        : skipParts > 0
          ? {
              count: resplit ? 0 : skipParts,
              messageIds: sentBefore,
              ...(earlier?.partsOf !== undefined && { split: earlier.partsOf }),
            }
          : undefined;

    console.error('Send failed', cause);

    // Nothing new went, so a try cut short from here on can go again.
    if (
      queued &&
      retryableOf(cause) !== undefined &&
      !(cause instanceof PartlySent)
    ) {
      await doneTrying(entryId);
    }

    // Deleted while the queue tried it: nothing sends it again.
    let kept = remember;

    if (remember) {
      const entry = historyEntry(draft, settings, {
        failure,
        id: entryId,
        ...(destination && { destination }),
        ...(partsSent && { partsSent }),
        // A waiting message stays where it was in the chat between tries.
        ...(queued && earlier && { sentAt: earlier.sentAt }),
      });

      if (queued) kept = await recordQueued(entry, { inPlace: true });
      else await record(entry, replaces);
    }

    // Nothing in history can send it again, and private windows leave no trace.
    if (!kept) await deleteFiles(draftFiles(draft));

    if (remember && !kept) {
      await dequeue(entryId);
      await scheduleWakeUp();

      return { ok: false, reason: failure.reason, message: failure.message };
    }

    const waiting = await queueOrFail(
      entryId,
      cause,
      canQueue(settings, incognito),
      queued
    );

    if (waiting) {
      return {
        ok: false,
        reason: failure.reason,
        message: queuedMessage(waiting.retry, waiting.next),
        queued: true,
      };
    }

    return { ok: false, reason: failure.reason, message: failure.message };
  }
}

/**
 * A try the worker stopped in the middle of may have gone, so it isn't
 * tried again: it's left to send by hand, saying to check first.
 */
async function cutOff(entryId: string) {
  await dequeue(entryId);
  await historyStore.update((history) =>
    history.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            error:
              'This may have gone before the browser stopped it. Check the chat in Telegram before you send it again.',
          }
        : entry
    )
  );
  await showBadge(false);
}

/** Queued sends and what they need, or undefined while locked. */
async function readQueue() {
  if ((await lockState()) === 'locked') return undefined;

  try {
    const [queue, history, settings] = await Promise.all([
      sendQueueStore.get(),
      historyStore.get(),
      settingsStore.get(),
    ]);

    return {
      queue,
      settings,
      entries: new Map(history.map((entry) => [entry.id, entry])),
    };
  } catch (cause) {
    if (cause instanceof LockedError) return undefined;

    throw cause;
  }
}

/** Whether to try it now; going online or starting tries what waited for it at once. */
function isDue(item: QueuedSend, early: boolean, now: number) {
  return early ? (item.notBefore ?? 0) <= now : item.nextAt <= now;
}

async function tryQueued(
  item: QueuedSend,
  entry: HistoryEntry | undefined,
  settings: Settings,
  early: boolean
) {
  const now = Date.now();

  if (inFlight.has(item.entryId)) return;

  if (!stillQueued(entry, settings)) {
    await dequeue(item.entryId);
  } else if (item.tryingSince !== undefined) {
    await cutOff(item.entryId);
  } else if (now - item.since > QUEUE.maxAge) {
    // Offline for a day: its entry says why it failed, with Send again.
    await dequeue(item.entryId);
    await showBadge(false);
  } else if (!isDue(item, early, now)) {
    return;
  } else if (!isOnline()) {
    // Looks again soon without spending a try; coming online wakes it too.
    await putOff(item.entryId, now + QUEUE.offlineCheck);
  } else {
    const draft = draftFromEntry(entry);

    if (draft) {
      await send(
        { type: 'send', draft, incognito: false, retryOf: entry.id },
        { queued: item }
      );
    } else {
      await dequeue(item.entryId);
    }
  }
}

async function drain(early: boolean) {
  const first = await readQueue();

  // Nothing is tried while locked; unlocking runs the queue again.
  if (!first) return;

  try {
    for (const { entryId } of first.queue) {
      // Read again for each: a slow try before it gives the popup time to
      // delete it, send it by hand or change a setting.
      const read = await readQueue();

      if (!read) break;

      const item = read.queue.find((other) => other.entryId === entryId);

      if (!item) continue;

      try {
        await tryQueued(item, read.entries.get(entryId), read.settings, early);
      } catch (cause) {
        // Locked during the try; unlocking runs the queue again.
        if (cause instanceof LockedError) break;

        console.error('Could not send a queued message', cause);
      }
    }
  } finally {
    // Whatever stopped it, the alarm follows what's still queued.
    await scheduleWakeUp();
    await refreshQueuedBadge();
  }
}

let draining: Promise<void> | undefined;
let thenEarly: Promise<void> | undefined;

/**
 * Tries the queued sends that are due, one at a time: on the alarm, when the
 * popup opens and after unlocking. `early` tries every one Telegram didn't
 * ask to wait, for coming online and starting the browser; one asked for
 * during another run goes after it, so coming online isn't missed.
 */
export function sendQueued({ early = false } = {}): Promise<void> {
  if (!draining) {
    draining = drain(early).finally(() => {
      draining = undefined;
    });

    return draining;
  }

  if (!early) return draining;

  thenEarly ??= draining
    .catch(() => undefined)
    .then(() => {
      thenEarly = undefined;

      return sendQueued({ early: true });
    });

  return thenEarly;
}

/** Wakes the queue when its alarm goes off. */
export async function onQueueAlarm(alarm: { name: string }) {
  if (alarm.name === QUEUE_ALARM) await sendQueued();
}

/**
 * Drops queued sends whose entry was deleted or sent by hand from a page,
 * which edits history directly, so the badge and alarm stop pointing at them.
 */
export async function pruneQueue() {
  const read = await readQueue();

  if (!read || read.queue.length === 0) return;

  const { queue, settings, entries } = read;

  const gone = new Set(
    queue
      .filter(
        (item) =>
          !inFlight.has(item.entryId) &&
          !stillQueued(entries.get(item.entryId), settings)
      )
      .map((item) => item.entryId)
  );

  if (gone.size === 0) return;

  await sendQueueStore.update((current) =>
    current.filter((item) => !gone.has(item.entryId))
  );
  await scheduleWakeUp();
  await refreshQueuedBadge();
}
