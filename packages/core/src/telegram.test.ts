import { describe, expect, it } from 'vitest';

import { botIdOf, createBotClient, Upload } from './telegram.ts';

const sent = {
  ok: true,
  result: { message_id: 7, chat: { id: 1, type: 'private' } },
};

/** Records the one request the client makes and answers with a sent message. */
function recordingFetch() {
  const requests: RequestInit[] = [];

  const fetchImpl: typeof fetch = async (_input, init) => {
    requests.push(init ?? {});

    return new Response(JSON.stringify(sent));
  };

  return { fetchImpl, requests };
}

describe('createBotClient', () => {
  it('posts JSON when no parameter is a file', async () => {
    const { fetchImpl, requests } = recordingFetch();

    await createBotClient('1:x', fetchImpl).call('sendMessage', {
      chat_id: 1,
      text: 'hi',
    });

    expect(requests[0]?.headers).toEqual({
      'Content-Type': 'application/json',
    });
    expect(requests[0]?.body).toBe('{"chat_id":1,"text":"hi"}');
  });

  it('posts a file as multipart, with objects as JSON fields', async () => {
    const { fetchImpl, requests } = recordingFetch();

    await createBotClient('1:x', fetchImpl).call('sendDocument', {
      chat_id: 1,
      disable_notification: true,
      document: new Upload(new Blob(['notes']), 'notes.txt'),
      reply_markup: {
        inline_keyboard: [[{ text: 'Open page', url: 'https://a.b' }]],
      },
    });

    const body = requests[0]?.body;

    expect(requests[0]?.headers).toBeUndefined();
    expect(body).toBeInstanceOf(FormData);

    if (!(body instanceof FormData)) return;

    const document = body.get('document');

    expect(document).toBeInstanceOf(File);
    expect(document instanceof File && document.name).toBe('notes.txt');
    expect(body.get('disable_notification')).toBe('true');
    expect(body.get('reply_markup')).toBe(
      '{"inline_keyboard":[[{"text":"Open page","url":"https://a.b"}]]}'
    );
  });
});

describe('sendMediaGroup', () => {
  it('names each album file as an attach:// part of its own', async () => {
    const requests: RequestInit[] = [];

    const fetchImpl: typeof fetch = async (_input, init) => {
      requests.push(init ?? {});

      return new Response(JSON.stringify({ ok: true, result: [] }));
    };

    await createBotClient('1:x', fetchImpl).call('sendMediaGroup', {
      chat_id: 1,
      media: [
        {
          type: 'photo',
          media: new Upload(new Blob(['a']), 'media.png'),
          caption: 'Both',
        },
        { type: 'photo', media: new Upload(new Blob(['b']), 'b.png') },
      ],
    });

    const body = requests[0]?.body;

    expect(body).toBeInstanceOf(FormData);

    if (!(body instanceof FormData)) return;

    expect(JSON.parse(String(body.get('media')))).toEqual([
      { type: 'photo', media: 'attach://file0', caption: 'Both' },
      { type: 'photo', media: 'attach://file1' },
    ]);

    const first = body.get('file0');
    const second = body.get('file1');

    expect(first instanceof File && first.name).toBe('media.png');
    expect(second instanceof File && second.name).toBe('b.png');
  });

  it('posts JSON when the album’s files are already on Telegram', async () => {
    const { fetchImpl, requests } = recordingFetch();

    await createBotClient('1:x', fetchImpl)
      .call('sendMediaGroup', {
        chat_id: 1,
        media: [
          { type: 'photo', media: 'AgAD1' },
          { type: 'photo', media: 'AgAD2' },
        ],
      })
      .catch(() => undefined);

    expect(requests[0]?.body).toBe(
      '{"chat_id":1,"media":[{"type":"photo","media":"AgAD1"},{"type":"photo","media":"AgAD2"}]}'
    );
  });
});

describe('botIdOf', () => {
  it('reads the bot’s ID from the start of its token', () => {
    expect(botIdOf('123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw')).toBe(
      123_456_789
    );
    expect(botIdOf('not a token')).toBeUndefined();
  });
});
