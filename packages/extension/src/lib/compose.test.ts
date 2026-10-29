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
});
