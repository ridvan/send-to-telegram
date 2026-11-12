import {
  createBotClient,
  deliver,
  type Delivery,
  type OutgoingMessage,
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
  compose,
  type ComposedUpload,
  type Draft,
  draftSchema,
} from './compose.ts';
import {
  failureCopy,
  failureReasonSchema,
  SendFailure,
  toSendFailure,
} from './failure.ts';
import { attachmentOf } from './inbox.ts';
import {
  type Destination,
  defaultDestination,
  destinationName,
  type HistoryEntry,
  historyStore,
  MAX_HISTORY,
  type Settings,
  settingsStore,
  statsStore,
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
  z.object({ ok: z.literal(true), destination: z.string() }),
  z.object({
    ok: z.literal(false),
    reason: failureReasonSchema,
    message: z.string(),
  }),
]);

export type SendOutcome = z.infer<typeof sendOutcomeSchema>;

export async function transmit(
  destination: Destination,
  message: OutgoingMessage | ComposedUpload
): Promise<Delivery> {
  if ('attachment' in message) {
    const blob = await loadAttachment(message.attachment.id);

    if (!blob) {
      throw new SendFailure('unsendable', failureCopy.attachment_missing);
    }

    const { attachment, ...rest } = message;

    return deliver(
      createBotClient(destination.token),
      destination.chatId,
      { ...rest, upload: new Upload(blob, attachment.name) },
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
  const sent = result.delivery?.sent && attachmentOf(result.delivery.sent);

  const sentMedia =
    sent?.media && sent.file
      ? { media: sent.media, file: sent.file }
      : undefined;

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
    ...(result.failure && { error: result.failure.message }),
    ...(keepContent && {
      content: {
        ...(draft.text && { text: draft.text }),
        ...(draft.url && { url: draft.url }),
        ...(draft.note && { note: draft.note }),
        ...(draft.pageUrl && { pageUrl: draft.pageUrl }),
        ...(draft.pageTitle && { pageTitle: draft.pageTitle }),
        ...(draft.attachment && { attachment: draft.attachment }),
        ...(sentMedia && { sentMedia }),
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
    entry.status === 'failed' && entry.content?.attachment
      ? [entry.content.attachment.id]
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

    if (remember) {
      const entry = historyEntry(draft, settings, { destination, delivery });

      await record(entry, request.retryOf);
    }

    if (draft.attachment) await deleteAttachment(draft.attachment.id);

    void pruneUnsentFiles().catch((cause: unknown) => {
      console.error('Could not clear unsent files', cause);
    });

    return { ok: true, destination: destinationName(destination) };
  } catch (cause) {
    const failure = toSendFailure(cause);

    console.error('Send failed', cause);
    await showBadge(false);

    // Nothing in history can send it again, and private windows leave no trace.
    if (draft.attachment && !remember) {
      await deleteAttachment(draft.attachment.id);
    }

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
