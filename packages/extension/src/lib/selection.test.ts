import { describe, expect, it } from 'vitest';

import {
  entitiesFromMarkup,
  type Mark,
  selectedOf,
  type SelectionMarkup,
} from './selection.ts';

const link: Mark = { type: 'text_link', url: 'https://example.com/guide' };

/** Markup as the page reads it: runs of text and the marks around each. */
function markup(
  text: string,
  runs: [string, ...number[]][],
  marks: Mark[]
): SelectionMarkup {
  return {
    text,
    runs: runs.map(([run, ...ids]) => ({ text: run, marks: ids })),
    marks,
  };
}

describe('entitiesFromMarkup', () => {
  it('finds each element’s text in the copied text', () => {
    const read = markup(
      'Grid is bold. See the guide.',
      [['Grid', 0], [' is '], ['bold', 1], ['. See '], ['the guide', 2], ['.']],
      [{ type: 'italic' }, { type: 'bold' }, link]
    );

    expect(entitiesFromMarkup(read, 1000)).toEqual([
      { type: 'italic', offset: 0, length: 4 },
      { type: 'bold', offset: 8, length: 4 },
      { type: 'text_link', offset: 18, length: 9, url: link.url },
    ]);
  });

  it('spans an element across the line breaks the browser adds', () => {
    // A quote of two paragraphs: `toString()` puts a blank line between them.
    const read = markup(
      'Intro\n\nFirst para\n\nSecond para',
      [['Intro'], ['\n  First para  ', 0], ['\n', 0], ['Second para', 0]],
      [{ type: 'blockquote' }]
    );

    expect(entitiesFromMarkup(read, 1000)).toEqual([
      { type: 'blockquote', offset: 7, length: 23 },
    ]);
  });

  it('skips text the browser hides and matches the rest', () => {
    const read = markup(
      'Price 10 USD today',
      [['Price '], ['(hidden note)'], ['10', 0], [' USD today']],
      [{ type: 'bold' }]
    );

    expect(entitiesFromMarkup(read, 1000)).toEqual([
      { type: 'bold', offset: 6, length: 2 },
    ]);
  });

  it('carries on past text only the copy has, like a list number', () => {
    const read = markup(
      '1. Item one',
      [
        ['Item ', 0],
        ['one', 0],
      ],
      [{ type: 'italic' }]
    );

    expect(entitiesFromMarkup(read, 1000)).toEqual([
      { type: 'italic', offset: 3, length: 8 },
    ]);
  });

  it('matches text the page shows in another case', () => {
    const read = markup('READ THIS', [['Read this', 0]], [{ type: 'bold' }]);

    expect(entitiesFromMarkup(read, 1000)).toEqual([
      { type: 'bold', offset: 0, length: 9 },
    ]);
  });

  it('counts emoji and non-Latin text in UTF-16 code units', () => {
    const text = 'Привет 👋🏽 мир';
    const read = markup(text, [['Привет 👋🏽 '], ['мир', 0]], [{ type: 'bold' }]);
    const [entity] = entitiesFromMarkup(read, 1000);

    expect(
      entity && text.slice(entity.offset, entity.offset + entity.length)
    ).toBe('мир');
  });

  it('drops links that aren’t to the web, keeping their text', () => {
    const read = markup(
      'run me',
      [['run', 0], [' '], ['me', 1]],
      [
        { type: 'text_link', url: 'javascript:alert(1)' },
        { type: 'text_link', url: 'data:text/html,hi' },
      ]
    );

    expect(entitiesFromMarkup(read, 1000)).toEqual([]);
  });

  it('keeps formatting within the length sent', () => {
    const read = markup(
      'aaaa bbbb',
      [['aaaa', 0], [' '], ['bbbb', 1]],
      [{ type: 'bold' }, { type: 'italic' }]
    );

    expect(entitiesFromMarkup(read, 6)).toEqual([
      { type: 'bold', offset: 0, length: 4 },
      { type: 'italic', offset: 5, length: 1 },
    ]);
  });

  it('keeps the language of a code block', () => {
    const read = markup(
      'const a = 1;',
      [['const a = 1;', 0, 1]],
      [{ type: 'code' }, { type: 'pre', language: 'js' }]
    );

    expect(entitiesFromMarkup(read, 1000)).toEqual([
      { type: 'pre', offset: 0, length: 12, language: 'js' },
    ]);
  });
});

describe('selectedOf', () => {
  it('trims the text as it’s sent and moves the entities to match', () => {
    const read = markup(
      '\n  bold move \n',
      [['\n  '], ['bold', 0], [' move \n']],
      [{ type: 'bold' }]
    );

    expect(selectedOf(read, 1000)).toEqual({
      text: 'bold move',
      entities: [{ type: 'bold', offset: 0, length: 4 }],
    });
  });

  it('leaves entities out of plain text, and nothing for an empty selection', () => {
    expect(selectedOf(markup('plain', [['plain']], []), 1000)).toEqual({
      text: 'plain',
    });
    expect(selectedOf(markup('  ', [], []), 1000)).toBeUndefined();
  });
});

describe('entitiesFromMarkup, when text nodes don’t match', () => {
  it('finds its place again after a long run the copy changed', () => {
    // `text-transform: uppercase` turns `ß` into `SS`, so that run can't match.
    const shouted = 'straße und ıslak '.repeat(3);
    const text = `${shouted.toUpperCase().replaceAll('ß', 'SS')}then bold`;

    const read = markup(
      text,
      [[shouted], ['then '], ['bold', 0]],
      [{ type: 'bold' }]
    );

    const [entity] = entitiesFromMarkup(read, 1000);

    expect(
      entity && text.slice(entity.offset, entity.offset + entity.length)
    ).toBe('bold');
  });

  it('matches dotless i that the page uppercased', () => {
    const read = markup('ISLAK', [['ıslak', 0]], [{ type: 'italic' }]);

    expect(entitiesFromMarkup(read, 1000)).toEqual([
      { type: 'italic', offset: 0, length: 5 },
    ]);
  });
});
