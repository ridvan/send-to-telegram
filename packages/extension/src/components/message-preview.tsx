import {
  AlertCircleIcon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  Clock01Icon,
  File01Icon,
  Image02Icon,
  Mic01Icon,
  MusicNote01Icon,
  TickDouble02Icon,
  Video01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState, type ReactNode } from 'react';

import { IconTile } from '@/components/icon-tile';
import { ReceivedMedia } from '@/components/received-media';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { isHttpUrl, sendsAsPhoto, sendsPageInstead } from '@/lib/compose';
import { splitHashtags } from '@/lib/hashtags';
import {
  displayUrl,
  formatBytes,
  formatClock,
  hostname,
  kindLabel,
} from '@/lib/format';
import type {
  Attachment,
  ContentKind,
  HistoryEntry,
  InboxEntry,
  Settings,
} from '@/lib/settings';
import { cn } from '@/lib/utils';

export type MessageStatus = 'draft' | 'sending' | 'sent' | 'failed';

const statusIcons = {
  sending: Clock01Icon,
  sent: TickDouble02Icon,
  failed: AlertCircleIcon,
} satisfies Record<Exclude<MessageStatus, 'draft'>, typeof Clock01Icon>;

const statusLabels = {
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Not sent',
} satisfies Record<Exclude<MessageStatus, 'draft'>, string>;

/**
 * The time and delivery ticks in a bubble's corner, as Telegram draws them.
 * A received message has no ticks, only the time.
 */
function Meta({
  status,
  time,
  inline,
  live,
  onPhoto = false,
}: {
  status: MessageStatus | 'received';
  time: number;
  /** Floats at the end of the last line of text instead of on its own row. */
  inline: boolean;
  /** Pops a new status icon in; earlier messages draw theirs still. */
  live: boolean;
  /** Sits on a photo with no caption, in a dark pill, as Telegram draws it. */
  onPhoto?: boolean;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs leading-5 tabular-nums select-none',
        onPhoto
          ? 'pointer-events-none absolute right-1.5 bottom-1.5 rounded-full bg-black/45 px-1.5 text-white'
          : inline
            ? 'relative top-1.5 float-right ml-3'
            : 'justify-end pt-1',
        !onPhoto &&
          (status === 'received' ? 'text-received-muted' : 'text-bubble-muted')
      )}
    >
      {formatClock(time)}
      {status === 'received' ? (
        <span className="sr-only">Received</span>
      ) : status === 'draft' ? null : (
        <>
          <HugeiconsIcon
            key={status}
            icon={statusIcons[status]}
            strokeWidth={2}
            className={cn(
              'size-3.5',
              status === 'failed' && 'text-destructive',
              status === 'sent' && !onPhoto && 'text-bubble-accent',
              live && status !== 'sending' && 'animate-pop'
            )}
          />
          <span className="sr-only">{statusLabels[status]}</span>
        </>
      )}
    </span>
  );
}

/** A link in an earlier message opens; in the preview it only looks like one. */
function UrlText({
  url,
  linked,
  children,
}: {
  url: string;
  linked: boolean;
  children: ReactNode;
}) {
  if (!linked) {
    return <span className="break-all text-bubble-accent">{children}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="break-all text-bubble-accent underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

/** Telegram's card under a link: the site, the title and a small icon. */
function LinkCard({
  url,
  title,
  favIconUrl,
  onRemove,
}: {
  url: string;
  title: string | undefined;
  favIconUrl: string | undefined;
  onRemove: (() => void) | undefined;
}) {
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <span className="mt-1.5 flex gap-2 rounded-md border-l-2 border-bubble-accent bg-bubble-accent/10 py-1.5 pr-2 pl-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-bubble-accent">
          {hostname(url)}
        </span>
        {title ? (
          <span className="line-clamp-2 font-semibold">{title}</span>
        ) : null}
      </span>
      {favIconUrl && !iconFailed ? (
        <img
          src={favIconUrl}
          alt=""
          className="mt-0.5 size-8 shrink-0 rounded-sm object-contain"
          onError={() => setIconFailed(true)}
        />
      ) : null}
      {onRemove ? (
        <RemoveButton label="Remove page link" onRemove={onRemove} />
      ) : null}
    </span>
  );
}

function Hashtag({ tag }: { tag: string }) {
  return <span className="text-bubble-accent">{`#${tag}`}</span>;
}

/** A note with the hashtags in it colored, as Telegram links them. */
function NoteText({ text }: { text: string }) {
  return splitHashtags(text).map((part, index) =>
    part.hashtag ? <Hashtag key={index} tag={part.text.slice(1)} /> : part.text
  );
}

type MessageContent = {
  kind: ContentKind;
  note?: string | undefined;
  /** Selected text. */
  text?: string | undefined;
  /** The link target, or the image, video or audio source. */
  url?: string | undefined;
  pageUrl?: string | undefined;
  pageTitle?: string | undefined;
  tag?: string | undefined;
  attachment?: AttachmentView | undefined;
};

/** An attached file; `url` shows its contents while it's still on this device. */
export type AttachmentView = Pick<Attachment, 'name' | 'type' | 'size'> & {
  url?: string | undefined;
};

type Block = { key: string; content: ReactNode };

/** Marks media Telegram fetches from its address, which the bubble shows. */
const sourceIcons = {
  image: Image02Icon,
  video: Video01Icon,
  audio: MusicNote01Icon,
} satisfies Partial<Record<ContentKind, typeof Image02Icon>>;

/**
 * Splits a message into the paragraphs Telegram shows, following the same
 * rules as `compose`: the note first, then the content, then the hashtag.
 */
function messageParts(
  message: MessageContent,
  delivery: Settings['delivery'],
  linked: boolean
) {
  const { pageUrl, pageTitle, tag } = message;
  // A video or song Telegram can't fetch went as its page.
  const kind = sendsPageInstead(message) ? 'page' : message.kind;
  const note = message.note?.trim();
  // A caption under a file has no link preview, so the title goes in the text.
  const withTitle = !delivery.linkPreview || message.attachment !== undefined;
  const blocks: Block[] = [];

  if (note) blocks.push({ key: 'note', content: <NoteText text={note} /> });

  if (kind === 'selection' && message.text) {
    blocks.push({
      key: 'text',
      content: <span className="line-clamp-8">{message.text.trim()}</span>,
    });
  }

  if (kind !== 'selection' && kind !== 'page' && message.url) {
    const url = isHttpUrl(message.url) ? (
      <UrlText url={message.url} linked={linked}>
        {displayUrl(message.url)}
      </UrlText>
    ) : (
      <span className="break-all">{message.url}</span>
    );

    blocks.push({
      key: 'url',
      content:
        kind === 'link' ? (
          url
        ) : (
          <span className="flex items-start gap-1.5">
            <HugeiconsIcon
              icon={sourceIcons[kind]}
              strokeWidth={1.8}
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-bubble-muted"
            />
            {url}
          </span>
        ),
    });
  }

  if (kind === 'page' && pageUrl) {
    const url = isHttpUrl(pageUrl) ? (
      <UrlText url={pageUrl} linked={linked}>
        {displayUrl(pageUrl)}
      </UrlText>
    ) : (
      <span className="break-all">{pageUrl}</span>
    );

    blocks.push({
      key: 'url',
      content:
        !withTitle || !pageTitle ? (
          url
        ) : (
          <>
            {pageTitle}
            <br />
            {url}
          </>
        ),
    });
  }

  if (tag) blocks.push({ key: 'tag', content: <Hashtag tag={tag} /> });

  const cardUrl =
    kind === 'page' ? pageUrl : kind === 'link' ? message.url : undefined;

  const card =
    !withTitle && isHttpUrl(cardUrl)
      ? { url: cardUrl, title: kind === 'page' ? pageTitle : undefined }
      : undefined;

  const sourceUrl =
    delivery.sourceButton &&
    kind !== 'page' &&
    isHttpUrl(pageUrl) &&
    pageUrl !== message.url
      ? pageUrl
      : undefined;

  return { blocks, card, sourceUrl };
}

/** The button Telegram shows under a message, linking to the page it came from. */
function SourceButton({ url, linked }: { url: string; linked: boolean }) {
  const className =
    'relative flex items-center justify-center rounded-xl bg-bubble/70 py-1.5 text-xs font-medium text-bubble-foreground';

  const content = (
    <>
      Open page
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        strokeWidth={2}
        className="absolute top-1 right-1 size-3"
      />
    </>
  );

  if (!linked) return <span className={className}>{content}</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(className, 'hover:bg-bubble')}
    >
      {content}
    </a>
  );
}

function RemoveButton({
  label = 'Remove file',
  onRemove,
}: {
  label?: string;
  onRemove: () => void;
}) {
  return (
    <Button
      variant="service"
      size="icon-xs"
      aria-label={label}
      onClick={onRemove}
    >
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
    </Button>
  );
}

/**
 * Photos and videos fill the bubble's width, as Telegram shows them. With no
 * caption, the time sits on the picture.
 */
function MediaFrame({
  children,
  meta,
}: {
  children: ReactNode;
  meta: ReactNode;
}) {
  return (
    <span
      className={cn(
        'relative -mx-3 -mt-1.5 block min-w-64 bg-bubble-muted/10',
        meta ? '-mb-1.5' : 'mb-1.5'
      )}
    >
      {children}
      {meta}
    </span>
  );
}

function AttachedPhoto({
  url,
  name,
  onRemove,
}: {
  url: string;
  name: string;
  onRemove: (() => void) | undefined;
}) {
  return (
    <>
      <img
        src={url}
        alt={name}
        className="block max-h-80 w-full object-cover"
      />
      {onRemove ? (
        <span className="absolute top-1.5 right-1.5">
          <RemoveButton onRemove={onRemove} />
        </span>
      ) : null}
    </>
  );
}

/** Media kinds that fill the bubble rather than sit inside it. */
const visualMedia = new Set(['photo', 'video', 'animation']);

/** A file sent earlier, downloaded from Telegram as received media is. */
function SentMedia({
  entry,
  sent,
  token,
}: {
  entry: HistoryEntry;
  sent: NonNullable<NonNullable<HistoryEntry['content']>['sentMedia']>;
  token: string;
}) {
  const name = entry.content?.attachment?.name;

  const message: InboxEntry = {
    id: entry.id,
    destinationId: entry.destinationId ?? '',
    receivedAt: entry.sentAt,
    media: sent.media,
    file: sent.file,
    ...(name && { fileName: name }),
  };

  return <ReceivedMedia token={token} message={message} file={sent.file} />;
}

/** Any other file: a thumbnail or icon, its name and size. */
function AttachedFile({
  attachment,
  onRemove,
}: {
  attachment: AttachmentView;
  onRemove: (() => void) | undefined;
}) {
  const image = attachment.type.startsWith('image/');

  return (
    <span className="flex items-center gap-2.5 py-1">
      {image && attachment.url ? (
        <img
          src={attachment.url}
          alt=""
          className="size-8 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <IconTile icon={image ? Image02Icon : File01Icon} tone="blue" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{attachment.name}</span>
        <span className="text-xs text-bubble-muted tabular-nums">
          {formatBytes(attachment.size)}
        </span>
      </span>
      {onRemove ? <RemoveButton onRemove={onRemove} /> : null}
    </span>
  );
}

/** One outgoing bubble with its optional link card and source button. */
function Bubble({
  message,
  delivery,
  status,
  time,
  linked,
  live,
  favIconUrl,
  empty,
  unsent = false,
  onRemoveAttachment,
  onRemovePageLink,
  sentMedia,
}: {
  message: MessageContent;
  delivery: Settings['delivery'];
  status: MessageStatus;
  time: number;
  linked: boolean;
  live: boolean;
  favIconUrl?: string | undefined;
  /** Shown in place of text when there is nothing to show. */
  empty: ReactNode;
  /** Outlined, to tell the message being written from those sent. */
  unsent?: boolean;
  onRemoveAttachment?: (() => void) | undefined;
  /** Takes the page's link card off a draft. */
  onRemovePageLink?: (() => void) | undefined;
  /** A file sent earlier, drawn from Telegram's copy in place of its name. */
  sentMedia?: { node: ReactNode; visual: boolean } | undefined;
}) {
  const { blocks, card, sourceUrl } = messageParts(message, delivery, linked);
  const { attachment } = message;

  const photoUrl =
    attachment?.url && sendsAsPhoto(attachment, delivery.imageMode)
      ? attachment.url
      : undefined;

  const framed = photoUrl !== undefined || sentMedia?.visual === true;

  const photoMeta =
    framed && blocks.length === 0 ? (
      <Meta status={status} time={time} inline={false} live={live} onPhoto />
    ) : null;

  // Telegram draws the time after the last line of text, or under the card.
  const meta = <Meta status={status} time={time} inline={!card} live={live} />;

  return (
    <>
      <div
        className={cn(
          'rounded-2xl rounded-br-sm bg-bubble px-3 pt-1.5 pb-1.5 text-sm text-bubble-foreground shadow-xs',
          framed && 'overflow-hidden',
          unsent &&
            'outline-1 outline-offset-2 outline-bubble-accent/50 outline-dashed'
        )}
      >
        {sentMedia?.visual ? (
          <MediaFrame meta={photoMeta}>{sentMedia.node}</MediaFrame>
        ) : null}
        {sentMedia && !sentMedia.visual ? (
          <div className="py-1">{sentMedia.node}</div>
        ) : null}
        {attachment && photoUrl && !sentMedia ? (
          <MediaFrame meta={photoMeta}>
            <AttachedPhoto
              url={photoUrl}
              name={attachment.name}
              onRemove={onRemoveAttachment}
            />
          </MediaFrame>
        ) : null}
        {attachment && !photoUrl && !sentMedia ? (
          <AttachedFile attachment={attachment} onRemove={onRemoveAttachment} />
        ) : null}
        {blocks.length === 0 && attachment && !framed ? (
          <Meta status={status} time={time} inline={false} live={live} />
        ) : null}
        {blocks.length === 0 && !attachment ? (
          <p className="text-bubble-muted">
            {empty}
            {meta}
          </p>
        ) : null}
        {blocks.map((block) => (
          <p
            key={block.key}
            className="break-words whitespace-pre-line not-first:mt-2"
          >
            {block.content}
            {!card && block === blocks.at(-1) ? meta : null}
          </p>
        ))}
        {card ? (
          <>
            <LinkCard
              url={card.url}
              title={card.title}
              favIconUrl={favIconUrl}
              onRemove={message.kind === 'page' ? onRemovePageLink : undefined}
            />
            {meta}
          </>
        ) : null}
      </div>
      {sourceUrl ? <SourceButton url={sourceUrl} linked={linked} /> : null}
    </>
  );
}

const outgoing =
  'flex max-w-[85%] min-w-24 flex-col items-stretch gap-1 self-end';

/** A bubble and what goes under it, such as its source button. */
const column = 'flex flex-col items-stretch gap-1';

const outgoingColumn =
  'ml-auto flex max-w-[85%] min-w-24 flex-col items-stretch gap-1';

const incomingColumn = 'mr-auto flex max-w-[85%] min-w-24 flex-col';

/** The message as it will arrive in Telegram, rebuilt from the draft. */
export function MessagePreview({
  kind,
  pageUrl,
  pageTitle,
  favIconUrl,
  text,
  note,
  delivery,
  status,
  time,
  standOut,
  attachment,
  onRemoveAttachment,
  onRemovePageLink,
  menu,
  menuDisabled,
}: {
  kind: 'page' | 'selection';
  pageUrl: string | undefined;
  pageTitle: string | undefined;
  favIconUrl: string | undefined;
  text: string | undefined;
  note: string;
  delivery: Settings['delivery'];
  status: MessageStatus;
  time: number;
  /** Earlier messages show above, so mark this one as not sent yet. */
  standOut: boolean;
  attachment: AttachmentView | undefined;
  /** Left out while sending, when the file can no longer change. */
  onRemoveAttachment: (() => void) | undefined;
  /** Left out while sending, like `onRemoveAttachment`. */
  onRemovePageLink: (() => void) | undefined;
  /** Its right-click menu, kept mounted so a closing one can finish. */
  menu: ReactNode;
  /** While sending, searching or selecting, or with nothing to offer. */
  menuDisabled: boolean;
}) {
  return (
    <figure aria-label="Preview" className={outgoing}>
      <ContextMenu disabled={menuDisabled}>
        <ContextMenuTrigger>
          <div className={column}>
            <Bubble
              message={{ kind, pageUrl, pageTitle, text, note, attachment }}
              onRemoveAttachment={onRemoveAttachment}
              onRemovePageLink={onRemovePageLink}
              delivery={delivery}
              status={status}
              time={time}
              linked={false}
              live
              favIconUrl={favIconUrl}
              empty="Write a note to send"
              unsent={standOut && (status === 'draft' || status === 'failed')}
            />
          </div>
        </ContextMenuTrigger>
        {menu}
      </ContextMenu>
    </figure>
  );
}

/**
 * In search results a message is picked, not used: its links and media go
 * inert, and one button over it shows it in the chat.
 */
export type MessagePick = { label: string; onPick: () => void };

function PickButton({ pick }: { pick: MessagePick }) {
  return (
    <button
      type="button"
      aria-label={pick.label}
      onClick={pick.onPick}
      className="absolute inset-0 cursor-pointer rounded-2xl outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  );
}

/** While selecting, a message is checked, not used, like a picked one. */
export type MessageSelect = {
  selected: boolean;
  label: string;
  onToggle: () => void;
};

/**
 * A message's row in the chat. While selecting, a check sits at its left, as
 * in Telegram, and a click anywhere on the row toggles it. The row reaches
 * the chat's edges, so selected neighbours tint as one strip.
 */
function MessageRow({
  id,
  side,
  pick,
  select,
  children,
}: {
  id: string | undefined;
  side: 'out' | 'in';
  pick: MessagePick | undefined;
  select: MessageSelect | undefined;
  children: ReactNode;
}) {
  return (
    <li
      id={id}
      className={cn(
        '-mx-3 -my-1.5 flex items-center gap-3 px-3 py-1.5 transition-colors duration-150',
        select && 'relative',
        select?.selected && 'bg-brand/10'
      )}
    >
      {select ? (
        <>
          {/* For the pointer only; the check is what the keyboard reaches. */}
          <span
            aria-hidden
            onClick={select.onToggle}
            className="absolute inset-0 cursor-pointer"
          />
          <Checkbox
            variant="round"
            checked={select.selected}
            onCheckedChange={select.onToggle}
            aria-label={select.label}
          />
        </>
      ) : null}
      <div
        className={cn(
          side === 'out' ? outgoingColumn : incomingColumn,
          pick && 'relative'
        )}
      >
        {children}
        {pick ? <PickButton pick={pick} /> : null}
      </div>
    </li>
  );
}

/**
 * A message from history, drawn as it was sent. Delivery settings aren't kept
 * per message, so the link card and source button follow today's settings.
 */
export function SentMessage({
  entry,
  delivery,
  token,
  footer,
  id,
  pick,
  select,
  menu,
}: {
  entry: HistoryEntry;
  delivery: Settings['delivery'];
  /** The bot's, to show a file it sent. */
  token?: string | undefined;
  /** Under the bubble, such as a way to send a failed message again. */
  footer?: ReactNode;
  /** Lets a search result scroll the chat to this message. */
  id?: string | undefined;
  pick?: MessagePick | undefined;
  select?: MessageSelect | undefined;
  /** Its right-click menu, off while it's picked or selected. */
  menu?: ReactNode;
}) {
  const sent = entry.content?.sentMedia;
  // Picked or checked instead of used: links, media and the menu rest.
  const passive = pick !== undefined || select !== undefined;

  const body = (
    <>
      <Bubble
        message={{ kind: entry.kind, tag: entry.tag, ...entry.content }}
        sentMedia={
          sent && token
            ? {
                node: <SentMedia entry={entry} sent={sent} token={token} />,
                visual: visualMedia.has(sent.media),
              }
            : undefined
        }
        delivery={delivery}
        status={entry.status}
        time={entry.sentAt}
        linked
        live={false}
        empty={kindLabel[entry.kind]}
      />
      {footer}
    </>
  );

  return (
    <MessageRow id={id} side="out" pick={pick} select={select}>
      {/* The same wrapper either way, so starting a search doesn't rebuild
          the message. The whole bubble opens the menu, links in it too. */}
      <ContextMenu disabled={!menu || passive}>
        <ContextMenuTrigger>
          <div inert={passive} className={column}>
            {body}
          </div>
        </ContextMenuTrigger>
        {menu}
      </ContextMenu>
    </MessageRow>
  );
}

const mediaIcons = {
  photo: Image02Icon,
  video: Video01Icon,
  animation: Video01Icon,
  voice: Mic01Icon,
  audio: Mic01Icon,
  file: File01Icon,
} satisfies Record<NonNullable<InboxEntry['media']>, typeof Image02Icon>;

const mediaLabels = {
  photo: 'Photo',
  video: 'Video',
  animation: 'GIF',
  voice: 'Voice message',
  audio: 'Audio',
  file: 'File',
} satisfies Record<NonNullable<InboxEntry['media']>, string>;

/** The text with the links Telegram found in it made clickable. */
function LinkedText({
  text,
  links = [],
}: {
  text: string;
  links: InboxEntry['links'];
}) {
  const parts: ReactNode[] = [];
  let end = 0;

  for (const link of links.toSorted((a, b) => a.offset - b.offset)) {
    if (link.offset < end) continue;

    parts.push(
      text.slice(end, link.offset),
      <a
        key={link.offset}
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="break-all text-bubble-accent underline-offset-2 hover:underline"
      >
        {text.slice(link.offset, link.offset + link.length)}
      </a>
    );
    end = link.offset + link.length;
  }

  parts.push(text.slice(end));

  return parts;
}

/**
 * A message sent to your bot from Telegram, on the left as Telegram draws
 * messages from others. Photos, videos and GIFs fill the bubble's width;
 * sound and files sit inside it. `token` is the bot's that received it.
 */
export function ReceivedMessage({
  message,
  token,
  id,
  pick,
  select,
  menu,
}: {
  message: InboxEntry;
  token: string | undefined;
  /** Lets a search result scroll the chat to this message. */
  id?: string | undefined;
  pick?: MessagePick | undefined;
  select?: MessageSelect | undefined;
  /** Its right-click menu, off while it's picked or selected. */
  menu?: ReactNode;
}) {
  const { from, text, media, file } = message;
  const passive = pick !== undefined || select !== undefined;
  const playable = token && file ? { token, file } : undefined;

  const visual =
    playable &&
    (media === 'photo' || media === 'video' || media === 'animation');

  return (
    <MessageRow id={id} side="in" pick={pick} select={select}>
      <ContextMenu disabled={!menu || passive}>
        <ContextMenuTrigger>
          <div
            inert={passive}
            className={cn(
              'overflow-hidden rounded-2xl rounded-bl-sm bg-received text-sm text-received-foreground shadow-xs',
              visual && 'w-64'
            )}
          >
            {from ? (
              <p className="truncate px-3 pt-1.5 text-xs font-semibold text-bubble-accent">
                {from}
              </p>
            ) : null}
            {visual ? (
              <div className={from ? 'mt-1.5' : undefined}>
                <ReceivedMedia
                  token={playable.token}
                  message={message}
                  file={playable.file}
                />
              </div>
            ) : null}
            <div className={cn('px-3', visual && !text ? 'py-0.5' : 'py-1.5')}>
              {media && !visual ? (
                playable ? (
                  <ReceivedMedia
                    token={playable.token}
                    message={message}
                    file={playable.file}
                  />
                ) : (
                  // Kept before media could be shown, so only its kind is known.
                  <p className="flex items-center gap-1.5 text-received-muted">
                    <HugeiconsIcon
                      icon={mediaIcons[media]}
                      strokeWidth={1.8}
                      aria-hidden
                      className="size-4 shrink-0"
                    />
                    <span className="truncate">
                      {message.fileName ?? mediaLabels[media]}
                    </span>
                  </p>
                )
              ) : null}
              {text ? (
                <p className="break-words whitespace-pre-line not-first:mt-1">
                  <LinkedText text={text} links={message.links} />
                  <Meta
                    status="received"
                    time={message.receivedAt}
                    inline
                    live={false}
                  />
                </p>
              ) : (
                <Meta
                  status="received"
                  time={message.receivedAt}
                  inline={false}
                  live={false}
                />
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        {menu}
      </ContextMenu>
    </MessageRow>
  );
}
