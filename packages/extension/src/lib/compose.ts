import {
  ALBUM_LIMIT,
  CAPTION_LIMIT,
  entitiesSchema,
  MAX_TEXT_LENGTH,
  type OutgoingMessage,
  PHOTO_UPLOAD_LIMIT,
  shiftEntities,
  sliceEntities,
  type TextEntity,
  textFragmentUrl,
  type UploadMessage,
} from '@send-to-telegram/core';
import { z } from 'zod';

import {
  type Attachment,
  attachmentSchema,
  contentKindSchema,
  type Settings,
  tagSchema,
} from './settings.ts';

/** What the person chose to send, before settings turn it into a Telegram message. */
export const draftSchema = z.object({
  kind: contentKindSchema,
  pageUrl: z.string().optional(),
  pageTitle: z.string().optional(),
  /** Selected text. */
  text: z.string().optional(),
  /**
   * The selection's formatting on the page, over `text`. Added later, so
   * drafts without it read as before; one this version can't read is dropped.
   */
  entities: entitiesSchema.optional().catch(undefined),
  /** The link target, or the image, video or audio source. */
  url: z.string().optional(),
  note: z.string().optional(),
  tag: tagSchema.optional(),
  /** A file from this device; the message's text becomes its caption. */
  attachment: attachmentSchema.optional(),
  /**
   * Two or more files, sent as an album, in place of `attachment`: one file
   * is always `attachment`, so a single file sends as it always has.
   */
  attachments: z.array(attachmentSchema).max(ALBUM_LIMIT).optional(),
  destinationId: z.string().optional(),
});

export type Draft = z.infer<typeof draftSchema>;

/** The most files one message takes, as an album. */
export const MAX_ATTACHMENTS = ALBUM_LIMIT;

/** Every file the draft carries, one or an album's. */
export function draftFiles(
  draft: Pick<Draft, 'attachment' | 'attachments'>
): Attachment[] {
  if (draft.attachments) return draft.attachments;

  return draft.attachment ? [draft.attachment] : [];
}

/** The fields that carry these files: `attachment` for one, `attachments` for more. */
export function filesFields(
  files: Attachment[]
): Pick<Draft, 'attachment' | 'attachments'> {
  const [only] = files;

  if (files.length > 1) return { attachments: files };

  return only ? { attachment: only } : {};
}

/** The draft with other files, or none. */
export function withFiles(draft: Draft, files: Attachment[]): Draft {
  const { attachment: _one, attachments: _many, ...rest } = draft;

  return { ...rest, ...filesFields(files) };
}

export class ComposeError extends Error {
  override name = 'ComposeError';
}

export function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;

  return URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);
}

function extension(url: string): string {
  const path = new URL(url).pathname.toLowerCase();

  return path.slice(path.lastIndexOf('.') + 1);
}

function paragraphs(...parts: (string | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n\n');
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Text and its formatting, as entities over it. */
export type Formatted = { text: string; entities: TextEntity[] };

/**
 * Joins paragraphs as `paragraphs` does, moving each one's entities to
 * where it lands: past the note, for a selection after one.
 */
function formattedParagraphs(...parts: (Formatted | undefined)[]): Formatted {
  let text = '';
  const entities: TextEntity[] = [];

  for (const part of parts) {
    const trimmed = part?.text.trim();

    if (!part || !trimmed) continue;

    const lead = part.text.length - part.text.trimStart().length;

    if (text) text += '\n\n';

    entities.push(
      ...shiftEntities(
        sliceEntities(part.entities, lead, lead + trimmed.length),
        text.length
      )
    );
    text += trimmed;
  }

  return { text, entities };
}

/** Text with no formatting, such as a note or a hashtag. */
function plain(text: string | undefined): Formatted | undefined {
  return text === undefined ? undefined : { text, entities: [] };
}

/** Clips like `clip`; entities past the cut are cut there or dropped. */
function clipFormatted(
  { text, entities }: Formatted,
  limit: number
): Formatted {
  if (text.length <= limit) return { text, entities };

  return {
    text: clip(text, limit),
    entities: sliceEntities(entities, 0, limit - 1),
  };
}

/**
 * A video or song Telegram can't fetch, because the page streams it (a
 * `blob:` source) or keeps it out of reach, goes as its page instead: on
 * streaming sites the page's preview plays it.
 */
export function sendsPageInstead(draft: Pick<Draft, 'kind' | 'url'>): boolean {
  return (
    (draft.kind === 'video' || draft.kind === 'audio') && !isHttpUrl(draft.url)
  );
}

/** The draft as it goes out, so video and audio sent as their page read as one. */
function asSent(draft: Draft): Draft {
  return sendsPageInstead(draft) ? { ...draft, kind: 'page' } : draft;
}

/** Types Telegram shows as photos; others, GIFs and WebP included, go as files. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png']);

export function sendsAsPhoto(
  attachment: Pick<Attachment, 'type' | 'size'>,
  imageMode: Settings['delivery']['imageMode']
): boolean {
  return (
    imageMode !== 'document' &&
    PHOTO_TYPES.has(attachment.type) &&
    attachment.size <= PHOTO_UPLOAD_LIMIT
  );
}

/** An upload waiting for its file, which the background reads by `attachment.id`. */
export type ComposedUpload = Omit<UploadMessage, 'upload'> & {
  attachment: Attachment;
};

/** Files that go out together: an album, or one file sent alone. */
export type AlbumGroup = {
  kind: 'photo' | 'document';
  attachments: Attachment[];
  caption?: string;
  captionEntities?: TextEntity[];
};

/**
 * Several files, sent as one album when Telegram allows it. Telegram groups
 * files only with files, so photos and files go as two albums, each in the
 * order attached; the caption goes with the last.
 */
export type ComposedAlbum = {
  kind: 'album';
  groups: AlbumGroup[];
  silent: boolean;
};

/**
 * Splits files into what goes as photos and what goes as files, ordered by
 * the first file of each. Anything `sendsAsPhoto` turns down, GIFs, WebP and
 * photos over Telegram's 10 MB, goes with the files, as it would alone.
 */
export function albumGroups<File extends Pick<Attachment, 'type' | 'size'>>(
  files: File[],
  imageMode: Settings['delivery']['imageMode']
): { kind: AlbumGroup['kind']; attachments: File[] }[] {
  const groups: { kind: AlbumGroup['kind']; attachments: File[] }[] = [];

  for (const file of files) {
    const kind = sendsAsPhoto(file, imageMode) ? 'photo' : 'document';
    const group = groups.find((each) => each.kind === kind);

    if (group) group.attachments.push(file);
    else groups.push({ kind, attachments: [file] });
  }

  return groups;
}

/**
 * The text that goes with a page or selection. A caption has no link preview,
 * so an attached file always takes the page title with the link.
 */
function bodyOf(draft: Draft, delivery: Settings['delivery']) {
  switch (draft.kind) {
    case 'selection':
      return draft.text?.trim();
    case 'link':
      return draft.url;
    case 'page':
      // Without a preview the URL alone says little, so lead with the title.
      return (delivery.linkPreview && draftFiles(draft).length === 0) ||
        !draft.pageTitle
        ? draft.pageUrl
        : `${draft.pageTitle.trim()}\n${draft.pageUrl}`;
    case 'image':
    case 'video':
    case 'audio':
      return undefined;
  }
}

/** A selection's text with its formatting; other content is plain. */
function formattedBody(
  draft: Draft,
  delivery: Settings['delivery']
): Formatted | undefined {
  if (draft.kind === 'selection' && draft.text) {
    return { text: draft.text, entities: draft.entities ?? [] };
  }

  return plain(bodyOf(draft, delivery));
}

/**
 * The page's URL with a text fragment for a selection, so opening it scrolls
 * to the quote and marks it. History keeps the plain URL.
 */
export function quoteUrl(
  draft: Pick<Draft, 'kind' | 'text' | 'pageUrl'>
): string | undefined {
  if (draft.kind !== 'selection' || !draft.text || !draft.pageUrl) {
    return undefined;
  }

  return textFragmentUrl(draft.pageUrl, draft.text);
}

/**
 * The message's text as it reads in Telegram, unclipped: the note, then the
 * content, then the hashtag. Media sent from its address reads as that address.
 */
export function messageText(
  sourceDraft: Draft,
  delivery: Settings['delivery']
): string {
  const draft = asSent(sourceDraft);
  const tag = draft.tag ? `#${draft.tag}` : undefined;
  const body = bodyOf(draft, delivery) ?? draft.url;

  return paragraphs(draft.note, body, tag);
}

/**
 * An album's caption. `sendMediaGroup` takes no button, so the page it came
 * from goes as a link on the caption's last line, kept whole when the rest is
 * cut to fit.
 */
function albumCaption(
  content: Formatted,
  sourceUrl: string | undefined,
  /** Where the link goes for a selection: to the quote on the page. */
  quote: string | undefined
): Formatted {
  const link = sourceUrl && sourceUrl.length + 2 < CAPTION_LIMIT && sourceUrl;

  if (!link) return clipFormatted(content, CAPTION_LIMIT);

  const caption = formattedParagraphs(
    clipFormatted(content, CAPTION_LIMIT - link.length - 2),
    plain(link)
  );

  // It reads as the page's address; the fragment would only fill the caption.
  if (!quote) return caption;

  return {
    text: caption.text,
    entities: [
      ...caption.entities,
      {
        type: 'text_link',
        offset: caption.text.length - link.length,
        length: link.length,
        url: quote,
      },
    ],
  };
}

/** Turns a draft into one outgoing message, following the delivery settings. */
export function compose(
  sourceDraft: Draft,
  delivery: Settings['delivery']
): OutgoingMessage | ComposedUpload | ComposedAlbum {
  if (sendsPageInstead(sourceDraft) && !isHttpUrl(sourceDraft.pageUrl)) {
    throw new ComposeError(
      `Telegram can’t fetch this ${sourceDraft.kind}, and the page has no web address to send instead. Save the ${sourceDraft.kind} to this device, then attach it with the popup’s paperclip.`
    );
  }

  const draft = asSent(sourceDraft);
  const tag = draft.tag ? `#${draft.tag}` : undefined;
  const note = draft.note?.trim() || undefined;

  const sourceUrl =
    delivery.sourceButton &&
    draft.kind !== 'page' &&
    isHttpUrl(draft.pageUrl) &&
    draft.pageUrl !== draft.url
      ? draft.pageUrl
      : undefined;

  const quote = sourceUrl && quoteUrl(draft);

  // The button opens the quote; history keeps the page's own URL.
  const common = {
    silent: delivery.silent,
    ...(sourceUrl && { sourceUrl: quote || sourceUrl }),
  };

  const files = draftFiles(draft);
  const [file] = files;

  if (files.length > MAX_ATTACHMENTS) {
    throw new ComposeError(
      `A message takes up to ${MAX_ATTACHMENTS} files. Remove ${files.length - MAX_ATTACHMENTS}, then send again.`
    );
  }

  if (files.length > 1) {
    const caption = albumCaption(
      formattedParagraphs(
        plain(note),
        formattedBody(draft, delivery),
        plain(tag)
      ),
      sourceUrl,
      quote || undefined
    );

    const split = albumGroups(files, delivery.imageMode);

    // Under the last album, so the text reads after every file, as drawn.
    const groups = split.map((group, index) => ({
      ...group,
      ...(index === split.length - 1 &&
        caption.text && {
          caption: caption.text,
          ...(caption.entities.length > 0 && {
            captionEntities: caption.entities,
          }),
        }),
    }));

    return { kind: 'album', groups, silent: delivery.silent };
  }

  if (file) {
    const caption = clipFormatted(
      formattedParagraphs(
        plain(note),
        formattedBody(draft, delivery),
        plain(tag)
      ),
      CAPTION_LIMIT
    );

    return {
      kind: sendsAsPhoto(file, delivery.imageMode) ? 'photo' : 'document',
      attachment: file,
      ...(caption.text && {
        caption: caption.text,
        ...(caption.entities.length > 0 && {
          captionEntities: caption.entities,
        }),
      }),
      ...common,
    };
  }

  if (draft.kind === 'image') {
    const url = draft.url;

    if (!isHttpUrl(url)) {
      throw new ComposeError(
        'This image is embedded in the page, so Telegram cannot fetch it. Open the image in its own tab and send it from there.'
      );
    }

    const format = extension(url);
    const asLink = delivery.imageMode === 'link' || format === 'svg';

    if (asLink) {
      return {
        kind: 'text',
        text: paragraphs(note, url, tag),
        linkPreview: true,
        ...common,
      };
    }

    const caption = paragraphs(note, tag);

    // Telegram flattens GIFs sent as photos and rejects most WebP photos.
    const asDocument =
      delivery.imageMode === 'document' || ['gif', 'webp'].includes(format);

    return {
      kind: asDocument ? 'document' : 'photo',
      url,
      ...(caption && { caption: clip(caption, CAPTION_LIMIT) }),
      ...common,
    };
  }

  if ((draft.kind === 'video' || draft.kind === 'audio') && draft.url) {
    const caption = paragraphs(note, tag);

    // Telegram falls back to a file, then the link, when it can't play it.
    return {
      kind: draft.kind,
      url: draft.url,
      ...(caption && { caption: clip(caption, CAPTION_LIMIT) }),
      ...common,
    };
  }

  const body = bodyOf(draft, delivery);

  if (!body && !note) {
    throw new ComposeError('There is nothing to send.');
  }

  const message = clipFormatted(
    formattedParagraphs(
      plain(note),
      formattedBody(draft, delivery),
      plain(tag)
    ),
    MAX_TEXT_LENGTH
  );

  return {
    kind: 'text',
    text: message.text,
    ...(message.entities.length > 0 && { entities: message.entities }),
    linkPreview: delivery.linkPreview,
    ...common,
  };
}
