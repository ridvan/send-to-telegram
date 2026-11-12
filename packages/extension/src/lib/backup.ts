/**
 * Backing up chats and settings to a file, and restoring them. The file holds
 * bot tokens, so it is always encrypted with a password typed for it, never
 * the lock's. It is JSON:
 *
 *   {
 *     "format": "send-to-telegram-backup",
 *     "version": 1,
 *     "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<16 bytes, base64>" },
 *     "cipher": { "name": "AES-GCM", "iv": "<12 bytes, base64>" },
 *     "data": "<ciphertext of the payload's JSON, base64>"
 *   }
 *
 * `format` and `version` are bound into the ciphertext as additional data, so
 * changing either fails the decryption. Nothing else is in the clear, not
 * even the date: that's inside, with the chats and settings.
 */

import { z } from 'zod';

import { failureCopy } from './failure.ts';
import { dequeue } from './queue.ts';
import {
  chatPhotoSchema,
  chatPhotoStore,
  type HistoryEntry,
  historySchema,
  historyStore,
  isSamePlace,
  MAX_HISTORY,
  onboardingStore,
  sendQueueStore,
  type Settings,
  settingsSchema,
  settingsStore,
} from './settings.ts';
import {
  fromBase64,
  KDF_ITERATIONS,
  LockedError,
  lockState,
  MIN_PASSWORD_LENGTH,
  toBase64,
  wrappingKey,
} from './vault.ts';

export const BACKUP_FORMAT = 'send-to-telegram-backup';

export const BACKUP_VERSION = 1;

/**
 * Chrome keeps 10 MB in `storage.local` without `unlimitedStorage`, under
 * 14 MB once encrypted and in base64; Firefox applies IndexedDB's limits,
 * which are usually larger. Past this, a file isn't one Back up made, and
 * reading it would hang the page. A backup under it can still be more than
 * this browser has room for, with the history here added: restoring it then
 * says so.
 */
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

/** A file sets its own count; past this, a made-up one would hang the page. */
const MAX_ITERATIONS = 10_000_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Read first, so a newer file is told apart from one that isn't a backup. */
const headerSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
});

const base64Of = (bytes: number) =>
  z.string().refine((text) => {
    try {
      return fromBase64(text).length === bytes;
    } catch {
      return false;
    }
  });

const envelopeSchema = headerSchema.extend({
  version: z.literal(BACKUP_VERSION),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().positive().max(MAX_ITERATIONS),
    salt: base64Of(SALT_BYTES),
  }),
  cipher: z.object({ name: z.literal('AES-GCM'), iv: base64Of(IV_BYTES) }),
  data: z.string(),
});

type BackupEnvelope = z.infer<typeof envelopeSchema>;

/**
 * What's encrypted. Each part is parsed with the schema its store uses, so a
 * file reads exactly as stored data does, and fields this version doesn't
 * know are dropped.
 */
const payloadSchema = z.object({
  createdAt: z.number(),
  settings: z.json(),
  chatPhoto: z.json().optional(),
  /** Absent when history was left out. */
  history: z.json().optional(),
});

export type OpenedBackup = {
  createdAt: number;
  settings: Settings;
  chatPhoto: string | null;
  history: HistoryEntry[] | undefined;
};

export type BackupProblem =
  | 'too-large'
  | 'not-backup'
  | 'newer'
  | 'wrong-password'
  | 'unreadable'
  | 'full';

export const backupCopy = {
  'too-large':
    'This file is too large to be a backup. Choose the file that Back up saved.',
  'not-backup':
    'This file isn’t a Send to Telegram backup. Choose the file that Back up saved, named send-to-telegram-backup and a date.',
  newer:
    'This backup is from a newer version of Send to Telegram. Update the extension, then try again.',
  // AES-GCM can't tell a wrong password from a changed file.
  'wrong-password':
    'That password didn’t open this backup. Check it and try again. If it’s right, the file was changed or damaged, so try another backup.',
  unreadable:
    'This version can’t read the settings in this backup. Update Send to Telegram, then try again.',
  full: 'This browser doesn’t have room for this backup. Clear history under History, then try again.',
} satisfies Record<BackupProblem, string>;

/** `full` for a backup with history, which can also be made without it. */
export const fullWithHistoryCopy =
  'This browser doesn’t have room for this backup and its history. Clear history under History, or back up again with Include history unticked, then try again.';

export class BackupError extends Error {
  override name = 'BackupError';

  constructor(readonly problem: BackupProblem) {
    super(backupCopy[problem]);
  }
}

function additionalData(version: number) {
  return encoder.encode(`${BACKUP_FORMAT}:${version}`);
}

/** Names the file by the day it was made, so several sort by date. */
export function backupFileName(date = new Date()): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(
    (part) => String(part).padStart(2, '0')
  );

  return `${BACKUP_FORMAT}-${day.join('-')}.json`;
}

/**
 * The backup file's text: chats, settings and the chat's background photo,
 * and history when asked. Refused while locked, since the stores can't be read.
 */
export async function createBackup(
  password: string,
  { history }: { history: boolean },
  iterations = KDF_ITERATIONS
): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('The backup password is too short');
  }

  if ((await lockState()) === 'locked') throw new LockedError();

  const settings = await settingsStore.get();

  const payload = {
    createdAt: Date.now(),
    settings,
    // Only drawn with the photo background; otherwise it'd only add size.
    chatPhoto:
      settings.appearance.chatBackground === 'photo'
        ? await chatPhotoStore.get()
        : null,
    ...(history && { history: await historyStore.get() }),
  };

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await wrappingKey(password, salt, iterations);

  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(BACKUP_VERSION) },
    key,
    encoder.encode(JSON.stringify(payload))
  );

  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(data)),
  };

  const text = JSON.stringify(envelope, null, 2);

  if (encoder.encode(text).length > MAX_BACKUP_BYTES) {
    throw new BackupError('too-large');
  }

  return text;
}

function readEnvelope(text: string): BackupEnvelope {
  if (encoder.encode(text).length > MAX_BACKUP_BYTES) {
    throw new BackupError('too-large');
  }

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('not-backup');
  }

  const header = headerSchema.safeParse(json);

  if (!header.success) throw new BackupError('not-backup');

  if (header.data.version > BACKUP_VERSION) throw new BackupError('newer');

  const envelope = envelopeSchema.safeParse(json);

  if (!envelope.success) throw new BackupError('not-backup');

  return envelope.data;
}

async function decrypt(envelope: BackupEnvelope, password: string) {
  const { kdf, cipher, version } = envelope;

  let data: Uint8Array<ArrayBuffer>;

  try {
    data = fromBase64(envelope.data);
  } catch {
    throw new BackupError('not-backup');
  }

  const key = await wrappingKey(password, fromBase64(kdf.salt), kdf.iterations);

  try {
    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(cipher.iv),
        additionalData: additionalData(version),
      },
      key,
      data
    );
  } catch {
    throw new BackupError('wrong-password');
  }
}

/** Decrypts and reads a backup without changing anything. */
export async function openBackup(
  text: string,
  password: string
): Promise<OpenedBackup> {
  const plain = await decrypt(readEnvelope(text), password);

  let json: unknown;

  try {
    json = JSON.parse(decoder.decode(plain));
  } catch {
    throw new BackupError('unreadable');
  }

  const payload = payloadSchema.safeParse(json);

  if (!payload.success) throw new BackupError('unreadable');

  // A part that doesn't parse refuses the restore, rather than replacing
  // what's here with defaults as a stored value would fall back to.
  const settings = settingsSchema.safeParse(payload.data.settings);

  if (!settings.success) throw new BackupError('unreadable');

  const { history } = payload.data;

  const entries =
    history === undefined ? undefined : historySchema.safeParse(history);

  if (entries && !entries.success) throw new BackupError('unreadable');

  return {
    createdAt: payload.data.createdAt,
    settings: settings.data,
    chatPhoto: chatPhotoSchema.parse(payload.data.chatPhoto ?? null),
    history: entries?.data,
  };
}

export type RestorePlan = {
  settings: Settings;
  /** The history to store, or undefined to leave it as it is. */
  history: HistoryEntry[] | undefined;
  /** The photo to store, or undefined to leave it as it is. */
  chatPhoto: string | undefined;
  /** Chats the backup adds. */
  added: number;
  /** Chats already here, which stay as they are. */
  kept: number;
  /** History entries the backup adds, once cut to the limit. */
  historyAdded: number;
  /** Backup chat IDs to the ones they have here. */
  ids: ReadonlyMap<string, string>;
};

/**
 * A failed message's files stay in the browser that sent it, so here Send
 * again would go without them, or not at all. Dropping the message leaves it
 * as one kept with times only, which nothing offers to send again; the error
 * says what to do. Parts of a long text that went stay counted: they're in
 * Telegram, and the same chat here goes on after them.
 */
function restoredEntry(entry: HistoryEntry): HistoryEntry {
  const content = entry.content;

  if (
    entry.status !== 'failed' ||
    !(content?.attachment || content?.attachments)
  ) {
    return entry;
  }

  const { content: _content, partsOf: _partsOf, ...rest } = entry;

  return { ...rest, error: failureCopy.attachment_missing };
}

/**
 * Chats are merged: one already here for the same bot, chat and topic stays
 * as it is, with its name and picture, and the others are added. Preferences
 * are the backup's. History is merged by entry, newest first.
 */
export function planRestore(
  backup: OpenedBackup,
  current: {
    settings: Settings;
    history: HistoryEntry[];
    photo: string | null;
  },
  /**
   * New IDs given so far, by backup ID, so planning again against newer
   * state gives a chat the same one.
   */
  fresh = new Map<string, string>()
): RestorePlan {
  const destinations = [...current.settings.destinations];
  const taken = new Set(destinations.map((destination) => destination.id));
  // Backup IDs to the ones they have here, for the default chat and history.
  const ids = new Map<string, string>();
  let added = 0;
  let kept = 0;

  for (const destination of backup.settings.destinations) {
    const same = destinations.find((existing) =>
      isSamePlace(existing, destination)
    );

    if (same) {
      ids.set(destination.id, same.id);

      if (current.settings.destinations.includes(same)) kept += 1;

      continue;
    }

    // A chat moved to another topic keeps its ID, so the same ID can name
    // another place here.
    let id = fresh.get(destination.id) ?? destination.id;

    if (taken.has(id)) {
      id = crypto.randomUUID();
      fresh.set(destination.id, id);
    }

    taken.add(id);
    ids.set(destination.id, id);
    destinations.push({ ...destination, id });
    added += 1;
  }

  const backupDefault = backup.settings.defaultDestinationId;

  // The chat that opens first stays the one picked here, if any were.
  const defaultDestinationId =
    current.settings.destinations.length > 0
      ? current.settings.defaultDestinationId
      : ((backupDefault === null ? undefined : ids.get(backupDefault)) ??
        destinations[0]?.id ??
        null);

  const photo = backup.chatPhoto ?? current.photo;

  const appearance =
    backup.settings.appearance.chatBackground === 'photo' && !photo
      ? { ...backup.settings.appearance, chatBackground: 'doodles' as const }
      : backup.settings.appearance;

  let history: HistoryEntry[] | undefined;
  let historyAdded = 0;

  if (backup.history) {
    const known = new Set(current.history.map((entry) => entry.id));

    const restored = backup.history
      .filter((entry) => !known.has(entry.id))
      .map((entry) => {
        const destinationId =
          entry.destinationId && ids.get(entry.destinationId);

        return restoredEntry(
          destinationId ? { ...entry, destinationId } : entry
        );
      });

    const added = new Set(restored.map((entry) => entry.id));

    history = [...current.history, ...restored]
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, MAX_HISTORY);
    historyAdded = history.filter((entry) => added.has(entry.id)).length;
  }

  return {
    settings: {
      ...backup.settings,
      appearance,
      destinations,
      defaultDestinationId,
    },
    history,
    chatPhoto: backup.chatPhoto ?? undefined,
    added,
    kept,
    historyAdded,
    ids,
  };
}

async function currentState() {
  const [settings, history, photo] = await Promise.all([
    settingsStore.get(),
    historyStore.get(),
    chatPhotoStore.get(),
  ]);

  return { settings, history, photo };
}

/** What restoring would do, for the summary shown before it. */
export async function previewRestore(backup: OpenedBackup) {
  if ((await lockState()) === 'locked') throw new LockedError();

  return planRestore(backup, await currentState());
}

/** Chrome says `QUOTA_BYTES quota exceeded`; Firefox names a quota too. */
function isQuotaError(cause: unknown) {
  return (
    cause instanceof Error &&
    (cause.name === 'QuotaExceededError' || /quota/i.test(cause.message))
  );
}

/**
 * Restores a backup through the stores, so it's sealed when the lock is on.
 * Refused while locked. Each part merges with what's stored when it's
 * written, under the store's lock, so a send recorded meanwhile stays.
 * History goes first and settings last, so a write refused for space leaves
 * settings, and the menus that follow them, as they were; the photo goes in
 * between and is put back if settings are refused.
 */
export async function restoreBackup(
  backup: OpenedBackup
): Promise<RestorePlan> {
  if ((await lockState()) === 'locked') throw new LockedError();

  const fresh = new Map<string, string>();
  const photo = await chatPhotoStore.get();
  let early: RestorePlan | undefined;

  try {
    if (backup.history) {
      const settings = await settingsStore.get();
      const here = new Set((await historyStore.get()).map((entry) => entry.id));

      const back = new Set(
        backup.history.flatMap((entry) =>
          here.has(entry.id) ? [] : [entry.id]
        )
      );

      // A try still queued for an entry deleted here would send it once it's back.
      for (const item of await sendQueueStore.get()) {
        if (back.has(item.entryId)) await dequeue(item.entryId);
      }

      await historyStore.update((history) => {
        early = planRestore(backup, { settings, history, photo }, fresh);

        return early.history ?? history;
      });
    }

    if (backup.chatPhoto !== null) await chatPhotoStore.set(backup.chatPhoto);

    let plan: RestorePlan | undefined;

    try {
      await settingsStore.update((settings) => {
        plan = planRestore(backup, { settings, history: [], photo }, fresh);

        return plan.settings;
      });
    } catch (cause) {
      if (backup.chatPhoto !== null) await chatPhotoStore.set(photo);

      throw cause;
    }

    if (!plan) throw new Error('The restore wasn’t planned');

    const final = plan;

    // A chat added here meanwhile for the same place takes its history.
    const moved = new Map(
      [...(early?.ids ?? [])].flatMap(([from, to]) => {
        const now = final.ids.get(from);

        return now && now !== to ? [[to, now] as const] : [];
      })
    );

    if (moved.size > 0) {
      await historyStore.update((history) =>
        history.map((entry) => {
          const destinationId =
            entry.destinationId && moved.get(entry.destinationId);

          return destinationId ? { ...entry, destinationId } : entry;
        })
      );
    }

    // Restored chats are set up, so the welcome page doesn't ask to connect one.
    if (final.settings.destinations.length > 0) {
      await onboardingStore.update((state) => ({
        ...state,
        completedAt: state.completedAt ?? Date.now(),
      }));
    }

    return {
      ...final,
      history: early?.history,
      historyAdded: early?.historyAdded ?? 0,
    };
  } catch (cause) {
    if (isQuotaError(cause)) throw new BackupError('full');

    throw cause;
  }
}
