import {
  CAPTION_LIMIT,
  MAX_TEXT_LENGTH,
  type OutgoingMessage,
  PHOTO_UPLOAD_LIMIT,
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
  /** The link target, or the image source. */
  url: z.string().optional(),
  note: z.string().optional(),
  tag: tagSchema.optional(),
  /** A file from this device; the message's text becomes its caption. */
  attachment: attachmentSchema.optional(),
  destinationId: z.string().optional(),
});

export type Draft = z.infer<typeof draftSchema>;

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
      return (delivery.linkPreview && !draft.attachment) || !draft.pageTitle
        ? draft.pageUrl
        : `${draft.pageTitle.trim()}\n${draft.pageUrl}`;
    case 'image':
      return undefined;
  }
}

/** Turns a draft into one outgoing message, following the delivery settings. */
export function compose(
  draft: Draft,
  delivery: Settings['delivery']
): OutgoingMessage | ComposedUpload {
  const tag = draft.tag ? `#${draft.tag}` : undefined;
  const note = draft.note?.trim() || undefined;

  const sourceUrl =
    delivery.sourceButton &&
    draft.kind !== 'page' &&
    isHttpUrl(draft.pageUrl) &&
    draft.pageUrl !== draft.url
      ? draft.pageUrl
      : undefined;

  const common = { silent: delivery.silent, ...(sourceUrl && { sourceUrl }) };

  if (draft.attachment) {
    const caption = paragraphs(note, bodyOf(draft, delivery), tag);

    return {
      kind: sendsAsPhoto(draft.attachment, delivery.imageMode)
        ? 'photo'
        : 'document',
      attachment: draft.attachment,
      ...(caption && { caption: clip(caption, CAPTION_LIMIT) }),
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

  const body = bodyOf(draft, delivery);

  if (!body && !note) {
    throw new ComposeError('There is nothing to send.');
  }

  return {
    kind: 'text',
    text: clip(paragraphs(note, body, tag), MAX_TEXT_LENGTH),
    linkPreview: delivery.linkPreview,
    ...common,
  };
}
