import {
  botIdOf,
  createBotClient,
  deliver,
  deliverAlbum,
  type Delivery,
  type IncomingMessage,
  type OutgoingMessage,
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
import { plural } from './format.ts';
import { attachmentOf } from './inbox.ts';
import {
  type Attachment,
  type Destination,
  defaultDestination,
  destinationName,
  type HistoryEntry,
  historyStore,
  MAX_HISTORY,
  type SentAlbumItem,
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
  destination: Destination,
  group: AlbumGroup,
  uploads: Upload[],
  silent: boolean
): Promise<Delivery> {
  const bot = createBotClient(destination.token);
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
        await sendGroup(destination, group, uploads[index] ?? [], album.silent)
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
  message: OutgoingMessage | ComposedUpload | ComposedAlbum
): Promise<Delivery> {
  if (message.kind === 'album') return transmitAlbum(destination, message);

  if ('attachment' in message) {
    const upload = await uploadOf(message.attachment);
    const { attachment: _attachment, ...rest } = message;

    return deliver(
      createBotClient(destination.token),
      destination.chatId,
      { ...rest, upload },
      destination.topic?.id
    );
  }

  return deliver(
    createBotClient(destination.token),
    destination.chatId,
    message,
    destination.topic?.id
  );
}

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
  }
): HistoryEntry {
  const keepContent = settings.history.mode === 'full';
  const files = draftFiles(draft);

  // One file left of an album that half went is in `album` alone.
  const message =
    result.delivery?.sent ??
    (files.length === 1 ? result.delivery?.album?.[0] : undefined);

  const sent = message && attachmentOf(message);

  const telegram =
    result.destination &&
    result.delivery &&
    telegramRef(result.destination, result.delivery);

  const sentMedia =
    sent?.media && sent.file
      ? { media: sent.media, file: sent.file }
      : undefined;

  const sentAlbum =
    files.length > 1 ? result.delivery?.album?.flatMap(albumItemOf) : undefined;

  return {
    id: crypto.randomUUID(),
    sentAt: Date.now(),
    kind: draft.kind,
    status: result.failure ? 'failed' : 'sent',
    ...(result.destination && {
      destinationId: result.destination.id,
      destinationName: destinationName(result.destination),
    }),
    ...(draft.tag && { tag: draft.tag }),
    ...(result.delivery && { via: result.delivery.via }),
    ...(telegram && { telegram }),
    ...(result.failure && { error: result.failure.message }),
    ...(keepContent && {
      content: {
        ...(draft.text && { text: draft.text }),
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

/** Points to a draft still waiting for the popup, or clears the badge. */
async function settleBadge() {
  if (await handoffWaiting()) await showWaitingBadge();
  else await action.setBadgeText({ text: '' });
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

/**
 * Photos went as one album and files didn't, or the other way round. What
 * went is recorded as sent, with its IDs so it can be deleted, and what
 * didn't as failed, so Send again sends only that.
 */
async function partlySent(
  request: SendRequest,
  settings: Settings,
  destination: Destination,
  partial: PartialSend
): Promise<SendOutcome> {
  const { draft, incognito } = request;
  const remember = !incognito && settings.history.mode !== 'off';
  const files = draftFiles(draft);
  const went = new Set(partial.sent.map((file) => file.id));
  const rest = files.filter((file) => !went.has(file.id));

  const sentPart: Draft = {
    kind: draft.kind,
    ...(draft.destinationId && { destinationId: draft.destinationId }),
  };

  console.error('Send partly failed', partial.failure.cause);
  await showBadge(false);

  if (!incognito) {
    await statsStore.update((stats) => ({ sent: stats.sent + 1 }));
  }

  if (remember) {
    await record(
      // The text went as the last album's caption, so not with these.
      historyEntry(withFiles(sentPart, partial.sent), settings, {
        destination,
        delivery: partial.delivery,
      }),
      request.retryOf
    );
    await record(
      historyEntry(withFiles(draft, rest), settings, {
        destination,
        failure: partial.failure,
      }),
      undefined
    );
  }

  await deleteFiles(remember ? partial.sent : files);

  const sentNote = plural(partial.sent.length, {
    one: `Only # of the ${files.length} files went.`,
    other: `Only # of the ${files.length} files went.`,
  });

  return {
    ok: false,
    reason: partial.failure.reason,
    message: `${sentNote} ${partial.failure.message}`,
    sentFiles: [...went],
  };
}

/**
 * Sends a draft and records the outcome. Private windows leave no history and
 * do not count towards the total, as in 1.x.
 */
export async function send(request: SendRequest): Promise<SendOutcome> {
  // A send counts as using the extension, for auto-lock.
  await touchSession();

  // Chats and their tokens can't be read, and nothing can be recorded.
  if ((await lockState()) === 'locked') {
    return { ok: false, reason: 'locked', message: failureCopy.locked };
  }

  const settings = await settingsStore.get();
  const { draft, incognito } = request;
  const remember = !incognito && settings.history.mode !== 'off';
  let destination: Destination | undefined;

  try {
    destination = findDestination(settings, draft.destinationId);

    const delivery = await transmit(
      destination,
      compose(draft, settings.delivery)
    );

    await showBadge(true);

    if (!incognito) {
      await statsStore.update((stats) => ({ sent: stats.sent + 1 }));
    }

    let entryId: string | undefined;

    if (remember) {
      const entry = historyEntry(draft, settings, { destination, delivery });

      await record(entry, request.retryOf);
      entryId = entry.id;
    }

    const ref = telegramRef(destination, delivery);

    await deleteFiles(draftFiles(draft));

    void pruneUnsentFiles().catch((cause: unknown) => {
      console.error('Could not clear unsent files', cause);
    });

    return {
      ok: true,
      destination: destinationName(destination),
      ...(ref && { sent: { ...ref, ...(entryId && { entryId }) } }),
    };
  } catch (cause) {
    if (cause instanceof PartialSend && destination) {
      return partlySent(request, settings, destination, cause);
    }

    const failure = toSendFailure(cause);

    console.error('Send failed', cause);
    await showBadge(false);

    // Nothing in history can send it again, and private windows leave no trace.
    if (!remember) await deleteFiles(draftFiles(draft));

    if (remember) {
      const entry = historyEntry(draft, settings, {
        failure,
        ...(destination && { destination }),
      });

      await record(entry, request.retryOf);
    }

    return { ok: false, reason: failure.reason, message: failure.message };
  }
}
