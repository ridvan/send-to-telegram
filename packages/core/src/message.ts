import { z } from 'zod';

import {
  entitiesSchema,
  MAX_ENTITIES_PER_MESSAGE,
  normalizeEntities,
  shiftEntities,
  sliceEntities,
  type TextEntity,
} from './entities.ts';
import {
  ALBUM_LIMIT,
  ALBUM_MIN,
  type AlbumItem,
  CAPTION_LIMIT,
  TelegramError,
  type BotClient,
  type ChatId,
  type Captioned,
  type DeliveryOptions,
  type IncomingMessage,
  type InputFile,
  TEXT_LIMIT,
  type Upload,
} from './telegram.ts';
import { withoutTextDirective } from './text-fragment.ts';

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
    /** Formatting kept from the page, in place of markup that needs escaping. */
    entities: entitiesSchema.optional(),
    linkPreview: z.boolean(),
  }),
  deliverySchema.extend({
    kind: z.enum(['photo', 'video', 'audio', 'document']),
    url: httpUrlSchema,
    caption: z.string().max(CAPTION_LIMIT).optional(),
    captionEntities: entitiesSchema.optional(),
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
  captionEntities?: TextEntity[];
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
  captionEntities?: TextEntity[];
  silent: boolean;
};

export const SOURCE_BUTTON_LABEL = 'Open page';

/** Where a part of a text starts and ends in it. */
type Range = { start: number; end: number };

/** The length of `text` once trimmed at its start. */
const trimmedStart = (text: string) => text.length - text.trimStart().length;

/** Where each of `splitText`'s parts lies in the text, so entities can follow. */
function splitRanges(text: string, limit: number): Range[] {
  const ranges: Range[] = [];
  let at = trimmedStart(text);
  const stop = text.trimEnd().length;

  while (stop - at > limit) {
    const window = text.slice(at, at + limit);
    const floor = Math.floor(limit * 0.5);

    const breakAt = ['\n\n', '\n', '. ', ' ']
      .map((separator) => window.lastIndexOf(separator))
      .find((index) => index >= floor);

    const end = at + (breakAt === undefined ? limit : breakAt + 1);

    ranges.push({ start: at, end: at + text.slice(at, end).trimEnd().length });
    at = end + trimmedStart(text.slice(end, stop));
  }

  if (at < stop) ranges.push({ start: at, end: stop });

  return ranges;
}

/**
 * Splits text into Telegram-sized parts, preferring paragraph, line and word
 * boundaries so a long selection reads naturally across messages.
 */
export function splitText(text: string, limit = TEXT_LIMIT): string[] {
  return splitRanges(text, limit).map(({ start, end }) =>
    text.slice(start, end)
  );
}

/** A part of a long text, with the formatting that falls in it. */
export type TextPart = { text: string; entities: TextEntity[] };

/**
 * Splits text as `splitText` does, with each part's entities counted from
 * its own start. One a split falls inside goes on in the next part.
 */
export function splitFormatted(
  text: string,
  entities: readonly TextEntity[],
  limit = TEXT_LIMIT
): TextPart[] {
  return splitRanges(text, limit).map(({ start, end }) => {
    const part = text.slice(start, end);

    return {
      text: part,
      entities: normalizeEntities(
        part,
        sliceEntities(entities, start, end),
        MAX_ENTITIES_PER_MESSAGE
      ),
    };
  });
}

/**
 * Telegram turned down the formatting. Its wording isn't documented; the
 * one commonly reported names them ("can't parse entities"), so anything
 * mentioning entities is matched.
 */
export function isEntityRejection(cause: unknown): boolean {
  return (
    cause instanceof TelegramError &&
    cause.code === 400 &&
    /entit/i.test(cause.message)
  );
}

/**
 * Telegram turned down the button. Undocumented too; `BUTTON_URL_INVALID`
 * is the commonly reported wording for a URL it won't take.
 */
function isButtonRejection(cause: unknown): boolean {
  return (
    cause instanceof TelegramError &&
    cause.code === 400 &&
    /button/i.test(cause.message)
  );
}

/** What a message may go without when Telegram turns it down. */
type Extras = { entities: TextEntity[]; sourceUrl: string | undefined };

/**
 * Sends with the formatting and the button's quote link, and when Telegram
 * turns either down, once more without it: plain text, or the plain page
 * link. Formatting is never worth a message that doesn't go.
 */
async function withFallbacks<T>(
  extras: Extras,
  send: (extras: Extras) => Promise<T>
): Promise<T> {
  let { entities, sourceUrl } = extras;

  for (;;) {
    try {
      return await send({ entities, sourceUrl });
    } catch (error) {
      const plainUrl = sourceUrl && withoutTextDirective(sourceUrl);

      if (entities.length > 0 && isEntityRejection(error)) {
        entities = [];
      } else if (plainUrl !== sourceUrl && isButtonRejection(error)) {
        sourceUrl = plainUrl;
      } else {
        throw error;
      }
    }
  }
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
  const parts = splitFormatted(message.text, message.entities ?? []);
  const ids: number[] = [];

  // Each part falls back on its own, so one already sent isn't sent again.
  for (const [index, { text, entities }] of parts.entries()) {
    const isLast = index === parts.length - 1;
    const sourceUrl = isLast ? message.sourceUrl : undefined;

    const sent = await withFallbacks({ entities, sourceUrl }, (extras) => {
      const keyboard = sourceKeyboard(extras.sourceUrl);

      return bot.call('sendMessage', {
        ...target,
        text,
        ...(extras.entities.length > 0 && { entities: extras.entities }),
        disable_notification: message.silent,
        link_preview_options: { is_disabled: !message.linkPreview },
        ...(keyboard && { reply_markup: keyboard }),
      });
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
  common: DeliveryOptions & Captioned,
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

  const { caption } = message;

  const extras: Extras = {
    entities: caption
      ? normalizeEntities(
          caption,
          message.captionEntities ?? [],
          MAX_ENTITIES_PER_MESSAGE
        )
      : [],
    sourceUrl: message.sourceUrl,
  };

  const common = ({ entities, sourceUrl }: Extras) => {
    const keyboard = sourceKeyboard(sourceUrl);

    return {
      ...target,
      disable_notification: message.silent,
      ...(caption && { caption }),
      ...(entities.length > 0 && { caption_entities: entities }),
      ...(keyboard && { reply_markup: keyboard }),
    };
  };

  const file = 'upload' in message ? message.upload : message.url;

  if (message.kind !== 'document') {
    const kind = message.kind;

    try {
      const sent = await withFallbacks(extras, (each) =>
        sendMedia(bot, kind, common(each), file)
      );

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
    const sent = await withFallbacks(extras, (each) =>
      bot.call('sendDocument', { ...common(each), document: file })
    );

    return {
      messageId: sent.message_id,
      messageIds: [sent.message_id],
      via: 'document',
      ...('upload' in message && { sent }),
    };
  } catch (error) {
    if ('upload' in message || !isMediaRejection(error)) throw error;
  }

  const text = caption ? `${message.url}\n\n${caption}` : message.url;
  const entities = shiftEntities(extras.entities, message.url.length + 2);

  const ids = await sendText(bot, target, {
    kind: 'text',
    text,
    ...(entities.length > 0 && { entities }),
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

  const { caption } = album;

  const entities = caption
    ? normalizeEntities(
        caption,
        album.captionEntities ?? [],
        MAX_ENTITIES_PER_MESSAGE
      )
    : [];

  const sent = await withFallbacks(
    { entities, sourceUrl: undefined },
    (extras) => {
      const media = album.uploads.map((upload, index): AlbumItem => ({
        type: album.kind,
        media: upload,
        ...(index === captioned && caption && { caption }),
        ...(index === captioned &&
          caption &&
          extras.entities.length > 0 && { caption_entities: extras.entities }),
      }));

      return bot.call('sendMediaGroup', {
        ...targetOf(chatId, topic),
        disable_notification: album.silent,
        media,
      });
    }
  );

  const ids = sent.map((message) => message.message_id);

  return {
    messageId: ids.at(-1) ?? 0,
    messageIds: ids,
    via: album.kind,
    album: sent,
  };
}
