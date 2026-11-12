import {
  formatTypeSchema,
  MAX_ENTITIES,
  normalizeEntities,
  sliceEntities,
  type TextEntity,
  textEntitySchema,
} from '@send-to-telegram/core';
import { z } from 'zod';

const markSchema = z.object({
  type: formatTypeSchema,
  url: z.string().optional(),
  language: z.string().optional(),
});

/** A format an element of the page gives the text in it. */
export type Mark = z.infer<typeof markSchema>;

export const selectionMarkupSchema = z.object({
  /** The selection as the browser copies it, which is what's sent. */
  text: z.string(),
  /** Each selected text node's text, and the marks of the elements around it. */
  runs: z.array(z.object({ text: z.string(), marks: z.array(z.number()) })),
  /** One per element, so two bold words side by side stay two. */
  marks: z.array(markSchema),
});

export type SelectionMarkup = z.infer<typeof selectionMarkupSchema>;

/**
 * Runs in the page: reads the selection's text as `toString()` gives it, and
 * the formatting of the text nodes in it from the elements around them, up
 * to the page's root, so a selection inside one link is that link. It reads
 * the DOM only: no page script runs and nothing is fetched. It's injected on
 * its own, so everything it uses is inside it. A huge selection stops being
 * read for formatting once its text is long enough; it still sends whole.
 */
export function readSelectionMarkup(maxLength: number): SelectionMarkup | null {
  // Past this many text nodes, the rest of a selection goes unformatted.
  const MAX_NODES = 5000;
  // Nodes looked at to find the selection's start, in a huge element.
  const MAX_VISITS = 50_000;

  const selection = globalThis.getSelection();

  if (!selection) return null;

  const text = selection.toString();

  // Several ranges, as Firefox makes for table cells, go as plain text.
  if (selection.rangeCount !== 1 || !text.trim()) {
    return { text, runs: [], marks: [] };
  }

  const range = selection.getRangeAt(0);
  const marks: Mark[] = [];
  const markOf = new Map<Element, number | undefined>();
  const visible = new Map<Element, boolean>();
  const runs: SelectionMarkup['runs'] = [];

  function markFor(element: Element): Mark | undefined {
    switch (element.localName) {
      case 'b':
      case 'strong':
        return { type: 'bold' };
      case 'i':
      case 'em':
        return { type: 'italic' };
      case 'u':
      case 'ins':
        return { type: 'underline' };
      case 's':
      case 'strike':
      case 'del':
        return { type: 'strikethrough' };
      case 'code':
      case 'kbd':
      case 'samp':
      case 'tt':
        return { type: 'code' };
      case 'blockquote':
        return { type: 'blockquote' };
      case 'pre': {
        // Highlighters mark the language as `language-x` on the block or its code.
        const named = [element, ...element.querySelectorAll(':scope > code')]
          // A longer name isn't one Telegram takes; the block goes without it.
          .map((each) =>
            /\b(?:language|lang)-([\w#+.-]{1,32})(?![\w#+.-])/.exec(
              each.className
            )
          )
          .find(Boolean)?.[1];

        return { type: 'pre', ...(named && { language: named.toLowerCase() }) };
      }

      case 'a':
        // `href` is already resolved against the page; only web links go.
        return element instanceof HTMLAnchorElement &&
          /^https?:$/.test(element.protocol)
          ? { type: 'text_link', url: element.href }
          : undefined;
      default:
        return undefined;
    }
  }

  function markIdOf(element: Element): number | undefined {
    if (markOf.has(element)) return markOf.get(element);

    const mark = markFor(element);
    const id = mark ? marks.push(mark) - 1 : undefined;

    markOf.set(element, id);

    return id;
  }

  // Text the browser doesn't show isn't in `toString()`, so it isn't matched.
  function shown(element: Element): boolean {
    const known = visible.get(element);

    if (known !== undefined) return known;

    // `display: contents` has no box of its own, yet its text shows.
    const result =
      element.checkVisibility() ||
      (getComputedStyle(element).display === 'contents' &&
        element.parentElement !== null &&
        shown(element.parentElement));

    visible.set(element, result);

    return result;
  }

  const root = range.commonAncestorContainer;

  const walker = document.createTreeWalker(
    root.nodeType === Node.TEXT_NODE ? (root.parentNode ?? root) : root,
    NodeFilter.SHOW_TEXT
  );

  walker.currentNode = range.startContainer;

  let node: Node | null =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer
      : walker.nextNode();

  let visits = 0;
  let length = 0;

  while (node && runs.length < MAX_NODES && visits < MAX_VISITS) {
    visits++;

    const data = node.nodeValue ?? '';

    // Past the end of the selection: done.
    if (range.comparePoint(node, 0) > 0) break;

    const parent = node.parentElement;

    if (parent && range.comparePoint(node, data.length) >= 0 && shown(parent)) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : data.length;
      const ids: number[] = [];

      for (let at: Element | null = parent; at; at = at.parentElement) {
        const id = markIdOf(at);

        if (id !== undefined) ids.push(id);
      }

      runs.push({ text: data.slice(start, end), marks: ids });
      length += end - start;

      if (length > maxLength * 2) break;
    }

    node = walker.nextNode();
  }

  return { text, runs, marks };
}

/** How far ahead a text node may start, past text only `toString()` has. */
const RESYNC = 32;

/** How far ahead to look at most, after text nodes that didn't match. */
const MAX_RESYNC = 2000;

const isSpace = (char: string) => /\s/.test(char);

// Both ways, as `text-transform` maps `ı` to `I`, which lowercases to `i`.
const sameChar = (a: string, b: string) =>
  a === b ||
  a.toLowerCase() === b.toLowerCase() ||
  a.toUpperCase() === b.toUpperCase();

/**
 * Where a text node's characters fall in the copied text, from `at`: the
 * first and past the last. Whitespace may differ, since the browser
 * collapses it and adds line breaks; case may too, for `text-transform`.
 */
function matchRun(
  run: string,
  text: string,
  at: number
): { first: number; end: number } | undefined {
  let cursor = at;
  let first = -1;

  for (const char of run) {
    if (isSpace(char)) continue;

    while (cursor < text.length && isSpace(text.charAt(cursor))) cursor++;

    // `for…of` walks code points; compare them whole.
    if (!sameChar(char, text.slice(cursor, cursor + char.length))) {
      return undefined;
    }

    if (first < 0) first = cursor;
    cursor += char.length;
  }

  return first < 0 ? undefined : { first, end: cursor };
}

/**
 * Turns what the page read into entities over the copied text. Text nodes
 * are matched to it in order; one that doesn't match, like text the browser
 * hides, is skipped and loses its formatting, and the rest still match.
 * Each element's entity runs from its first matched character to its last.
 */
export function entitiesFromMarkup(
  markup: SelectionMarkup,
  maxLength: number
): TextEntity[] {
  const { text } = markup;
  const spans = new Map<number, { start: number; end: number }>();
  let cursor = 0;
  // Grows past text nodes that didn't match, which may be in the copy yet.
  let reach = RESYNC;

  for (const run of markup.runs) {
    const head = [...run.text].find((char) => !isSpace(char));

    if (!head) continue;

    let found = matchRun(run.text, text, cursor);

    for (let at = cursor + 1; !found && at <= cursor + reach; at++) {
      if (sameChar(head, text.slice(at, at + head.length))) {
        found = matchRun(run.text, text, at);
      }
    }

    if (!found) {
      reach = Math.min(MAX_RESYNC, reach + run.text.length);
      continue;
    }

    cursor = found.end;
    reach = RESYNC;

    for (const id of run.marks) {
      const span = spans.get(id);

      spans.set(id, {
        start: Math.min(span?.start ?? found.first, found.first),
        end: Math.max(span?.end ?? found.end, found.end),
      });
    }
  }

  const entities = [...spans].flatMap(([id, span]) => {
    const parsed = textEntitySchema.safeParse({
      ...markup.marks[id],
      offset: span.start,
      length: span.end - span.start,
    });

    return parsed.success ? [parsed.data] : [];
  });

  return normalizeEntities(
    text,
    sliceEntities(entities, 0, Math.min(text.length, maxLength)),
    MAX_ENTITIES
  );
}

/** A selection to send, and the formatting it had on the page. */
export type Selected = { text: string; entities?: TextEntity[] };

/** The copied text trimmed, as it's sent, with its entities moved to match. */
export function selectedOf(
  markup: SelectionMarkup,
  maxLength: number
): Selected | undefined {
  const text = markup.text.trim();

  if (!text) return undefined;

  const lead = markup.text.length - markup.text.trimStart().length;

  const entities = sliceEntities(
    entitiesFromMarkup(markup, maxLength),
    lead,
    lead + text.length
  );

  return { text, ...(entities.length > 0 && { entities }) };
}
