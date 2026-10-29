import { describe, expect, it } from 'vitest';

import { deliver, splitText } from './message.ts';
import { TelegramError, type BotClient, type BotMethod } from './telegram.ts';

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

    await deliver(bot, 42, {
      kind: 'text',
      text: `${'a'.repeat(4000)}\n\n${'b'.repeat(200)}`,
      linkPreview: false,
      silent: true,
      sourceUrl: 'https://example.com/post',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.params).not.toHaveProperty('reply_markup');
    expect(calls[1]?.params).toHaveProperty('reply_markup');
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
    expect(delivery.via).toBe('link');
    expect(calls[2]?.params).toMatchObject({
      text: 'https://example.com/a.svg\n\n#art',
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
});
