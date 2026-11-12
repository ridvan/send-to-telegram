import { describe, expect, it } from 'vitest';

import { draftFromEntry } from './client.ts';
import { compose, ComposeError, messageText } from './compose.ts';
import {
  defaultSettings,
  type HistoryEntry,
  historyEntrySchema,
} from './settings.ts';

const delivery = defaultSettings().delivery;
const page = { pageUrl: 'https://example.com/post', pageTitle: 'A post' };

describe('compose', () => {
  it('puts the note first and the hashtag last', () => {
    const message = compose(
      {
        kind: 'selection',
        text: 'Line one\nLine two',
        note: 'Read this',
        tag: 'ideas',
        ...page,
      },
      delivery
    );

    expect(message).toEqual({
      kind: 'text',
      text: 'Read this\n\nLine one\nLine two\n\n#ideas',
      linkPreview: true,
      silent: true,
      sourceUrl: 'https://example.com/post',
    });
  });

  it('adds the page title when previews are off', () => {
    expect(
      compose({ kind: 'page', ...page }, { ...delivery, linkPreview: false })
    ).toMatchObject({
      text: 'A post\nhttps://example.com/post',
    });
    expect(compose({ kind: 'page', ...page }, delivery)).toMatchObject({
      text: 'https://example.com/post',
    });
  });

  it('never adds a source button that points at the content itself', () => {
    const message = compose(
      { kind: 'link', url: page.pageUrl, ...page },
      delivery
    );

    expect(message).not.toHaveProperty('sourceUrl');
  });

  it('picks a form Telegram can show for each image type', () => {
    const image = (url: string) =>
      compose({ kind: 'image', url, tag: 'art', ...page }, delivery);

    expect(image('https://cdn.example.com/a.jpg')).toMatchObject({
      kind: 'photo',
      caption: '#art',
    });
    expect(image('https://cdn.example.com/a.gif')).toMatchObject({
      kind: 'document',
    });
    expect(image('https://cdn.example.com/a.svg')).toMatchObject({
      kind: 'text',
      text: 'https://cdn.example.com/a.svg\n\n#art',
    });
  });

  it('explains why embedded images cannot be sent', () => {
    expect(() =>
      compose(
        { kind: 'image', url: 'data:image/png;base64,AAAA', ...page },
        delivery
      )
    ).toThrow(ComposeError);
  });

  it('sends a video or song from its address, with the note and hashtag as its caption', () => {
    expect(
      compose(
        {
          kind: 'video',
          url: 'https://cdn.example.com/clip.mp4',
          note: 'Watch this',
          tag: 'film',
          ...page,
        },
        delivery
      )
    ).toEqual({
      kind: 'video',
      url: 'https://cdn.example.com/clip.mp4',
      caption: 'Watch this\n\n#film',
      silent: true,
      sourceUrl: 'https://example.com/post',
    });
    expect(
      compose(
        { kind: 'audio', url: 'https://cdn.example.com/song.mp3', ...page },
        { ...delivery, imageMode: 'link' }
      )
    ).toEqual({
      kind: 'audio',
      url: 'https://cdn.example.com/song.mp3',
      silent: true,
      sourceUrl: 'https://example.com/post',
    });
  });

  it('sends the page of a video it streams, without a button to the same page', () => {
    for (const url of ['blob:https://example.com/0f2c', undefined]) {
      const message = compose(
        { kind: 'video', note: 'Later', ...(url && { url }), ...page },
        { ...delivery, linkPreview: false }
      );

      expect(message).toEqual({
        kind: 'text',
        text: 'Later\n\nA post\nhttps://example.com/post',
        linkPreview: false,
        silent: true,
      });
    }
  });

  it('says what to do when a streamed video has no page to send', () => {
    expect(() =>
      compose({ kind: 'audio', pageUrl: 'file:///Users/me/a.html' }, delivery)
    ).toThrow(/Save the audio to this device/);
  });

  it('sends an attached file with the message as its caption', () => {
    const photo = { id: 'a', name: 'shot.png', type: 'image/png', size: 2048 };

    expect(
      compose(
        {
          kind: 'page',
          note: 'Look',
          tag: 'ideas',
          attachment: photo,
          ...page,
        },
        delivery
      )
    ).toEqual({
      kind: 'photo',
      attachment: photo,
      caption: 'Look\n\nA post\nhttps://example.com/post\n\n#ideas',
      silent: true,
    });
  });

  it('sends a file alone, with no caption', () => {
    const notes = { id: 'b', name: 'notes.txt', type: 'text/plain', size: 5 };

    expect(compose({ kind: 'page', attachment: notes }, delivery)).toEqual({
      kind: 'document',
      attachment: notes,
      silent: true,
    });
  });

  it('sends GIFs, large photos and photos set to go as files as documents', () => {
    const kindOf = (
      type: string,
      size: number,
      imageMode: typeof delivery.imageMode = 'photo'
    ) =>
      compose(
        { kind: 'page', attachment: { id: 'c', name: 'x', type, size } },
        { ...delivery, imageMode }
      ).kind;

    expect(kindOf('image/jpeg', 1000)).toBe('photo');
    expect(kindOf('image/jpeg', 1000, 'link')).toBe('photo');
    expect(kindOf('image/jpeg', 1000, 'document')).toBe('document');
    expect(kindOf('image/jpeg', 11 * 1024 * 1024)).toBe('document');
    expect(kindOf('image/gif', 1000)).toBe('document');
  });

  it('cuts a long caption to Telegram’s limit', () => {
    const message = compose(
      {
        kind: 'selection',
        text: 'word '.repeat(400),
        attachment: { id: 'd', name: 'x.png', type: 'image/png', size: 1 },
      },
      delivery
    );

    expect(message).toHaveProperty('caption');
    expect('caption' in message && message.caption?.length).toBe(1024);
  });
});

describe('messageText', () => {
  it('joins the note, content and hashtag as compose does', () => {
    expect(
      messageText(
        {
          kind: 'selection',
          text: ' Quoted \n',
          note: 'Read this',
          tag: 'work',
        },
        delivery
      )
    ).toBe('Read this\n\nQuoted\n\n#work');
  });

  it('leads a page with its title when a file goes with it', () => {
    const page = { pageUrl: 'https://a.dev/', pageTitle: 'A' };

    expect(messageText({ kind: 'page', ...page }, delivery)).toBe(
      'https://a.dev/'
    );
    expect(
      messageText(
        {
          kind: 'page',
          ...page,
          attachment: { id: 'f', name: 'f.txt', type: '', size: 1 },
        },
        delivery
      )
    ).toBe('A\nhttps://a.dev/');
  });

  it('reads an image as its address, never clipped', () => {
    const note = 'n'.repeat(5000);

    expect(
      messageText({ kind: 'image', url: 'https://a.dev/x.png', note }, delivery)
    ).toBe(`${note}\n\nhttps://a.dev/x.png`);
  });

  it('reads a video as its address, or as its page when streamed', () => {
    expect(
      messageText(
        { kind: 'video', url: 'https://a.dev/x.mp4', tag: 'film' },
        delivery
      )
    ).toBe('https://a.dev/x.mp4\n\n#film');
    expect(
      messageText(
        { kind: 'video', url: 'blob:https://a.dev/1', ...page },
        delivery
      )
    ).toBe('https://example.com/post');
  });
});

describe('sending again from history', () => {
  const entry = (content: HistoryEntry['content']) =>
    historyEntrySchema.parse({
      id: 'h1',
      sentAt: 1,
      kind: 'video',
      status: 'failed',
      tag: 'film',
      content,
    });

  it('sends a video again from its address', () => {
    const draft = draftFromEntry(
      entry({ url: 'https://cdn.example.com/clip.mp4', ...page })
    );

    expect(draft && compose(draft, delivery)).toMatchObject({
      kind: 'video',
      url: 'https://cdn.example.com/clip.mp4',
      caption: '#film',
    });
  });

  it('sends a streamed video again as its page', () => {
    const draft = draftFromEntry(entry(page));

    expect(draft && compose(draft, delivery)).toEqual({
      kind: 'text',
      text: 'https://example.com/post\n\n#film',
      linkPreview: true,
      silent: true,
    });
  });
});

describe('composing an album', () => {
  const photo = (id: string, size = 3) => ({
    id,
    name: `${id}.png`,
    type: 'image/png',
    size,
  });

  const file = (id: string, type = 'application/pdf') => ({
    id,
    name: `${id}.pdf`,
    type,
    size: 3,
  });

  it('sends one file exactly as before, whichever field holds it', () => {
    const one = compose({ kind: 'page', attachment: photo('a') }, delivery);

    expect(
      compose({ kind: 'page', attachments: [photo('a')] }, delivery)
    ).toEqual(one);
    expect(one).toMatchObject({ kind: 'photo', attachment: photo('a') });
  });

  it('groups photos with photos and files with files, in the order attached', () => {
    const message = compose(
      {
        kind: 'page',
        note: 'Both',
        attachments: [file('a'), photo('b'), file('c'), photo('d')],
      },
      delivery
    );

    expect(message).toEqual({
      kind: 'album',
      silent: true,
      groups: [
        { kind: 'document', attachments: [file('a'), file('c')] },
        {
          kind: 'photo',
          attachments: [photo('b'), photo('d')],
          caption: 'Both',
        },
      ],
    });
  });

  it('sends GIFs, WebP and photos over 10 MB with the files', () => {
    const message = compose(
      {
        kind: 'page',
        attachments: [
          photo('a'),
          file('b', 'image/gif'),
          file('c', 'image/webp'),
          photo('d', 11 * 1024 * 1024),
        ],
      },
      delivery
    );

    expect(message).toMatchObject({
      groups: [
        { kind: 'photo', attachments: [photo('a')] },
        {
          kind: 'document',
          attachments: [
            file('b', 'image/gif'),
            file('c', 'image/webp'),
            photo('d', 11 * 1024 * 1024),
          ],
        },
      ],
    });
  });

  it('sends every image as a file when images go as files', () => {
    const message = compose(
      { kind: 'page', attachments: [photo('a'), photo('b')] },
      { ...delivery, imageMode: 'document' }
    );

    expect(message).toMatchObject({
      groups: [{ kind: 'document', attachments: [photo('a'), photo('b')] }],
    });
  });

  it('puts the page link in the caption, since an album has no button', () => {
    const message = compose(
      {
        kind: 'selection',
        text: 'x'.repeat(2000),
        attachments: [photo('a'), photo('b')],
        ...page,
      },
      delivery
    );

    const caption =
      message.kind === 'album' ? message.groups.at(-1)?.caption : undefined;

    expect(caption).toHaveLength(1024);
    expect(caption?.endsWith('…\n\nhttps://example.com/post')).toBe(true);
    expect(message).not.toHaveProperty('sourceUrl');
  });

  it('refuses more than ten files, saying how many to remove', () => {
    const attachments = Array.from({ length: 12 }, (_, index) =>
      photo(`p${index}`)
    );

    expect(() => compose({ kind: 'page', attachments }, delivery)).toThrow(
      new ComposeError(
        'A message takes up to 10 files. Remove 2, then send again.'
      )
    );
  });
});

describe('album history', () => {
  it('reads entries kept before albums, and albums as sent', () => {
    const before = historyEntrySchema.parse({
      id: 'h1',
      sentAt: 1,
      kind: 'page',
      status: 'sent',
      content: {
        attachment: { id: 'a', name: 'a.png', type: 'image/png', size: 1 },
      },
    });

    expect(before.content?.attachments).toBeUndefined();

    const album = historyEntrySchema.parse({
      id: 'h2',
      sentAt: 1,
      kind: 'page',
      status: 'failed',
      content: {
        attachments: [
          { id: 'a', name: 'a.png', type: 'image/png', size: 1 },
          { id: 'b', name: 'b.png', type: 'image/png', size: 1 },
        ],
        sentAlbum: [{ media: 'photo', file: { id: 'p', uniqueId: 'P' } }],
      },
    });

    expect(draftFromEntry(album)?.attachments).toHaveLength(2);
  });

  it('drops album fields it can’t read, keeping the entry', () => {
    const entry = historyEntrySchema.parse({
      id: 'h3',
      sentAt: 1,
      kind: 'page',
      status: 'sent',
      content: { note: 'Kept', attachments: 'nonsense', sentAlbum: [1] },
    });

    expect(entry.content).toEqual({ note: 'Kept' });
  });
});
