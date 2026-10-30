import { describe, expect, it } from 'vitest';

import {
  hashtagAtCaret,
  insertHashtag,
  matchHashtags,
  splitHashtags,
} from './hashtags.ts';

/** Reads `|` in the text as the caret. */
function at(marked: string) {
  const caret = marked.indexOf('|');

  return hashtagAtCaret(marked.replace('|', ''), caret);
}

describe('hashtagAtCaret', () => {
  it('finds a hashtag at the start of the note', () => {
    expect(at('#re|')).toEqual({ start: 0, end: 3, query: 're' });
  });

  it('finds one after a space or a new line', () => {
    expect(at('for later #re|')).toEqual({ start: 10, end: 13, query: 're' });
    expect(at('for later\n#re|')).toEqual({ start: 10, end: 13, query: 're' });
  });

  it('offers everything right after the #', () => {
    expect(at('note #|')).toEqual({ start: 5, end: 6, query: '' });
  });

  it('covers the rest of the word when the caret is inside it', () => {
    expect(at('#re|ading now')).toEqual({ start: 0, end: 8, query: 're' });
  });

  it('takes letters from any script, digits and underscores', () => {
    expect(at('#çalış_2|')).toEqual({ start: 0, end: 8, query: 'çalış_2' });
  });

  it('ignores a # inside a word', () => {
    expect(at('a#b|')).toBeUndefined();
    expect(at('page/#top|')).toBeUndefined();
  });

  it('ignores a caret that has left the word', () => {
    expect(at('#reading |')).toBeUndefined();
    expect(at('|#reading')).toBeUndefined();
    expect(at('plain text|')).toBeUndefined();
  });
});

describe('matchHashtags', () => {
  const tags = ['work', 'reading', 'ideas', 'Recipes'];

  it('matches the start of a tag, ignoring case', () => {
    expect(matchHashtags(tags, 'RE')).toEqual(['reading', 'Recipes']);
  });

  it('offers every tag when nothing is typed yet', () => {
    expect(matchHashtags(tags, '')).toEqual(tags);
  });

  it('doesn’t match the middle of a tag', () => {
    expect(matchHashtags(tags, 'ea')).toEqual([]);
  });
});

describe('insertHashtag', () => {
  it('replaces the typed word and adds a space', () => {
    const text = 'later #re';
    const found = hashtagAtCaret(text, text.length);

    expect(found && insertHashtag(text, found, 'reading')).toEqual({
      text: 'later #reading ',
      caret: 15,
    });
  });

  it('keeps a space that already follows', () => {
    const text = '#re and more';
    const found = hashtagAtCaret(text, 3);

    expect(found && insertHashtag(text, found, 'reading')).toEqual({
      text: '#reading and more',
      caret: 9,
    });
  });
});

describe('splitHashtags', () => {
  it('marks the hashtags Telegram links', () => {
    expect(splitHashtags('Read #later, then #ideas_2')).toEqual([
      { text: 'Read ', hashtag: false },
      { text: '#later', hashtag: true },
      { text: ', then ', hashtag: false },
      { text: '#ideas_2', hashtag: true },
    ]);
  });

  it('leaves a lone # and a # inside a word as text', () => {
    expect(splitHashtags('a#b and # alone')).toEqual([
      { text: 'a#b and # alone', hashtag: false },
    ]);
  });

  it('returns nothing for an empty note', () => {
    expect(splitHashtags('')).toEqual([]);
  });
});
