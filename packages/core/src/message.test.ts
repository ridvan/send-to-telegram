import { describe, expect, it } from 'vitest';

import {
  deliver,
  deliverAlbum,
  isTopicUnavailable,
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
