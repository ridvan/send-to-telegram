import { z } from 'zod';

/**
 * The formatting a selection keeps. Telegram takes more types, but these are
 * the ones a page's markup maps onto.
 */
export const formatTypeSchema = z.enum([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'pre',
  'text_link',
  'blockquote',
]);

export type FormatType = z.infer<typeof formatTypeSchema>;

/**
 * Part of a message's text with a format, as Telegram's `MessageEntity`
 * takes it. Offsets count UTF-16 code units, as JavaScript strings do.
 */
export const textEntitySchema = z.object({
  type: formatTypeSchema,
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  /** Where a `text_link` goes; only web links, never `javascript:` or `data:`. */
  url: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional(),
  /** A `pre` block's programming language, for highlighting. */
  language: z
    .string()
    .regex(/^[\w#+.-]{1,32}$/)
    .optional(),
});

export type TextEntity = z.infer<typeof textEntitySchema>;

/**
 * The most entities one message carries. The Bot API docs give no limit;
 * 100 is the one commonly reported, unconfirmed, so no more go in one.
 */
export const MAX_ENTITIES_PER_MESSAGE = 100;

/** A selection's formatting, for every message it's split into. */
export const MAX_ENTITIES = MAX_ENTITIES_PER_MESSAGE * 8;

export const entitiesSchema = z.array(textEntitySchema).max(MAX_ENTITIES);

const end = (entity: TextEntity) => entity.offset + entity.length;

/** Moves entities along by `by` code units, as when text goes before them. */
export function shiftEntities(
  entities: readonly TextEntity[],
  by: number
): TextEntity[] {
  return entities.map((entity) => ({ ...entity, offset: entity.offset + by }));
}

/**
 * The entities within `start` to `end` of the text, counted from `start`.
 * One that runs past either end is cut there; one left empty is dropped.
 */
export function sliceEntities(
  entities: readonly TextEntity[],
  start: number,
  stop: number
): TextEntity[] {
  return entities.flatMap((entity) => {
    const from = Math.max(entity.offset, start);
    const to = Math.min(end(entity), stop);

    if (to <= from) return [];

    return [{ ...entity, offset: from - start, length: to - from }];
  });
}

const contains = (outer: TextEntity, inner: TextEntity) =>
  outer.offset <= inner.offset && end(inner) <= end(outer);

const overlaps = (a: TextEntity, b: TextEntity) =>
  a.offset < end(b) && b.offset < end(a);

const STYLES = new Set<FormatType>([
  'bold',
  'italic',
  'underline',
  'strikethrough',
]);

/** Outermost first, so a wrapping entity is kept over what it wraps. */
const byPosition = (a: TextEntity, b: TextEntity) =>
  a.offset - b.offset || b.length - a.length;

/** Keeps the entities of `type` that overlap nothing in `kept` or of their own. */
function keepApart(
  entities: readonly TextEntity[],
  type: FormatType,
  kept: readonly TextEntity[]
): TextEntity[] {
  const chosen: TextEntity[] = [];

  for (const entity of entities.filter((each) => each.type === type)) {
    if ([...kept, ...chosen].some((other) => overlaps(entity, other))) continue;

    chosen.push(entity);
  }

  return chosen;
}

/** A style's parts outside code, which Telegram doesn't format inside. */
function outside(entity: TextEntity, holes: readonly TextEntity[]) {
  let pieces = [entity];

  for (const hole of holes) {
    pieces = pieces.flatMap((piece) => {
      if (!overlaps(piece, hole)) return [piece];

      return [
        { ...piece, length: hole.offset - piece.offset },
        { ...piece, offset: end(hole), length: end(piece) - end(hole) },
      ].filter((part) => part.length > 0);
    });
  }

  return pieces;
}

/** Joins a type's overlapping or touching entities into one. */
function merged(entities: readonly TextEntity[]): TextEntity[] {
  const joined: TextEntity[] = [];

  for (const entity of entities.toSorted(byPosition)) {
    const last = joined.at(-1);

    if (last && entity.offset <= end(last)) {
      last.length = Math.max(end(last), end(entity)) - last.offset;
    } else {
      joined.push({ ...entity });
    }
  }

  return joined;
}

/**
 * Entities as Telegram accepts them. Its rules: two entities that share text
 * nest, one wholly in the other; bold, italic, underline and strikethrough
 * go inside or around anything but code; blockquotes don't nest; nothing
 * else contains another. Where a page breaks them, a link wins over code
 * inside it (docs often link a function's name), a code block over links in
 * it, and styles stop where code starts. Links, code and blocks may sit in a
 * quote, as quoted passages have them; the docs leave that unclear, and a
 * send Telegram turns down goes again as plain text.
 */
export function normalizeEntities(
  text: string,
  entities: readonly TextEntity[],
  limit = MAX_ENTITIES
): TextEntity[] {
  const blank = (index: number) => /\s/.test(text.charAt(index));

  const tidied = (list: readonly TextEntity[]) =>
    list.flatMap((entity): TextEntity[] => {
      let from = Math.max(0, entity.offset);
      let to = Math.min(text.length, end(entity));

      while (from < to && blank(from)) from++;

      while (to > from && blank(to - 1)) to--;

      if (to <= from) return [];

      if (entity.type === 'text_link' && !entity.url) return [];

      return [
        {
          type: entity.type,
          offset: from,
          length: to - from,
          ...(entity.type === 'text_link' && { url: entity.url }),
          ...(entity.type === 'pre' &&
            entity.language && { language: entity.language }),
        },
      ];
    });

  const sorted = tidied(entities).toSorted(byPosition);
  const quotes = keepApart(sorted, 'blockquote', []);
  const blocks = keepApart(sorted, 'pre', []);
  const links = keepApart(sorted, 'text_link', blocks);
  const code = keepApart(sorted, 'code', [...blocks, ...links]);
  const holes = [...blocks, ...code];

  const styles = [...STYLES].flatMap((type) =>
    merged(
      sorted
        .filter((entity) => entity.type === type)
        .flatMap((entity) => tidied(outside(entity, holes)))
    )
  );

  // Whatever still only partly overlaps another is dropped, quotes first kept.
  const kept: TextEntity[] = [];

  for (const entity of [...quotes, ...blocks, ...links, ...code, ...styles]) {
    const crosses = kept.some(
      (other) =>
        overlaps(entity, other) &&
        !contains(entity, other) &&
        !contains(other, entity)
    );

    if (!crosses) kept.push(entity);
  }

  return kept.toSorted(byPosition).slice(0, limit);
}
