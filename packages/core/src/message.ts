import { z } from 'zod';

import {
  ALBUM_LIMIT,
  ALBUM_MIN,
  type AlbumItem,
  CAPTION_LIMIT,
  TelegramError,
  type BotClient,
  type ChatId,
  type DeliveryOptions,
  type IncomingMessage,
  type InputFile,
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
    kind: z.enum(['photo', 'video', 'audio', 'document']),
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

export const deliveredViaSchema = z.enum([
  'text',
  'photo',
  'video',
  'audio',
  'document',
  'link',
]);

export type DeliveredVia = z.infer<typeof deliveredViaSchema>;

export type Delivery = {
  /** The last message posted; the one a source button goes on. */
  messageId: number;
  /** Every message posted, in order: a long text goes in several. */
  messageIds: number[];
  /** How Telegram finally accepted it, after any fallbacks. */
  via: DeliveredVia;
  /** An upload as Telegram keeps it, with the IDs to download it again. */
  sent?: IncomingMessage;
  /** An album's messages as Telegram keeps them, in order. */
  album?: IncomingMessage[];
};

/**
 * Files uploaded from this device as one album. Telegram groups documents
 * only with documents, so an album is all photos or all files.
 */
export type AlbumMessage = {
  kind: 'photo' | 'document';
  uploads: Upload[];
  caption?: string;
  silent: boolean;
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

/**
 * The topic a message was sent to is gone or closed. Telegram answers
 * "message thread not found" for a deleted topic; the closed wording comes
 * from Telegram's servers, so it's matched loosely.
 */
export function isTopicUnavailable(cause: unknown): boolean {
  return (
    cause instanceof TelegramError &&
    cause.code === 400 &&
    /message thread not found|TOPIC_(CLOSED|DELETED|ID_INVALID)/i.test(
      cause.message
    )
  );
}

/** Telegram rejected the media itself (not the bot, chat or topic), so another form may work. */
function isMediaRejection(cause: unknown): boolean {
  return (
    cause instanceof TelegramError &&
    cause.code === 400 &&
    !isTopicUnavailable(cause)
  );
}

/** Where a message goes: a chat, and the forum topic in it if any. */
type Target = Pick<DeliveryOptions, 'chat_id' | 'message_thread_id'>;

function targetOf(chatId: ChatId, topic: number | undefined): Target {
  return topic === undefined
    ? { chat_id: chatId }
    : { chat_id: chatId, message_thread_id: topic };
}

async function sendText(
  bot: BotClient,
  target: Target,
  message: Extract<OutgoingMessage, { kind: 'text' }>
): Promise<number[]> {
  const parts = splitText(message.text);
  const ids: number[] = [];

  for (const [index, text] of parts.entries()) {
    const isLast = index === parts.length - 1;
    const keyboard = isLast ? sourceKeyboard(message.sourceUrl) : undefined;

    const sent = await bot.call('sendMessage', {
      ...target,
      text,
      disable_notification: message.silent,
      link_preview_options: { is_disabled: !message.linkPreview },
      ...(keyboard && { reply_markup: keyboard }),
    });

    ids.push(sent.message_id);
  }

  return ids;
}

/** A delivery of the messages a text went out as. */
function textDelivery(ids: number[], via: 'text' | 'link'): Delivery {
  return { messageId: ids.at(-1) ?? 0, messageIds: ids, via };
}

/** Sends a file as the media Telegram plays or shows inline. */
function sendMedia(
  bot: BotClient,
  kind: 'photo' | 'video' | 'audio',
  common: DeliveryOptions & { caption?: string },
  file: InputFile
) {
  switch (kind) {
    case 'photo':
      return bot.call('sendPhoto', { ...common, photo: file });
    case 'video':
      return bot.call('sendVideo', { ...common, video: file });
    case 'audio':
      return bot.call('sendAudio', { ...common, audio: file });
  }
}

/**
 * Delivers one message. Media that Telegram cannot fetch or render falls back
 * from photo, video or audio to document to a plain link, so a send never
 * silently disappears. By URL Telegram fetches at most 20 MB, needs the right
 * MIME type, and only promises documents for PDF and ZIP, so the link is what
 * most rejected videos and songs end up as. An upload has no link to fall
 * back to, so its last rejection stands. A missing topic is no media
 * problem, so it ends the send at once.
 */
export async function deliver(
  bot: BotClient,
  chatId: ChatId,
  message: OutgoingMessage | UploadMessage,
  /** A forum topic's `message_thread_id`; absent posts to General. */
  topic?: number
): Promise<Delivery> {
  const target = targetOf(chatId, topic);

  if (message.kind === 'text') {
    return textDelivery(await sendText(bot, target, message), 'text');
  }

  const keyboard = sourceKeyboard(message.sourceUrl);

  const common = {
    ...target,
    disable_notification: message.silent,
    ...(message.caption && { caption: message.caption }),
    ...(keyboard && { reply_markup: keyboard }),
  };

  const file = 'upload' in message ? message.upload : message.url;

  if (message.kind !== 'document') {
    try {
      const sent = await sendMedia(bot, message.kind, common, file);

      return {
        messageId: sent.message_id,
        messageIds: [sent.message_id],
        via: message.kind,
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
      messageIds: [sent.message_id],
      via: 'document',
      ...('upload' in message && { sent }),
    };
  } catch (error) {
    if ('upload' in message || !isMediaRejection(error)) throw error;
  }

  const text = message.caption
    ? `${message.url}\n\n${message.caption}`
    : message.url;

  const ids = await sendText(bot, target, {
    kind: 'text',
    text,
    linkPreview: true,
    silent: message.silent,
    ...(message.sourceUrl && { sourceUrl: message.sourceUrl }),
  });

  return textDelivery(ids, 'link');
}

/**
 * Delivers 2 to 10 uploads as one album with `sendMediaGroup`. It takes no
 * keyboard, so a source link belongs in the caption. Telegram's apps show a
 * photo album's caption, carried by one item, under the whole album; in a
 * file album each file shows its own, so it goes on the last file to read
 * under them all. A rejection stands: no other form keeps them one message.
 */
export async function deliverAlbum(
  bot: BotClient,
  chatId: ChatId,
  album: AlbumMessage,
  /** A forum topic's `message_thread_id`; absent posts to General. */
  topic?: number
): Promise<Delivery> {
  const count = album.uploads.length;

  if (count < ALBUM_MIN || count > ALBUM_LIMIT) {
    throw new RangeError(
      `An album takes ${ALBUM_MIN} to ${ALBUM_LIMIT} files, not ${count}`
    );
  }

  const captioned = album.kind === 'photo' ? 0 : count - 1;

  const media = album.uploads.map((upload, index): AlbumItem => ({
    type: album.kind,
    media: upload,
    ...(index === captioned && album.caption && { caption: album.caption }),
  }));

  const sent = await bot.call('sendMediaGroup', {
    ...targetOf(chatId, topic),
    disable_notification: album.silent,
    media,
  });

  const ids = sent.map((message) => message.message_id);

  return {
    messageId: ids.at(-1) ?? 0,
    messageIds: ids,
    via: album.kind,
    album: sent,
  };
}
