import {
  chatIdSchema,
  chatTypeSchema,
  deliveredViaSchema,
} from '@send-to-telegram/core';
import { z } from 'zod';

import { defineStore } from './storage.ts';

/** Telegram links `#word` only for letters, digits and underscores. */
export const TAG_PATTERN = /^[\p{L}\p{N}_]{1,32}$/u;

export const MAX_TAGS = 12;

export const tagSchema = z.string().regex(TAG_PATTERN);

const destinationBase = z.object({
  id: z.string(),
  /** A name the person gave this destination; the chat title is used otherwise. */
  label: z.string().optional(),
  chatTitle: z.string().optional(),
  chatType: chatTypeSchema.optional(),
});

export const botDestinationSchema = destinationBase.extend({
  kind: z.literal('bot'),
  token: z.string(),
  chatId: chatIdSchema,
  botUsername: z.string().optional(),
});

export const relayDestinationSchema = destinationBase.extend({
  kind: z.literal('relay'),
  relayUrl: z.url(),
  deviceToken: z.string(),
});

export const destinationSchema = z.discriminatedUnion('kind', [
  botDestinationSchema,
  relayDestinationSchema,
]);

export type Destination = z.infer<typeof destinationSchema>;

export type BotDestination = z.infer<typeof botDestinationSchema>;

export type RelayDestination = z.infer<typeof relayDestinationSchema>;

export const imageModeSchema = z.enum(['photo', 'document', 'link']);

export type ImageMode = z.infer<typeof imageModeSchema>;

export const historyModeSchema = z.enum(['full', 'minimal', 'off']);

export type HistoryMode = z.infer<typeof historyModeSchema>;

export const themeSchema = z.enum(['system', 'light', 'dark']);

export type Theme = z.infer<typeof themeSchema>;

export const DEFAULT_TAGS = ['work', 'personal', 'ideas', 'reading'];

export const settingsSchema = z.object({
  destinations: z.array(destinationSchema).default([]),
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
  history: z.object({ mode: historyModeSchema.default('full') }).prefault({}),
  appearance: z.object({ theme: themeSchema.default('system') }).prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings = (): Settings => settingsSchema.parse({});

export const settingsStore = defineStore(
  'settings',
  settingsSchema,
  defaultSettings
);

export const contentKindSchema = z.enum(['selection', 'link', 'image', 'page']);

export type ContentKind = z.infer<typeof contentKindSchema>;

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
    })
    .optional(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const MAX_HISTORY = 1000;

/** Drops unreadable entries one by one instead of losing the whole list. */
const historySchema = z.array(z.json()).transform((entries) =>
  entries.flatMap((entry) => {
    const parsed = historyEntrySchema.safeParse(entry);

    return parsed.success ? [parsed.data] : [];
  })
);

export const historyStore = defineStore('history', historySchema, () => []);

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

export function destinationName(destination: Destination): string {
  if (destination.label) return destination.label;

  if (destination.chatTitle) return destination.chatTitle;

  return destination.kind === 'bot' ? `Chat ${destination.chatId}` : 'Telegram';
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
