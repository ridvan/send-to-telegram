import { describe, expect, it } from 'vitest';

import { textFragmentUrl, withoutTextDirective } from './text-fragment.ts';

const page = 'https://example.com/post';

describe('textFragmentUrl', () => {
  it('quotes a short selection whole', () => {
    expect(textFragmentUrl(page, 'Grid is two-dimensional')).toBe(
      `${page}#:~:text=Grid%20is%20two%2Ddimensional`
    );
  });

  it('percent-encodes commas, ampersands and dashes', () => {
    expect(textFragmentUrl(page, 'cats, dogs & bird-like things')).toBe(
      `${page}#:~:text=cats%2C%20dogs%20%26%20bird%2Dlike%20things`
    );
  });

  it('matches a long selection by words from each end', () => {
    const long =
      'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.';

    expect(textFragmentUrl(page, long)).toBe(
      `${page}#:~:text=One%20two%20three%20four%20five,twelve%20thirteen%20fourteen%20fifteen%20sixteen.`
    );
  });

  it('takes the ends from the first and last paragraph, which a match can’t cross', () => {
    expect(
      textFragmentUrl(page, 'First   line\n\nmiddle\nLast line here')
    ).toBe(`${page}#:~:text=First%20line,Last%20line%20here`);
  });

  it('keeps the page’s own fragment, and replaces an earlier quote', () => {
    expect(textFragmentUrl(`${page}#intro`, 'some words')).toBe(
      `${page}#intro:~:text=some%20words`
    );
    expect(textFragmentUrl(`${page}#intro:~:text=old`, 'some words')).toBe(
      `${page}#intro:~:text=some%20words`
    );
  });

  it('encodes emoji and non-Latin text', () => {
    expect(textFragmentUrl(page, 'Привет 👋')).toBe(
      `${page}#:~:text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%F0%9F%91%8B`
    );
  });

  it('skips pages that aren’t on the web, short quotes and ones it can’t cut', () => {
    expect(textFragmentUrl('file:///notes.html', 'some words')).toBeUndefined();
    expect(textFragmentUrl('chrome://settings', 'some words')).toBeUndefined();
    expect(textFragmentUrl(page, ' a. ')).toBeUndefined();
    expect(textFragmentUrl(page, '— · —')).toBeUndefined();
    expect(textFragmentUrl(page, 'broken \ud83d text')).toBeUndefined();
    // One long run of letters can't be cut on a word boundary.
    expect(textFragmentUrl(page, `${'x'.repeat(100)}\nend`)).toBeUndefined();
  });

  it('gives up when the quote would make the link too long', () => {
    expect(textFragmentUrl(page, '日本語'.repeat(30))).toBeUndefined();
  });
});

describe('withoutTextDirective', () => {
  it('takes the quote off, keeping the rest of the URL', () => {
    expect(withoutTextDirective(`${page}#:~:text=a`)).toBe(page);
    expect(withoutTextDirective(`${page}#top:~:text=a`)).toBe(`${page}#top`);
    expect(withoutTextDirective(`${page}?q=:~:`)).toBe(`${page}?q=:~:`);
  });
});
