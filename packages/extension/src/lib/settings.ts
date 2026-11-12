import {
  chatIdSchema,
  chatTypeSchema,
  deliveredViaSchema,
} from '@send-to-telegram/core';
import { z } from 'zod';

import { defineStore, sealKey } from './storage.ts';

/** Telegram links `#word` only for letters, digits and underscores. */
export const TAG_PATTERN = /^[\p{L}\p{N}_]{1,32}$/u;

export const MAX_TAGS = 12;

export const tagSchema = z.string().regex(TAG_PATTERN);

export const avatarPatternSchema = z.enum([
  'beam',
  'marble',
  'pixel',
  'sunset',
  'ring',
  'bauhaus',
]);

export type AvatarPattern = z.infer<typeof avatarPatternSchema>;

/** What a chat shows instead of its initials. */
export const chatAvatarSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('emoji'), emoji: z.string().min(1) }),
  z.object({ kind: z.literal('pattern'), style: avatarPatternSchema }),
  z.object({
    kind: z.literal('image'),
    dataUrl: z.string().regex(/^data:image\/[\w.+-]+;base64,/),
  }),
]);

export type ChatAvatarChoice = z.infer<typeof chatAvatarSchema>;

const destinationBase = z.object({
  id: z.string(),
  /** A name the person gave this destination; the chat title is used otherwise. */
  label: z.string().optional(),
  chatTitle: z.string().optional(),
  chatType: chatTypeSchema.optional(),
  /**
   * Absent shows initials. One this version can't read falls back to them
   * too, rather than failing the whole settings key.
   */
  avatar: chatAvatarSchema.optional().catch(undefined),
});

/**
 * One topic of a forum group. Bots can't list a forum's topics, so the name
 * is the one Telegram last reported to the bot, if any.
 */
export const topicSchema = z.object({
  /** The topic's `message_thread_id`. General has none: it's the chat itself. */
  id: z.number().int().positive(),
  name: z.string().optional(),
});

export type Topic = z.infer<typeof topicSchema>;

export const botDestinationSchema = destinationBase.extend({
  kind: z.literal('bot'),
  token: z.string(),
  chatId: chatIdSchema,
  /**
   * Absent sends to the chat itself, General in a forum. Not caught: sending
   * to General instead of a topic someone chose would be worse than leaving
   * the chat out.
   */
  topic: topicSchema.optional(),
  botUsername: z.string().optional(),
});

export const destinationSchema = botDestinationSchema;

export type Destination = z.infer<typeof destinationSchema>;

export type BotDestination = Destination;

/**
 * Pre-release builds also linked chats through S2T Relay. Those are dropped
 * instead of failing the whole settings key.
 */
const destinationsSchema = z.preprocess(
  (stored) =>
    Array.isArray(stored)
      ? stored.filter((entry) => destinationSchema.safeParse(entry).success)
      : stored,
  z.array(destinationSchema).default([])
);

export const imageModeSchema = z.enum(['photo', 'document', 'link']);

export type ImageMode = z.infer<typeof imageModeSchema>;

export const historyModeSchema = z.enum(['full', 'minimal', 'off']);

export type HistoryMode = z.infer<typeof historyModeSchema>;

export const themeSchema = z.enum(['system', 'light', 'dark']);

export type Theme = z.infer<typeof themeSchema>;

/** Behind the popup's chat: its plain color, a pattern, or your photo. */
export const chatBackgroundSchema = z.enum([
  'plain',
  'doodles',
  'space',
  'garden',
  'waves',
  'lattice',
  'petals',
  'photo',
]);

export type ChatBackground = z.infer<typeof chatBackgroundSchema>;

export const DEFAULT_TAGS = ['work', 'personal', 'ideas', 'reading'];

export const settingsSchema = z.object({
  destinations: destinationsSchema,
  defaultDestinationId: z.string().nullable().default(null),
  delivery: z
    .object({
      silent: z.boolean().default(true),
      linkPreview: z.boolean().default(true),
      sourceButton: z.boolean().default(true),
      imageMode: imageModeSchema.default('photo'),
    })
    .prefault({}),
  tags: z
    .object({
      enabled: z.boolean().default(false),
      list: z.array(tagSchema).max(MAX_TAGS).default(DEFAULT_TAGS),
    })
    .prefault({}),
  composer: z
    .object({
      /** Sends the page's link, or its "Open page" button, with a note or selection. */
      attachPage: z.boolean().default(true),
    })
    .prefault({}),
  history: z
    .object({
      mode: historyModeSchema.default('full'),
      /** Draws earlier messages to a chat above the one being written. */
      showInChat: z.boolean().default(true),
    })
    .prefault({}),
  appearance: z
    .object({
      theme: themeSchema.default('system'),
      /** Off blurs chat names until hovered, for screen sharing and onlookers. */
      showChatNames: z.boolean().default(true),
      /** One this version doesn't draw falls back to doodles. */
      chatBackground: chatBackgroundSchema.default('doodles').catch('doodles'),
    })
    .prefault({}),
  privacy: z
    .object({
      /** Photos and videos stay blurred until clicked, one at a time. */
      blurMedia: z.boolean().default(false),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings = (): Settings => settingsSchema.parse({});

export const settingsStore = defineStore(
  'settings',
  settingsSchema,
  defaultSettings,
  { sealed: true }
);

// Widened only: history stores the kind, so a kind once written stays here.
export const contentKindSchema = z.enum([
  'selection',
  'link',
  'image',
  'video',
  'audio',
  'page',
]);

export type ContentKind = z.infer<typeof contentKindSchema>;

/** A picture Telegram sent with a message, in one size. */
const inboxPictureSchema = z.object({
  id: z.string(),
  /** Names the cached copy; never a URL, which would carry the bot's token. */
  uniqueId: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export type InboxPicture = z.infer<typeof inboxPictureSchema>;

/**
 * A received message's file, downloaded only when shown. Telegram's download
 * path expires within an hour, so only its lasting IDs are kept.
 */
const inboxFileSchema = inboxPictureSchema.extend({
  size: z.number().optional(),
  mimeType: z.string().optional(),
  /** Seconds, for video and sound. */
  duration: z.number().optional(),
  /** What the bubble draws: a smaller photo, or a video's first frame. */
  preview: inboxPictureSchema.optional(),
  /** A song's title, as the performer named it. */
  title: z.string().optional(),
});

export type InboxFile = z.infer<typeof inboxFileSchema>;

export const mediaKindSchema = z.enum([
  'photo',
  'video',
  'animation',
  'voice',
  'audio',
  'file',
]);

/** A file sent from the popup. Its bytes live in IndexedDB, under `id`. */
export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The MIME type, empty when the browser doesn't know it. */
  type: z.string(),
  size: z.number(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const historyEntrySchema = z.object({
  id: z.string(),
  sentAt: z.number(),
  kind: contentKindSchema,
  status: z.enum(['sent', 'failed']),
  destinationId: z.string().optional(),
  /** Kept so entries still read well after a destination is removed. */
  destinationName: z.string().optional(),
  tag: z.string().optional(),
  via: deliveredViaSchema.optional(),
  error: z.string().optional(),
  /** Present only when history is set to keep content. */
  content: z
    .object({
      text: z.string().optional(),
      url: z.string().optional(),
      note: z.string().optional(),
      pageUrl: z.string().optional(),
      pageTitle: z.string().optional(),
      attachment: attachmentSchema.optional(),
      /** The attachment as Telegram keeps it, so the chat can show it again. */
      sentMedia: z
        .object({ media: mediaKindSchema, file: inboxFileSchema })
        .optional(),
    })
    .optional(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const MAX_HISTORY = 1000;

/** Drops unreadable entries one by one instead of losing the whole list. */
function listOf<S extends z.ZodType>(entrySchema: S) {
  return z.array(z.json()).transform((entries) =>
    entries.flatMap((entry) => {
      const parsed = entrySchema.safeParse(entry);

      return parsed.success ? [parsed.data] : [];
    })
  );
}

export const historyStore = defineStore(
  'history',
  listOf(historyEntrySchema),
  () => [],
  { sealed: true }
);

/** A message someone sent to your own bot in a chat, shown in the popup. */
export const inboxEntrySchema = z.object({
  /** `chatId:messageId`, which Telegram keeps unique. */
  id: z.string(),
  destinationId: z.string(),
  receivedAt: z.number(),
  /** Who wrote it, in a group. */
  from: z.string().optional(),
  /** The text, a caption, or a sticker's emoji. */
  text: z.string().optional(),
  /** Parts of `text` that link somewhere, in UTF-16 offsets. */
  links: z
    .array(z.object({ offset: z.number(), length: z.number(), url: z.url() }))
    .optional(),
  media: mediaKindSchema.optional(),
  fileName: z.string().optional(),
  /** Absent for messages kept before media could be shown. */
  file: inboxFileSchema.optional(),
});

export type InboxEntry = z.infer<typeof inboxEntrySchema>;

export const MAX_INBOX = 500;

export const inboxStore = defineStore(
  'inbox',
  listOf(inboxEntrySchema),
  () => [],
  { sealed: true }
);

/**
 * Received messages deleted from this browser. `getUpdates` is never
 * confirmed, so Telegram keeps returning a message for 24 hours; these stop
 * it coming back. Kept twice that long, then dropped.
 */
export const inboxRemovedSchema = z.object({
  id: z.string(),
  removedAt: z.number(),
});

export type InboxRemoved = z.infer<typeof inboxRemovedSchema>;

export const INBOX_REMOVED_FOR = 48 * 60 * 60 * 1000;

export const MAX_INBOX_REMOVED = 1000;

export const inboxRemovedStore = defineStore(
  'inboxRemoved',
  listOf(inboxRemovedSchema),
  () => [],
  { sealed: true }
);

/**
 * The photo behind the chat, as a WebP data URL. Apart from settings, which
 * are read far more often than it changes.
 */
export const chatPhotoStore = defineStore(
  'chatPhoto',
  z
    .string()
    .regex(/^data:image\/[\w.+-]+;base64,/)
    .nullable()
    .catch(null),
  () => null,
  { sealed: true }
);

/** 1.x data kept after migrating it (see `legacy.ts`), with its bot token. */
sealKey('legacyBackup');

export const statsSchema = z.object({
  sent: z.number().int().nonnegative().default(0),
});

export const statsStore = defineStore('stats', statsSchema, () => ({
  sent: 0,
}));

export const onboardingSchema = z.object({
  /** Set once the person reaches the end of setup, or migrates a working v1 setup. */
  completedAt: z.number().optional(),
  /** Version the data was migrated from, shown once on the welcome page. */
  migratedFrom: z.string().optional(),
});

export const onboardingStore = defineStore(
  'onboarding',
  onboardingSchema,
  () => ({})
);

/**
 * Which feature announcements (see `announcements.ts`) the person has seen,
 * by id. Ids only, so it isn't sealed: the popup can tell what's new while
 * locked.
 */
export const announcementsSchema = z.object({
  seen: z.array(z.string()).catch([]),
});

export const announcementsStore = defineStore(
  'announcements',
  announcementsSchema.catch({ seen: [] }),
  () => ({ seen: [] })
);

export function topicName(topic: Topic): string {
  return topic.name ?? `Topic ${topic.id}`;
}

export function destinationName(destination: Destination): string {
  if (destination.label) return destination.label;

  const chat = destination.chatTitle ?? `Chat ${destination.chatId}`;

  return destination.topic ? `${chat} › ${topicName(destination.topic)}` : chat;
}

/**
 * Picks a chat's avatar color from its name in Telegram, so a rename keeps it.
 * Each topic gets its own, as in Telegram.
 */
export function avatarSeed(destination: Destination): string {
  const seed = destination.chatTitle ?? destination.id;

  return destination.topic ? `${seed}:${destination.topic.id}` : seed;
}

/** Whether two destinations post to the same place: bot, chat and topic. */
export function isSamePlace(a: Destination, b: Destination): boolean {
  return (
    a.token === b.token &&
    String(a.chatId) === String(b.chatId) &&
    a.topic?.id === b.topic?.id
  );
}

export function defaultDestination(
  settings: Settings
): Destination | undefined {
  return (
    settings.destinations.find(
      (destination) => destination.id === settings.defaultDestinationId
    ) ?? settings.destinations[0]
  );
}
