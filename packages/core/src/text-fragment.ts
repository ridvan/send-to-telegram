/** Starts the part of a fragment the browser reads and the page never sees. */
const DIRECTIVE = ':~:';

/** A quote shorter than this, in letters and digits, matches too much of a page. */
const MIN_LETTERS = 3;

/** Quoted whole up to this many characters; longer ones by their ends. */
const EXACT_LIMIT = 80;

/** Words taken from each end of a long quote. */
const END_WORDS = 5;

/** A word longer than this can't be cut to fit, so it isn't matched by its ends. */
const LONG_WORD = 30;

/**
 * Telegram's apps show this URL when asked to open it, and button URLs have
 * an undocumented limit; past this the plain page link goes instead.
 */
const MAX_DIRECTIVE = 512;

/** The longest URL a link in a message is given. */
const MAX_URL = 2048;

/** Percent-encodes as the Text Fragments spec asks: `-`, `,` and `&` too. */
function encode(text: string): string {
  return encodeURIComponent(text).replaceAll('-', '%2D');
}

/** The URL without a text fragment, keeping any fragment the page had. */
export function withoutTextDirective(url: string): string {
  const at = url.indexOf(DIRECTIVE, url.indexOf('#'));

  if (url.indexOf('#') < 0 || at < 0) return url;

  const plain = url.slice(0, at);

  return plain.endsWith('#') ? plain.slice(0, -1) : plain;
}

/**
 * The text a browser matches: one block at a time, since a match can't cross
 * from one paragraph or table cell into the next, with spaces collapsed.
 */
function blocksOf(selection: string): string[] {
  return selection
    .split(/[\n\t\r]/)
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The first or last words of a block, or none when it has one long word. */
function wordsAt(block: string, from: 'start' | 'end'): string | undefined {
  const words = block.split(' ');

  const taken =
    from === 'start' ? words.slice(0, END_WORDS) : words.slice(-END_WORDS);

  // A match must start and end on a word boundary, so a word isn't cut.
  if (taken.length === 1 && [...block].length > LONG_WORD) return undefined;

  return taken.join(' ');
}

/** `text=` and its value, or none when the quote can't be matched reliably. */
function textDirective(selection: string): string | undefined {
  const blocks = blocksOf(selection);
  const first = blocks[0];
  const last = blocks.at(-1);

  if (!first || !last) return undefined;

  const letters = blocks.join('').match(/[\p{L}\p{N}]/gu)?.length ?? 0;

  if (letters < MIN_LETTERS) return undefined;

  const oneBlock = blocks.length === 1;
  const words = first.split(' ').length;

  if (oneBlock && ([...first].length <= EXACT_LIMIT || words < END_WORDS * 2)) {
    return `text=${encode(first)}`;
  }

  const start = wordsAt(first, 'start');
  const stop = wordsAt(last, 'end');

  if (!start || !stop) return undefined;

  return `text=${encode(start)},${encode(stop)}`;
}

/**
 * The page's URL with a text fragment that scrolls to the quote and marks it,
 * in browsers that support them; others ignore it and open the page. Only
 * web pages take one. A long quote is matched by a few words from each end,
 * `textStart,textEnd`. An existing fragment stays, before the directive.
 */
export function textFragmentUrl(
  pageUrl: string,
  selection: string
): string | undefined {
  if (!URL.canParse(pageUrl)) return undefined;

  if (!/^https?:$/.test(new URL(pageUrl).protocol)) return undefined;

  // A lone surrogate can't be percent-encoded, or matched.
  if (!selection.isWellFormed()) return undefined;

  const directive = textDirective(selection);

  if (!directive || directive.length > MAX_DIRECTIVE) return undefined;

  const base = withoutTextDirective(pageUrl);
  const hash = base.includes('#') ? '' : '#';

  const url = `${base}${hash}${DIRECTIVE}${directive}`;

  // Kept to what a link in a message may carry, as `textEntitySchema` checks.
  return url.length <= MAX_URL ? url : undefined;
}
