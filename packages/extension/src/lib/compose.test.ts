import { describe, expect, it } from 'vitest';

import { compose, ComposeError } from './compose.ts';
import { defaultSettings } from './settings.ts';

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
