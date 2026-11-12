import { z } from 'zod';

import type { TextEntity } from './entities.ts';

export const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';

/** Telegram's hard limits for message text and media captions. */
export const TEXT_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

/** The largest files a bot may upload: photos, and anything sent as a file. */
export const PHOTO_UPLOAD_LIMIT = 10 * 1024 * 1024;
export const UPLOAD_LIMIT = 50 * 1024 * 1024;

/** `sendMediaGroup` takes 2 to 10 items. */
export const ALBUM_MIN = 2;
export const ALBUM_LIMIT = 10;

export const chatIdSchema = z.union([
  z.number().int(),
  z
    .string()
    .trim()
    .regex(/^(-?\d+|@\w{4,})$/, 'Use a numeric ID or a public @username'),
]);

export type ChatId = z.infer<typeof chatIdSchema>;

export const chatTypeSchema = z.enum([
  'private',
  'group',
  'supergroup',
  'channel',
]);

export type ChatType = z.infer<typeof chatTypeSchema>;

export const chatSchema = z.object({
  id: z.number(),
  type: chatTypeSchema,
  title: z.string().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  /** A supergroup with topics, each its own thread. */
  is_forum: z.boolean().optional(),
});

export type Chat = z.infer<typeof chatSchema>;

export const userSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  username: z.string().optional(),
});

export const sentMessageSchema = z.object({
  message_id: z.number(),
  chat: chatSchema,
});

/** Marks part of a message's text; offsets count UTF-16 code units, as in JS. */
const entitySchema = z.object({
  type: z.string(),
  offset: z.number(),
  length: z.number(),
  /** Set for `text_link`, a link behind other text. */
  url: z.string().optional(),
});

export type MessageEntity = z.infer<typeof entitySchema>;

/**
 * A file a message carries. Only `file_id` is required: one update that fails
 * to parse would lose every other update read with it.
 */
const fileFields = {
  /** Downloads the file with this bot; see `getFile`. */
  file_id: z.string(),
  /** The same for every bot and over time, so it names a cached copy. */
  file_unique_id: z.string().optional(),
  file_size: z.number().optional(),
};

const photoSizeSchema = z.object({
  ...fileFields,
  width: z.number().optional(),
  height: z.number().optional(),
});

export type PhotoSize = z.infer<typeof photoSizeSchema>;

const playableSchema = z.object({
  ...fileFields,
  width: z.number().optional(),
  height: z.number().optional(),
  /** Seconds. */
  duration: z.number().optional(),
  mime_type: z.string().optional(),
  file_name: z.string().optional(),
  thumbnail: photoSizeSchema.optional(),
});

/** Names a topic: on the message that created it, or on one that renamed it. */
const topicNameSchema = z
  .object({ name: z.string().optional() })
  .optional()
  .catch(undefined);

const incomingMessageSchema = z.object({
  message_id: z.number(),
  chat: chatSchema,
  /**
   * The topic, or for replies outside forums the thread replied to; only
   * `is_topic_message` tells them apart. General carries neither.
   */
  message_thread_id: z.number().optional(),
  is_topic_message: z.boolean().optional(),
  forum_topic_created: topicNameSchema,
  forum_topic_edited: topicNameSchema,
  /**
   * Only what names a topic: Telegram sets the topic's first message here on
   * messages in it that reply to nothing else.
   */
  reply_to_message: z
    .object({ message_id: z.number(), forum_topic_created: topicNameSchema })
    .optional()
    .catch(undefined),
  from: userSchema.optional(),
  /** Set when a group became a supergroup, which gets a new chat ID. */
  migrate_to_chat_id: z.number().optional(),
  /** Unix time in seconds. */
  date: z.number().optional(),
  text: z.string().optional(),
  entities: z.array(entitySchema).optional(),
  /** Text under a photo, video or file. */
  caption: z.string().optional(),
  caption_entities: z.array(entitySchema).optional(),
  /** One photo in several sizes, smallest first. */
  photo: z.array(photoSizeSchema).optional(),
  video: playableSchema.optional(),
  /** A GIF, which Telegram turns into a silent video. */
  animation: playableSchema.optional(),
  voice: playableSchema.optional(),
  audio: playableSchema
    .extend({
      title: z.string().optional(),
      performer: z.string().optional(),
    })
    .optional(),
  document: playableSchema.optional(),
  sticker: z
    .object({ file_id: z.string(), emoji: z.string().optional() })
    .optional(),
});

export type IncomingMessage = z.infer<typeof incomingMessageSchema>;

export const updateSchema = z.object({
  update_id: z.number(),
  message: incomingMessageSchema.optional(),
  channel_post: incomingMessageSchema.optional(),
  my_chat_member: z
    .object({
      chat: chatSchema,
      from: userSchema,
      new_chat_member: z.object({ status: z.string() }),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: userSchema,
      data: z.string().optional(),
      message: z
        .object({ message_id: z.number(), chat: chatSchema })
        .optional(),
    })
    .optional(),
});

export type Update = z.infer<typeof updateSchema>;

const webhookInfoSchema = z.object({
  url: z.string(),
  pending_update_count: z.number(),
  last_error_message: z.string().optional(),
});

const resultSchemas = {
  getMe: userSchema,
  getChat: chatSchema,
  getChatMember: z.object({ status: z.string() }),
  getFile: z.object({
    file_id: z.string(),
    file_size: z.number().optional(),
    /** Valid for about an hour; see `fileUrl`. */
    file_path: z.string().optional(),
  }),
  getUpdates: z.array(updateSchema),
  getWebhookInfo: webhookInfoSchema,
  sendMessage: sentMessageSchema,
  // The whole message, so an uploaded file can be downloaded again.
  sendPhoto: incomingMessageSchema,
  sendDocument: incomingMessageSchema,
  sendVideo: incomingMessageSchema,
  sendAudio: incomingMessageSchema,
  /** Every message of the album, in order. */
  sendMediaGroup: z.array(incomingMessageSchema),
  editMessageText: z.union([sentMessageSchema, z.literal(true)]),
  deleteMessage: z.literal(true),
  deleteMessages: z.literal(true),
  answerCallbackQuery: z.literal(true),
  setWebhook: z.literal(true),
  setMyCommands: z.literal(true),
};

type InlineKeyboard = {
  inline_keyboard: { text: string; url?: string; callback_data?: string }[][];
};

export type DeliveryOptions = {
  chat_id: ChatId;
  /** A forum topic; absent posts to General. */
  message_thread_id?: number;
  disable_notification?: boolean;
  reply_markup?: InlineKeyboard;
};

/** A caption, and its formatting given as entities rather than markup. */
export type Captioned = { caption?: string; caption_entities?: TextEntity[] };

/** A URL Telegram fetches, or a file uploaded with the request. */
export type InputFile = string | Upload;

/** A file sent with the request itself, under its own name. */
export class Upload {
  readonly blob: Blob;
  readonly fileName: string;

  constructor(blob: Blob, fileName: string) {
    this.blob = blob;
    this.fileName = fileName;
  }
}

/** One file of an album, as `sendMediaGroup` takes it. */
export type AlbumItem = {
  type: 'photo' | 'document';
  media: InputFile;
  caption?: string;
  caption_entities?: TextEntity[];
};

/** An album item whose file goes with the request. */
const uploadItemSchema = z.looseObject({ media: z.instanceof(Upload) });

/**
 * An album's items name their uploads as `attach://<part>`, and the files go
 * as parts of that name. The part names are generated, so a file's own name
 * can't clash with a parameter; it stays the part's filename.
 */
function attachItems(items: unknown[], uploads: Upload[]): unknown[] {
  return items.map((item) => {
    const upload = uploadItemSchema.safeParse(item);

    if (!upload.success) return item;

    uploads.push(upload.data.media);

    return { ...upload.data, media: `attach://file${uploads.length - 1}` };
  });
}

/**
 * JSON, unless a parameter is a file or an album item is: then multipart,
 * with strings as they are and everything else, such as `reply_markup`, as
 * JSON. The browser sets the multipart boundary, so no Content-Type here.
 */
function requestBody(params: MethodParams[BotMethod]): RequestInit {
  const uploads: Upload[] = [];

  const entries = Object.entries(params ?? {}).map(
    ([name, value]): [string, unknown] => [
      name,
      name === 'media' && Array.isArray(value)
        ? attachItems(value, uploads)
        : value,
    ]
  );

  if (
    uploads.length === 0 &&
    !entries.some(([, value]) => value instanceof Upload)
  ) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params ?? {}),
    };
  }

  const form = new FormData();

  for (const [name, value] of entries) {
    if (value === undefined) continue;

    if (value instanceof Upload) {
      form.append(name, value.blob, value.fileName);
      continue;
    }

    const text = z.string().safeParse(value);

    form.append(name, text.success ? text.data : JSON.stringify(value));
  }

  for (const [index, upload] of uploads.entries()) {
    form.append(`file${index}`, upload.blob, upload.fileName);
  }

  return { body: form };
}

type MethodParams = {
  getMe: undefined;
  getChat: { chat_id: ChatId };
  getChatMember: { chat_id: ChatId; user_id: number };
  getFile: { file_id: string };
  getUpdates: { offset?: number; timeout?: number; allowed_updates?: string[] };
  getWebhookInfo: undefined;
  sendMessage: DeliveryOptions & {
    text: string;
    entities?: TextEntity[];
    link_preview_options?: { is_disabled: boolean };
  };
  sendPhoto: DeliveryOptions & Captioned & { photo: InputFile };
  sendDocument: DeliveryOptions & Captioned & { document: InputFile };
  sendVideo: DeliveryOptions & Captioned & { video: InputFile };
  sendAudio: DeliveryOptions & Captioned & { audio: InputFile };
  /** Takes no `reply_markup`, so an album can't carry a button. */
  sendMediaGroup: Omit<DeliveryOptions, 'reply_markup'> & {
    media: AlbumItem[];
  };
  editMessageText: {
    chat_id: ChatId;
    message_id: number;
    text: string;
    reply_markup?: InlineKeyboard;
  };
  /** 1 to 100 messages of one chat; ones Telegram can't find are skipped. */
  deleteMessage: { chat_id: ChatId; message_id: number };
  /** Answers true whether or not each message went; see `deleteMessage`. */
  deleteMessages: { chat_id: ChatId; message_ids: number[] };
  answerCallbackQuery: { callback_query_id: string; text?: string };
  setWebhook: {
    url: string;
    secret_token: string;
    allowed_updates: string[];
    drop_pending_updates?: boolean;
  };
  setMyCommands: { commands: { command: string; description: string }[] };
};

export type BotMethod = keyof typeof resultSchemas;

export type BotResult<M extends BotMethod> = z.infer<(typeof resultSchemas)[M]>;

/** Mapped form of `resultSchemas`, so a generic method keeps its result type. */
type ResultSchemas = { [M in BotMethod]: z.ZodType<BotResult<M>> };

const schemasByMethod: ResultSchemas = resultSchemas;

const failureSchema = z.object({
  ok: z.literal(false),
  error_code: z.number(),
  description: z.string(),
  parameters: z.object({ retry_after: z.number().optional() }).optional(),
});

const successSchema = z.object({ ok: z.literal(true), result: z.json() });

/** A Bot API failure, or a network failure (code 0) before Telegram answered. */
export class TelegramError extends Error {
  readonly code: number;
  readonly retryAfter: number | undefined;

  constructor(
    code: number,
    description: string,
    retryAfter?: number,
    options?: ErrorOptions
  ) {
    super(description, options);
    this.name = 'TelegramError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export type Fetch = typeof fetch;

export type BotClient = {
  call: <M extends BotMethod>(
    method: M,
    params: MethodParams[M]
  ) => Promise<BotResult<M>>;
};

export function createBotClient(token: string, fetchImpl: Fetch = fetch) {
  async function call<M extends BotMethod>(
    method: M,
    params: MethodParams[M]
  ): Promise<BotResult<M>> {
    let response: Response;

    try {
      response = await fetchImpl(
        `${TELEGRAM_API_ORIGIN}/bot${token}/${method}`,
        { method: 'POST', ...requestBody(params) }
      );
    } catch (cause) {
      throw new TelegramError(0, 'Could not reach Telegram', undefined, {
        cause,
      });
    }

    const body = z
      .union([successSchema, failureSchema])
      .safeParse(await response.json().catch(() => null));

    if (!body.success) {
      throw new TelegramError(
        response.status,
        `Telegram answered with HTTP ${response.status}`
      );
    }

    if (!body.data.ok) {
      throw new TelegramError(
        body.data.error_code,
        body.data.description,
        body.data.parameters?.retry_after
      );
    }

    return schemasByMethod[method].parse(body.data.result);
  }

  return { call } satisfies BotClient;
}

/** Bots can download files up to this size with `getFile`. */
export const DOWNLOAD_LIMIT = 20 * 1024 * 1024;

/**
 * Where to download a file `getFile` described. The URL carries the bot's
 * token, so fetch it and never put it in a page.
 */
export function fileUrl(token: string, filePath: string): string {
  return `${TELEGRAM_API_ORIGIN}/file/bot${token}/${filePath}`;
}

/** Bot tokens look like `123456789:AA…`; checking locally avoids a wasted request. */
export const botTokenSchema = z
  .string()
  .trim()
  .regex(/^\d{5,}:[\w-]{30,}$/, 'This does not look like a bot token');

/**
 * The bot's user ID, which a token starts with. It names the bot without
 * the secret part, and stays when the token is revoked and replaced.
 */
export function botIdOf(token: string): number | undefined {
  const id = /^(\d+):/.exec(token)?.[1];

  return id === undefined ? undefined : Number(id);
}

/** Human name for a chat, the way Telegram clients title it. */
export function chatTitle(chat: Chat): string {
  if (chat.title) return chat.title;

  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ');

  if (name) return name;

  return chat.username ? `@${chat.username}` : String(chat.id);
}
