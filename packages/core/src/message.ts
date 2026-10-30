import { z } from 'zod';

import {
  CAPTION_LIMIT,
  TelegramError,
  type BotClient,
  type ChatId,
  type IncomingMessage,
  TEXT_LIMIT,
  type Upload,
} from './telegram.ts';

const httpUrlSchema = z.url({ protocol: /^https?$/ });

/** Room for several Telegram messages; longer selections are cut, not split forever. */
export const MAX_TEXT_LENGTH = TEXT_LIMIT * 8;

const deliverySchema = z.object({
  silent: z.boolean(),
  /** Adds an inline button that opens the page the content came from. */
  sourceUrl: httpUrlSchema.optional(),
});

export const outgoingMessageSchema = z.discriminatedUnion('kind', [
  deliverySchema.extend({
    kind: z.literal('text'),
    text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    linkPreview: z.boolean(),
  }),
  deliverySchema.extend({
    kind: z.enum(['photo', 'document']),
    url: httpUrlSchema,
    caption: z.string().max(CAPTION_LIMIT).optional(),
  }),
]);

/** What the extension asks to deliver; the transport turns it into Bot API calls. */
export type OutgoingMessage = z.infer<typeof outgoingMessageSchema>;

/**
 * A file uploaded from this device instead of fetched from a URL. Only the
 * extension sends these, straight to the Bot API: the relay takes JSON.
 */
export type UploadMessage = z.infer<typeof deliverySchema> & {
  kind: 'photo' | 'document';
  upload: Upload;
  caption?: string;
};

export const deliveredViaSchema = z.enum(['text', 'photo', 'document', 'link']);

export type DeliveredVia = z.infer<typeof deliveredViaSchema>;

export type Delivery = {
  messageId: number;
  /** How Telegram finally accepted it, after any fallbacks. */
  via: DeliveredVia;
  /** An upload as Telegram keeps it, with the IDs to download it again. */
  sent?: IncomingMessage;
};

export const SOURCE_BUTTON_LABEL = 'Open page';

/**
 * Splits text into Telegram-sized parts, preferring paragraph, line and word
 * boundaries so a long selection reads naturally across messages.
 */
export function splitText(text: string, limit = TEXT_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text.trim();

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const floor = Math.floor(limit * 0.5);

    const breakAt = ['\n\n', '\n', '. ', ' ']
      .map((separator) => window.lastIndexOf(separator))
      .find((index) => index >= floor);

    const end = breakAt === undefined ? limit : breakAt + 1;

    parts.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }

  if (rest) parts.push(rest);

  return parts;
}

function sourceKeyboard(sourceUrl: string | undefined) {
  if (!sourceUrl) return undefined;

  return {
    inline_keyboard: [[{ text: SOURCE_BUTTON_LABEL, url: sourceUrl }]],
  };
}

/** Telegram rejected the media itself (not the bot or chat), so another form may work. */
function isMediaRejection(cause: unknown): boolean {
  return cause instanceof TelegramError && cause.code === 400;
}

async function sendText(
  bot: BotClient,
  chatId: ChatId,
  message: Extract<OutgoingMessage, { kind: 'text' }>
): Promise<number> {
  const parts = splitText(message.text);
  let lastId = 0;

  for (const [index, text] of parts.entries()) {
    const isLast = index === parts.length - 1;
    const keyboard = isLast ? sourceKeyboard(message.sourceUrl) : undefined;

    const sent = await bot.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_notification: message.silent,
      link_preview_options: { is_disabled: !message.linkPreview },
      ...(keyboard && { reply_markup: keyboard }),
    });

    lastId = sent.message_id;
  }

  return lastId;
}

/**
 * Delivers one message. Media that Telegram cannot fetch or render falls back
 * from photo to document to a plain link, so a send never silently disappears.
 * An upload has no link to fall back to, so its last rejection stands.
 */
export async function deliver(
  bot: BotClient,
  chatId: ChatId,
  message: OutgoingMessage | UploadMessage
): Promise<Delivery> {
  if (message.kind === 'text') {
    return { messageId: await sendText(bot, chatId, message), via: 'text' };
  }

  const keyboard = sourceKeyboard(message.sourceUrl);

  const common = {
    chat_id: chatId,
    disable_notification: message.silent,
    ...(message.caption && { caption: message.caption }),
    ...(keyboard && { reply_markup: keyboard }),
  };

  const file = 'upload' in message ? message.upload : message.url;

  if (message.kind === 'photo') {
    try {
      const sent = await bot.call('sendPhoto', { ...common, photo: file });

      return {
        messageId: sent.message_id,
        via: 'photo',
        ...('upload' in message && { sent }),
      };
    } catch (error) {
      if (!isMediaRejection(error)) throw error;
    }
  }

  try {
    const sent = await bot.call('sendDocument', { ...common, document: file });

    return {
      messageId: sent.message_id,
      via: 'document',
      ...('upload' in message && { sent }),
    };
  } catch (error) {
    if ('upload' in message || !isMediaRejection(error)) throw error;
  }

  const text = message.caption
    ? `${message.url}\n\n${message.caption}`
    : message.url;

  const messageId = await sendText(bot, chatId, {
    kind: 'text',
    text,
    linkPreview: true,
    silent: message.silent,
    ...(message.sourceUrl && { sourceUrl: message.sourceUrl }),
  });

  return { messageId, via: 'link' };
}
