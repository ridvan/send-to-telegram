import { z } from 'zod';

import { deliveredViaSchema } from './message.ts';
import { chatTypeSchema } from './telegram.ts';

/**
 * Contract between the extension and the optional relay. The extension owns a
 * random device token and sends it as a bearer token; the relay only stores
 * its hash and the Telegram chat it was linked to.
 */
export const RELAY_API_VERSION = 'v1';

export const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Telegram allows 1–64 characters of `[A-Za-z0-9_-]` in a /start payload. */
export const PAIRING_CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const relayInfoSchema = z.object({
  botUsername: z.string(),
  version: z.string(),
});

export type RelayInfo = z.infer<typeof relayInfoSchema>;

export const pairingRequestSchema = z.object({
  /** Shown in the bot's device list, e.g. "Chrome on macOS". */
  client: z.string().trim().min(1).max(64),
});

export const pairingSchema = z.object({
  code: z.string().regex(PAIRING_CODE_PATTERN),
  botUsername: z.string(),
  expiresAt: z.number(),
});

export type Pairing = z.infer<typeof pairingSchema>;

export const relayChatSchema = z.object({
  title: z.string(),
  type: chatTypeSchema,
});

export type RelayChat = z.infer<typeof relayChatSchema>;

export const deviceStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), expiresAt: z.number() }),
  z.object({ status: z.literal('linked'), chat: relayChatSchema }),
]);

export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const relayDeliverySchema = z.object({
  messageId: z.number(),
  via: deliveredViaSchema,
});

export const relayErrorCodeSchema = z.enum([
  /** Unknown, expired or unlinked device token. */
  'unauthorized',
  'rate_limited',
  'invalid_request',
  /** The user blocked the bot or removed it from the chat. */
  'chat_unavailable',
  'telegram_error',
  'not_found',
]);

export type RelayErrorCode = z.infer<typeof relayErrorCodeSchema>;

export const relayErrorSchema = z.object({
  error: z.object({ code: relayErrorCodeSchema, message: z.string() }),
});

export type RelayError = z.infer<typeof relayErrorSchema>;
