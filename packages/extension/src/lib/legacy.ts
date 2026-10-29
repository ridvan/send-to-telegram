import { browser } from 'wxt/browser';
import { z } from 'zod';

import {
  type ContentKind,
  type Destination,
  type HistoryEntry,
  MAX_HISTORY,
  MAX_TAGS,
  type Settings,
  TAG_PATTERN,
  defaultSettings,
} from './settings.ts';

/** Keys written by the 1.x extension (plain JavaScript, `storage.local`). */
export const LEGACY_KEYS = [
  'options',
  'messageLogs',
  'totalMessageCount',
  'hideWizard',
  'lastAPIResponse',
] as const;

const lenientBoolean = z.boolean().optional().catch(undefined);

/** 1.x kept one record per account, keyed "0", "1", … with `use` pointing at the active one. */
const legacyOptionsSchema = z.object({
  connections: z
    .object({
      use: z.coerce.number().catch(0),
      setup: z
        .record(
          z.string(),
          z.object({
            name: z.string().catch(''),
            key: z.string().catch(''),
            chatId: z.union([z.string(), z.number()]).catch(''),
          })
        )
        .catch({}),
    })
    .optional()
    .catch(undefined),
  actions: z
    .object({
      sendMessage: z
        .object({
          disableNotificationSound: lenientBoolean,
          disablePreview: lenientBoolean,
          addSourceLink: lenientBoolean,
        })
        .optional()
        .catch(undefined),
      sendImage: z
        .object({
          disableNotificationSound: lenientBoolean,
          sendAs: z
            .enum(['photo', 'document', 'link'])
            .optional()
            .catch(undefined),
          addSourceLink: lenientBoolean,
        })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
  logs: z
    .object({
      active: lenientBoolean,
      type: z.enum(['everything', 'timestamp']).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  /** Missing entirely on installs that never ran 1.2. */
  hashtags: z
    .object({
      active: lenientBoolean,
      use: z.coerce.number().catch(0),
      setup: z
        .record(z.string(), z.object({ tags: z.array(z.string()).catch([]) }))
        .catch({}),
    })
    .optional()
    .catch(undefined),
});

const legacyLogSchema = z.object({
  type: z.enum(['text', 'link', 'page', 'photo', 'document']),
  status: z.enum(['success', 'fail']),
  timestamp: z.number(),
  /** `false` when logging was set to timestamps only, or the send failed. */
  content: z
    .union([
      z.literal(false),
      z.object({
        text: z.string().optional(),
        linkUrl: z.string().optional(),
        pageUrl: z.string().optional(),
        srcUrl: z.string().optional(),
        tabUrl: z.string().optional(),
      }),
    ])
    .catch(false),
  hashtag: z.string().optional().catch(undefined),
  errorLog: z
    .object({ description: z.string().optional() })
    .optional()
    .catch(undefined),
});

export const legacyStorageSchema = z.object({
  options: legacyOptionsSchema.optional().catch(undefined),
  messageLogs: z.array(z.json()).catch([]),
  totalMessageCount: z.number().int().nonnegative().catch(0),
});

export type LegacyStorage = z.infer<typeof legacyStorageSchema>;

type LegacyLog = z.infer<typeof legacyLogSchema>;

export type Migration = {
  settings: Settings;
  history: HistoryEntry[];
  sent: number;
  /** A working connection came over, so setup can be skipped. */
  configured: boolean;
};

const kindByLegacyType: Record<LegacyLog['type'], ContentKind> = {
  text: 'selection',
  link: 'link',
  page: 'page',
  photo: 'image',
  document: 'image',
};

function migrateDestinations(
  options: NonNullable<LegacyStorage['options']>,
  createId: () => string
) {
  const setups = Object.entries(options.connections?.setup ?? {});
  const active = String(options.connections?.use ?? 0);
  let defaultId: string | null = null;
  const destinations: Destination[] = [];

  for (const [key, setup] of setups) {
    const token = setup.key.trim();
    const chatId = String(setup.chatId).trim();

    if (!token || !chatId) continue;

    const id = createId();
    const label = setup.name.trim();

    destinations.push({
      id,
      kind: 'bot',
      token,
      chatId: /^-?\d+$/.test(chatId) ? Number(chatId) : chatId,
      // "Default" was the 1.x placeholder; the chat title reads better.
      ...(label && label !== 'Default' && { label }),
    });

    if (key === active) defaultId = id;
  }

  return { destinations, defaultId: defaultId ?? destinations[0]?.id ?? null };
}

function migrateTags(options: NonNullable<LegacyStorage['options']>) {
  const hashtags = options.hashtags;

  if (!hashtags) return undefined;

  const setup =
    hashtags.setup[String(hashtags.use)] ?? Object.values(hashtags.setup)[0];

  const seen = new Set<string>();
  const list: string[] = [];

  for (const raw of setup?.tags ?? []) {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();

    if (!TAG_PATTERN.test(tag) || seen.has(tag)) continue;

    seen.add(tag);
    list.push(tag);
  }

  return { enabled: hashtags.active ?? false, list: list.slice(0, MAX_TAGS) };
}

function migrateLog(log: LegacyLog, index: number): HistoryEntry {
  const kind = kindByLegacyType[log.type];

  const entry: HistoryEntry = {
    id: `v1-${log.timestamp}-${index}`,
    sentAt: log.timestamp,
    kind,
    status: log.status === 'success' ? 'sent' : 'failed',
    ...(log.hashtag && { tag: log.hashtag }),
    ...(log.errorLog?.description && { error: log.errorLog.description }),
  };

  if (log.content === false) return entry;

  const { text, linkUrl, pageUrl, srcUrl, tabUrl } = log.content;
  const url = kind === 'link' ? linkUrl : kind === 'image' ? srcUrl : undefined;
  const page = kind === 'page' ? pageUrl : tabUrl;

  return {
    ...entry,
    content: {
      ...(text && { text }),
      ...(url && { url }),
      ...(page && { pageUrl: page }),
    },
  };
}

/** Maps 1.x storage onto the 2.0 model. Pure, and tolerant of any partial data. */
export function migrateLegacy(
  legacy: LegacyStorage,
  createId: () => string = () => crypto.randomUUID()
): Migration {
  const settings = defaultSettings();
  const options = legacy.options;

  if (options) {
    const { destinations, defaultId } = migrateDestinations(options, createId);
    const message = options.actions?.sendMessage;
    const image = options.actions?.sendImage;
    const tags = migrateTags(options);

    settings.destinations = destinations;
    settings.defaultDestinationId = defaultId;
    settings.delivery = {
      silent: message?.disableNotificationSound ?? settings.delivery.silent,
      linkPreview:
        message?.disablePreview === undefined
          ? settings.delivery.linkPreview
          : !message.disablePreview,
      sourceButton:
        message?.addSourceLink ??
        image?.addSourceLink ??
        settings.delivery.sourceButton,
      imageMode: image?.sendAs ?? settings.delivery.imageMode,
    };

    if (tags) settings.tags = tags;

    if (options.logs?.active === false) settings.history.mode = 'off';
    else if (options.logs?.type === 'timestamp')
      settings.history.mode = 'minimal';
  }

  const history = legacy.messageLogs
    .flatMap((raw, index) => {
      const log = legacyLogSchema.safeParse(raw);

      return log.success ? [migrateLog(log.data, index)] : [];
    })
    .toSorted((a, b) => b.sentAt - a.sentAt)
    .slice(0, MAX_HISTORY);

  return {
    settings,
    history,
    sent: legacy.totalMessageCount,
    configured: settings.destinations.length > 0,
  };
}

/**
 * Moves 1.x data to the new keys once. The original values are kept under
 * `legacyBackup` and removed from their old keys only after the new data is
 * written, so an interrupted run can simply run again.
 */
export async function migrateStoredLegacyData(
  fromVersion: string | undefined
): Promise<Migration | undefined> {
  const stored = await browser.storage.local.get([...LEGACY_KEYS, 'settings']);

  if (stored.options === undefined) return undefined;

  if (stored.settings !== undefined) {
    // Written by an earlier run that stopped before cleaning up.
    await browser.storage.local.remove([...LEGACY_KEYS]);

    return undefined;
  }

  const migration = migrateLegacy(legacyStorageSchema.parse(stored));

  const backup = Object.fromEntries(
    LEGACY_KEYS.map((key) => [key, stored[key] ?? null])
  );

  await browser.storage.local.set({
    settings: migration.settings,
    history: migration.history,
    stats: { sent: migration.sent },
    onboarding: {
      migratedFrom: fromVersion ?? '1.x',
      ...(migration.configured && { completedAt: Date.now() }),
    },
    legacyBackup: { savedAt: Date.now(), data: backup },
  });
  await browser.storage.local.remove([...LEGACY_KEYS]);

  return migration;
}
