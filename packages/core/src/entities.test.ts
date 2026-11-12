import { describe, expect, it } from 'vitest';

import {
  entitiesSchema,
  normalizeEntities,
  shiftEntities,
  sliceEntities,
  type TextEntity,
} from './entities.ts';

const bold = (offset: number, length: number): TextEntity => ({
  type: 'bold',
  offset,
  length,
});

describe('sliceEntities', () => {
  it('counts from the slice, cuts entities at its ends and drops empty ones', () => {
    const entities = [bold(0, 4), bold(6, 6), bold(14, 2)];

    expect(sliceEntities(entities, 5, 14)).toEqual([bold(1, 6)]);
    expect(sliceEntities(entities, 2, 8)).toEqual([bold(0, 2), bold(4, 2)]);
  });
});

describe('shiftEntities', () => {
  it('moves entities past what goes before them', () => {
    expect(shiftEntities([bold(0, 3)], 11)).toEqual([bold(11, 3)]);
  });
});

describe('normalizeEntities', () => {
  it('trims whitespace off the ends and drops entities on whitespace alone', () => {
    expect(normalizeEntities(' ab  c ', [bold(0, 4), bold(4, 1)])).toEqual([
      bold(1, 2),
    ]);
  });

  it('keeps a link over code inside it, as docs link function names', () => {
    const text = 'see Array.from now';

    expect(
      normalizeEntities(text, [
        { type: 'text_link', offset: 4, length: 10, url: 'https://a.example/' },
        { type: 'code', offset: 4, length: 10 },
      ])
    ).toEqual([
      { type: 'text_link', offset: 4, length: 10, url: 'https://a.example/' },
    ]);
  });

  it('stops styles where code starts, which Telegram doesn’t format', () => {
    const text = 'call foo() now';

    expect(
      normalizeEntities(text, [
        bold(0, 14),
        { type: 'code', offset: 5, length: 5 },
      ])
    ).toEqual([
      bold(0, 4),
      { type: 'code', offset: 5, length: 5 },
      bold(11, 3),
    ]);
  });

  it('keeps links out of code blocks and blockquotes out of each other', () => {
    const text = 'quote inside quote';

    expect(
      normalizeEntities(text, [
        { type: 'blockquote', offset: 0, length: 18 },
        { type: 'blockquote', offset: 6, length: 6 },
        { type: 'pre', offset: 0, length: 5, language: 'js' },
        { type: 'text_link', offset: 0, length: 5, url: 'https://a.example/' },
      ])
    ).toEqual([
      { type: 'blockquote', offset: 0, length: 18 },
      { type: 'pre', offset: 0, length: 5, language: 'js' },
    ]);
  });

  it('joins touching and nested entities of one style', () => {
    expect(
      normalizeEntities('abcdef', [bold(0, 3), bold(3, 3), bold(1, 1)])
    ).toEqual([bold(0, 6)]);
  });

  it('drops an entity that only partly overlaps another', () => {
    expect(
      normalizeEntities('abcdef', [
        { type: 'text_link', offset: 0, length: 4, url: 'https://a.example/' },
        { type: 'blockquote', offset: 2, length: 4 },
      ])
    ).toEqual([{ type: 'blockquote', offset: 2, length: 4 }]);
  });

  it('drops links without an address and fields other types don’t take', () => {
    expect(
      normalizeEntities('abc', [
        { type: 'text_link', offset: 0, length: 1 },
        { type: 'bold', offset: 1, length: 1, url: 'https://a.example/' },
      ])
    ).toEqual([bold(1, 1)]);
  });

  it('keeps at most the limit, first by position', () => {
    const many = Array.from({ length: 5 }, (_, index) => bold(index * 2, 1));

    expect(normalizeEntities('a a a a a', many, 2)).toEqual([
      bold(0, 1),
      bold(2, 1),
    ]);
  });
});

describe('entitiesSchema', () => {
  it('only takes web links', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://a.example/',
    ]) {
      expect(
        entitiesSchema.safeParse([
          { type: 'text_link', offset: 0, length: 1, url },
        ]).success
      ).toBe(false);
    }
  });

  it('turns down types it doesn’t know', () => {
    expect(
      entitiesSchema.safeParse([{ type: 'spoiler', offset: 0, length: 1 }])
        .success
    ).toBe(false);
  });
});
