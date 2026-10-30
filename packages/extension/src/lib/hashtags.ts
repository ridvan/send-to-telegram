/** A letter, digit or underscore: what Telegram lets a hashtag hold. */
const TAG_CHAR = /[\p{L}\p{N}_]/u;

/** Telegram links `#word` only where it starts a word, not inside `a#b`. */
const HASHTAG = /(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu;

export type HashtagAtCaret = {
  /** Where the `#` is. */
  start: number;
  /** Just past the word, which can run on after the caret. */
  end: number;
  /** What was typed between the `#` and the caret. */
  query: string;
};

/**
 * The hashtag being typed, when the caret sits in a word that starts with
 * `#` at the start of the text or after whitespace.
 */
export function hashtagAtCaret(
  text: string,
  caret: number
): HashtagAtCaret | undefined {
  let start = caret;

  while (start > 0 && TAG_CHAR.test(text.charAt(start - 1))) start -= 1;

  start -= 1;

  if (start < 0 || text.charAt(start) !== '#') return undefined;

  if (start > 0 && !/\s/u.test(text.charAt(start - 1))) return undefined;

  let end = caret;

  while (end < text.length && TAG_CHAR.test(text.charAt(end))) end += 1;

  return { start, end, query: text.slice(start + 1, caret) };
}

/** Saved hashtags that begin with what was typed, ignoring case. */
export function matchHashtags(tags: string[], query: string) {
  const typed = query.toLocaleLowerCase();

  return tags.filter((tag) => tag.toLocaleLowerCase().startsWith(typed));
}

/** Puts `#tag ` in place of the hashtag being typed and says where the caret goes. */
export function insertHashtag(text: string, at: HashtagAtCaret, tag: string) {
  const after = text.slice(at.end);
  // Reuses a space that's already there, so picking mid-text doesn't double it.
  const spaced = /^\s/u.test(after) ? after : ` ${after}`;
  const before = `${text.slice(0, at.start)}#${tag}`;

  return { text: before + spaced, caret: before.length + 1 };
}

export type NotePart = { text: string; hashtag: boolean };

/** Splits a note into plain text and the hashtags Telegram would link. */
export function splitHashtags(text: string): NotePart[] {
  const parts: NotePart[] = [];
  let end = 0;

  for (const match of text.matchAll(HASHTAG)) {
    if (match.index > end) {
      parts.push({ text: text.slice(end, match.index), hashtag: false });
    }

    parts.push({ text: match[0], hashtag: true });
    end = match.index + match[0].length;
  }

  if (end < text.length) parts.push({ text: text.slice(end), hashtag: false });

  return parts;
}
