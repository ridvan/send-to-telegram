import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { TextEntity } from './entities.ts';
import {
  deliver,
  deliverAlbum,
  isTopicUnavailable,
  outgoingMessageSchema,
  PartlySent,
  splitFormatted,
  splitText,
} from './message.ts';
import {
  TelegramError,
  Upload,
  type BotClient,
  type BotMethod,
} from './telegram.ts';

type Call = { method: BotMethod; params: Parameters<BotClient['call']>[1] };

/** A bot that records calls and fails the methods listed in `rejects`. */
function fakeBot(rejects: Partial<Record<BotMethod, TelegramError>> = {}) {
  const calls: Call[] = [];
  let nextId = 1;

  const bot: BotClient = {
    async call(method, params) {
      calls.push({ method, params });

      const failure = rejects[method];

      if (failure) throw failure;

      const sent = {
        message_id: nextId++,
        chat: { id: 1, type: 'private' as const },
      };

      // SAFETY: the fake only serves send* methods, which all return a message.
      return sent as never;
    },
  };

  return { bot, calls };
}

const rejected = new TelegramError(
  400,
  'Bad Request: wrong type of the web page content'
);

describe('splitText', () => {
  it('keeps short text whole', () => {
    expect(splitText('  hello  ')).toEqual(['hello']);
  });

  it('breaks long text on paragraph boundaries', () => {
    const first = 'a'.repeat(60);
    const second = 'b'.repeat(30);
    const parts = splitText(`${first}\n\n${second}`, 80);

    expect(parts).toEqual([first, second]);
  });

  it('hard-cuts text with no usable boundary', () => {
    const parts = splitText('x'.repeat(250), 100);

    expect(parts.map((part) => part.length)).toEqual([100, 100, 50]);
  });
});

describe('deliver', () => {
  it('attaches the source button only to the last text part', async () => {
    const { bot, calls } = fakeBot();

    const delivery = await deliver(bot, 42, {
      kind: 'text',
      text: `${'a'.repeat(4000)}\n\n${'b'.repeat(200)}`,
      linkPreview: false,
      silent: true,
      sourceUrl: 'https://example.com/post',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.params).not.toHaveProperty('reply_markup');
    expect(calls[1]?.params).toHaveProperty('reply_markup');
    // Every part, so all of them can be deleted later.
    expect(delivery).toMatchObject({ messageId: 2, messageIds: [1, 2] });
  });

  it('says which parts of a long text went before one failed', async () => {
    let calls = 0;
    const limited = new TelegramError(429, 'Too Many Requests', 30);

    const bot: BotClient = {
      async call() {
        calls += 1;

        if (calls === 2) throw limited;

        // SAFETY: only sendMessage is called, which returns a message.
        return { message_id: calls, chat: { id: 1, type: 'private' } } as never;
      },
    };

    const text = `${'a'.repeat(4000)}\n\n${'b'.repeat(200)}`;
    const message = { kind: 'text', text, linkPreview: false, silent: true };

    const failure = deliver(bot, 42, { ...message, kind: 'text' });

    // Still the rate limit to callers that only know TelegramError.
    await expect(failure).rejects.toBeInstanceOf(PartlySent);
    await expect(failure).rejects.toMatchObject({
      code: 429,
      retryAfter: 30,
      messageIds: [1],
    });

    const rest = await deliver(
      bot,
      42,
      { ...message, kind: 'text' },
      undefined,
      1
    );

    expect(calls).toBe(3);
    expect(rest.messageIds).toEqual([3]);
  });

  it('falls back from photo to document to link', async () => {
    const { bot, calls } = fakeBot({
      sendPhoto: rejected,
      sendDocument: rejected,
    });

    const delivery = await deliver(bot, 42, {
      kind: 'photo',
      url: 'https://example.com/a.svg',
      caption: '#art',
      silent: false,
    });

    expect(calls.map((call) => call.method)).toEqual([
      'sendPhoto',
      'sendDocument',
      'sendMessage',
    ]);
    expect(delivery).toMatchObject({ via: 'link', messageIds: [1] });
    expect(calls[2]?.params).toMatchObject({
      text: 'https://example.com/a.svg\n\n#art',
    });
  });

  it('sends a video to play in Telegram, with its caption and button', async () => {
    const { bot, calls } = fakeBot();

    const delivery = await deliver(bot, 42, {
      kind: 'video',
      url: 'https://example.com/clip.mp4',
      caption: '#film',
      silent: false,
      sourceUrl: 'https://example.com/post',
    });

    expect(delivery).toMatchObject({ via: 'video', messageIds: [1] });
    expect(calls).toEqual([
      {
        method: 'sendVideo',
        params: {
          chat_id: 42,
          disable_notification: false,
          caption: '#film',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Open page', url: 'https://example.com/post' }],
            ],
          },
          video: 'https://example.com/clip.mp4',
        },
      },
    ]);
  });

  it('sends a song Telegram refuses as a file', async () => {
    const { bot, calls } = fakeBot({ sendAudio: rejected });

    const delivery = await deliver(bot, 42, {
      kind: 'audio',
      url: 'https://example.com/song.ogg',
      silent: false,
    });

    expect(calls.map((call) => call.method)).toEqual([
      'sendAudio',
      'sendDocument',
    ]);
    expect(calls[1]?.params).toMatchObject({
      document: 'https://example.com/song.ogg',
    });
    expect(delivery.via).toBe('document');
  });

  it('falls back from video to document to link', async () => {
    const { bot, calls } = fakeBot({
      sendVideo: rejected,
      sendDocument: rejected,
    });

    const delivery = await deliver(bot, 42, {
      kind: 'video',
      url: 'https://example.com/huge.webm',
      caption: 'Watch later',
      silent: true,
    });

    expect(calls.map((call) => call.method)).toEqual([
      'sendVideo',
      'sendDocument',
      'sendMessage',
    ]);
    expect(delivery.via).toBe('link');
    expect(calls[2]?.params).toMatchObject({
      text: 'https://example.com/huge.webm\n\nWatch later',
      disable_notification: true,
    });
  });

  it('does not hide errors that are not about the media', async () => {
    const { bot, calls } = fakeBot({
      sendPhoto: new TelegramError(
        403,
        'Forbidden: bot was blocked by the user'
      ),
    });

    await expect(
      deliver(bot, 42, {
        kind: 'photo',
        url: 'https://example.com/a.png',
        silent: false,
      })
    ).rejects.toMatchObject({ code: 403 });
    expect(calls).toHaveLength(1);
  });

  it('uploads a file as a document when the photo is refused, and stops there', async () => {
    const upload = new Upload(new Blob(['x']), 'a.png');
    const { bot, calls } = fakeBot({ sendPhoto: rejected });

    await expect(
      deliver(bot, 42, { kind: 'photo', upload, silent: false })
    ).resolves.toEqual({
      messageId: 1,
      messageIds: [1],
      via: 'document',
      sent: { message_id: 1, chat: { id: 1, type: 'private' } },
    });
    expect(calls[1]?.params).toMatchObject({ document: upload });

    const refused = fakeBot({ sendPhoto: rejected, sendDocument: rejected });

    await expect(
      deliver(refused.bot, 42, { kind: 'photo', upload, silent: false })
    ).rejects.toBe(rejected);
    expect(refused.calls).toHaveLength(2);
  });

  describe('to a forum topic', () => {
    const topic = 77;

    it('passes the topic to every text part', async () => {
      const { bot, calls } = fakeBot();

      await deliver(
        bot,
        -100123,
        {
          kind: 'text',
          text: `${'a'.repeat(4000)}\n\n${'b'.repeat(200)}`,
          linkPreview: true,
          silent: true,
        },
        topic
      );

      expect(calls).toHaveLength(2);

      for (const call of calls) {
        expect(call.params).toMatchObject({ message_thread_id: topic });
      }
    });

    it('passes it on media, upload and every fallback', async () => {
      const byUrl = fakeBot({ sendVideo: rejected, sendDocument: rejected });

      await deliver(
        byUrl.bot,
        -100123,
        { kind: 'video', url: 'https://example.com/a.webm', silent: false },
        topic
      );

      const upload = fakeBot({ sendPhoto: rejected });

      await deliver(
        upload.bot,
        -100123,
        {
          kind: 'photo',
          upload: new Upload(new Blob(['x']), 'a.png'),
          silent: false,
        },
        topic
      );

      const calls = [...byUrl.calls, ...upload.calls];

      expect(calls.map((call) => call.method)).toEqual([
        'sendVideo',
        'sendDocument',
        'sendMessage',
        'sendPhoto',
        'sendDocument',
      ]);

      for (const call of calls) {
        expect(call.params).toMatchObject({
          chat_id: -100123,
          message_thread_id: topic,
        });
      }
    });

    it('leaves the topic out when there is none', async () => {
      const { bot, calls } = fakeBot();

      await deliver(bot, 42, {
        kind: 'photo',
        url: 'https://example.com/a.png',
        silent: false,
      });

      expect(calls[0]?.params).not.toHaveProperty('message_thread_id');
    });

    it('stops at once when the topic is gone, instead of falling back', async () => {
      const gone = new TelegramError(
        400,
        'Bad Request: message thread not found'
      );

      const { bot, calls } = fakeBot({ sendPhoto: gone });

      await expect(
        deliver(
          bot,
          -100123,
          { kind: 'photo', url: 'https://example.com/a.png', silent: false },
          topic
        )
      ).rejects.toBe(gone);
      expect(calls).toHaveLength(1);
      expect(isTopicUnavailable(gone)).toBe(true);
      expect(
        isTopicUnavailable(new TelegramError(400, 'Bad Request: TOPIC_CLOSED'))
      ).toBe(true);
      expect(isTopicUnavailable(rejected)).toBe(false);
    });
  });
});

/** A bot that answers `sendMediaGroup` with one message per item. */
function albumBot() {
  const calls: Call[] = [];

  const bot: BotClient = {
    async call(method, params) {
      calls.push({ method, params });

      const count =
        params && 'media' in params && Array.isArray(params.media)
          ? params.media.length
          : 0;

      const sent = Array.from({ length: count }, (_, index) => ({
        message_id: 40 + index,
        chat: { id: 1, type: 'private' as const },
      }));

      // SAFETY: the fake only serves sendMediaGroup, which returns messages.
      return sent as never;
    },
  };

  return { bot, calls };
}

const uploads = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => new Upload(new Blob(['x']), `${index}.png`)
  );

describe('deliverAlbum', () => {
  it('records every message of the album, in order', async () => {
    const { bot } = albumBot();

    const delivery = await deliverAlbum(bot, 1, {
      kind: 'photo',
      uploads: uploads(3),
      silent: true,
    });

    expect(delivery).toMatchObject({
      messageId: 42,
      messageIds: [40, 41, 42],
      via: 'photo',
    });
    expect(delivery.album).toHaveLength(3);
  });

  it('puts a photo album’s caption on the first photo', async () => {
    const { bot, calls } = albumBot();

    await deliverAlbum(bot, 1, {
      kind: 'photo',
      uploads: uploads(2),
      caption: 'Two shots',
      silent: false,
    });

    expect(calls[0]?.method).toBe('sendMediaGroup');
    expect(calls[0]?.params).toMatchObject({
      chat_id: 1,
      disable_notification: false,
      media: [{ type: 'photo', caption: 'Two shots' }, { type: 'photo' }],
    });
    expect(calls[0]?.params).not.toHaveProperty('reply_markup');
  });

  it('puts a file album’s caption on the last file', async () => {
    const { bot, calls } = albumBot();

    await deliverAlbum(bot, 1, {
      kind: 'document',
      uploads: uploads(2),
      caption: 'Notes',
      silent: true,
    });

    expect(calls[0]?.params).toMatchObject({
      media: [{ type: 'document' }, { type: 'document', caption: 'Notes' }],
    });
  });

  it('sends the album to the topic', async () => {
    const { bot, calls } = albumBot();

    await deliverAlbum(
      bot,
      -100,
      { kind: 'photo', uploads: uploads(2), silent: true },
      77
    );

    expect(calls[0]?.params).toMatchObject({ message_thread_id: 77 });
  });

  it('refuses fewer than 2 or more than 10 files', async () => {
    const { bot, calls } = albumBot();

    for (const count of [1, 11]) {
      await expect(
        deliverAlbum(bot, 1, {
          kind: 'photo',
          uploads: uploads(count),
          silent: true,
        })
      ).rejects.toThrow(RangeError);
    }

    expect(calls).toHaveLength(0);
  });
});

/**
 * A bot that turns down any call carrying formatting or a button with a
 * quote link, as Telegram might, and records every call.
 */
function pickyBot(refuse: { entities?: string; button?: string }) {
  const calls: Call[] = [];
  let nextId = 1;

  const bot: BotClient = {
    async call(method, params) {
      calls.push({ method, params });

      const json = JSON.stringify(params);

      if (refuse.entities && /"(caption_)?entities"/.test(json)) {
        throw new TelegramError(400, refuse.entities);
      }

      if (refuse.button && json.includes(':~:')) {
        throw new TelegramError(400, refuse.button);
      }

      const sent = {
        message_id: nextId++,
        chat: { id: 1, type: 'private' as const },
      };

      // SAFETY: the fake only serves send* methods, which all return a message.
      return (method === 'sendMediaGroup' ? [sent] : sent) as never;
    },
  };

  return { bot, calls };
}

const bold = (offset: number, length: number): TextEntity => ({
  type: 'bold',
  offset,
  length,
});

describe('formatting', () => {
  it('splits entities with the text, cutting one a split falls inside', () => {
    const text = `${'a'.repeat(60)}\n\n${'b'.repeat(30)}`;
    const parts = splitFormatted(text, [bold(50, 20), bold(64, 4)], 80);

    expect(parts).toEqual([
      { text: 'a'.repeat(60), entities: [bold(50, 10)] },
      { text: 'b'.repeat(30), entities: [bold(0, 8)] },
    ]);
  });

  it('re-bases entities past the whitespace a split trims', () => {
    const parts = splitFormatted(
      `  ${'a'.repeat(10)} \n\n  bb`,
      [bold(15, 4)],
      12
    );

    expect(parts.map((part) => part.text)).toEqual(['a'.repeat(10), 'bb']);
    expect(parts[1]?.entities).toEqual([bold(0, 2)]);
  });

  it('splits text the same way with or without entities', () => {
    const text = `  ${'word '.repeat(300)}\n\n${'end. '.repeat(900)}  `;

    expect(splitFormatted(text, []).map((part) => part.text)).toEqual(
      splitText(text)
    );
  });

  it('counts offsets in UTF-16 code units, emoji and all', () => {
    const text = `👋 Привет ${'x'.repeat(20)} мир`;
    const at = text.indexOf('мир');
    const [part] = splitFormatted(text, [bold(at, 3)], 4096);

    expect(part?.text.slice(at, at + 3)).toBe('мир');
    expect(part?.entities).toEqual([bold(at, 3)]);
  });

  it('sends entities with text, and leaves them out when there are none', async () => {
    const { bot, calls } = fakeBot();

    await deliver(bot, 42, {
      kind: 'text',
      text: 'bold move',
      entities: [bold(0, 4)],
      linkPreview: false,
      silent: false,
    });
    await deliver(bot, 42, {
      kind: 'text',
      text: 'plain',
      linkPreview: false,
      silent: false,
    });

    expect(calls[0]?.params).toMatchObject({ entities: [bold(0, 4)] });
    expect(calls[1]?.params).not.toHaveProperty('entities');
  });

  it('sends the text again as plain when Telegram turns the formatting down', async () => {
    const { bot, calls } = pickyBot({
      entities: "Bad Request: can't parse entities: unsupported start tag",
    });

    const delivery = await deliver(bot, 42, {
      kind: 'text',
      text: 'bold move',
      entities: [bold(0, 4)],
      linkPreview: false,
      silent: false,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.params).not.toHaveProperty('entities');
    expect(delivery.messageIds).toEqual([1]);
  });

  it('sends only the refused part again, not the parts already sent', async () => {
    let refused = false;
    const calls: Call[] = [];

    const bot: BotClient = {
      async call(method, params) {
        calls.push({ method, params });

        // The second part's formatting is turned down, once.
        if (calls.length === 2 && !refused) {
          refused = true;
          throw new TelegramError(400, "Bad Request: can't parse entities");
        }

        // SAFETY: the fake only serves sendMessage.
        return {
          message_id: calls.length,
          chat: { id: 1, type: 'private' },
        } as never;
      },
    };

    await deliver(bot, 42, {
      kind: 'text',
      text: `${'a'.repeat(4000)}\n\n${'b'.repeat(200)}`,
      entities: [bold(0, 4), bold(4002, 5)],
      linkPreview: false,
      silent: false,
    });

    expect(
      calls.map((call) => JSON.stringify(call.params).includes('entities'))
    ).toEqual([true, true, false]);
  });

  it('keeps the button, without the quote, when Telegram turns its link down', async () => {
    const { bot, calls } = pickyBot({
      button: 'Bad Request: BUTTON_URL_INVALID',
    });

    await deliver(bot, 42, {
      kind: 'text',
      text: 'quote',
      linkPreview: false,
      silent: false,
      sourceUrl: 'https://example.com/post#top:~:text=quote',
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.params).toMatchObject({
      reply_markup: {
        inline_keyboard: [[{ url: 'https://example.com/post#top' }]],
      },
    });
  });

  it('does not retry other failures', async () => {
    const { bot, calls } = fakeBot({ sendMessage: rejected });

    await expect(
      deliver(bot, 42, {
        kind: 'text',
        text: 'bold',
        entities: [bold(0, 4)],
        linkPreview: false,
        silent: false,
        sourceUrl: 'https://example.com/#:~:text=bold',
      })
    ).rejects.toBe(rejected);
    expect(calls).toHaveLength(1);
  });

  it('formats a caption, and retries the same media plain before falling back', async () => {
    const { bot, calls } = pickyBot({
      entities: 'Bad Request: invalid entities',
    });

    const delivery = await deliver(bot, 42, {
      kind: 'photo',
      upload: new Upload(new Blob(['x']), 'a.png'),
      caption: 'bold move',
      captionEntities: [bold(0, 4)],
      silent: false,
    });

    expect(calls.map((call) => call.method)).toEqual([
      'sendPhoto',
      'sendPhoto',
    ]);
    expect(calls[0]?.params).toMatchObject({ caption_entities: [bold(0, 4)] });
    expect(calls[1]?.params).not.toHaveProperty('caption_entities');
    expect(delivery.via).toBe('photo');
  });

  it('moves a caption’s entities past the address when media goes as its link', async () => {
    const { bot, calls } = fakeBot({
      sendPhoto: rejected,
      sendDocument: rejected,
    });

    const url = 'https://example.com/a.svg';

    await deliver(bot, 42, {
      kind: 'photo',
      url,
      caption: 'bold move',
      captionEntities: [bold(0, 4)],
      silent: false,
    });

    expect(calls[2]?.params).toMatchObject({
      text: `${url}\n\nbold move`,
      entities: [bold(url.length + 2, 4)],
    });
  });

  it('formats an album’s caption on the item that carries it', async () => {
    const { bot, calls } = pickyBot({});
    const file = () => new Upload(new Blob(['x']), 'a.pdf');

    await deliverAlbum(bot, 42, {
      kind: 'document',
      uploads: [file(), file()],
      caption: 'bold move',
      captionEntities: [bold(0, 4)],
      silent: false,
    });

    const media = z
      .object({ media: z.array(z.looseObject({})) })
      .parse(calls[0]?.params).media;

    expect(media[0]).not.toHaveProperty('caption_entities');
    expect(media[1]).toMatchObject({ caption_entities: [bold(0, 4)] });
  });

  it('takes a button link with a text fragment, and refuses other link schemes', () => {
    const base = {
      kind: 'text',
      text: 'hi',
      linkPreview: false,
      silent: false,
    };

    expect(
      outgoingMessageSchema.safeParse({
        ...base,
        sourceUrl: 'https://example.com/post#top:~:text=a%20b,c%2Dd',
      }).success
    ).toBe(true);
    expect(
      outgoingMessageSchema.safeParse({
        ...base,
        entities: [
          {
            type: 'text_link',
            offset: 0,
            length: 2,
            url: 'javascript:alert(1)',
          },
        ],
      }).success
    ).toBe(false);
  });
});
