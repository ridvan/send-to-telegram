import {
  AlertCircleIcon,
  ArrowUpRight01Icon,
  Clock01Icon,
  File01Icon,
  Image02Icon,
  Mic01Icon,
  TickDouble02Icon,
  Video01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState, type ReactNode } from 'react';

import { ReceivedMedia } from '@/components/received-media';
import { isHttpUrl } from '@/lib/compose';
import { displayUrl, formatClock, hostname, kindLabel } from '@/lib/format';
import type {
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
}: {
  status: MessageStatus | 'received';
  time: number;
  /** Floats at the end of the last line of text instead of on its own row. */
  inline: boolean;
  /** Pops a new status icon in; earlier messages draw theirs still. */
  live: boolean;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs leading-5 tabular-nums select-none',
        inline ? 'relative top-1.5 float-right ml-3' : 'justify-end pt-1',
        status === 'received' ? 'text-received-muted' : 'text-bubble-muted'
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
              status === 'sent' && 'text-bubble-accent',
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
}: {
  url: string;
  title: string | undefined;
  favIconUrl: string | undefined;
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
    </span>
  );
}

function Hashtag({ tag }: { tag: string }) {
  return <span className="text-bubble-accent">{`#${tag}`}</span>;
}

type MessageContent = {
  kind: ContentKind;
  note?: string | undefined;
  /** Selected text. */
  text?: string | undefined;
  /** The link target, or the image source. */
  url?: string | undefined;
  pageUrl?: string | undefined;
  pageTitle?: string | undefined;
  tag?: string | undefined;
};

type Block = { key: string; content: ReactNode };

/**
 * Splits a message into the paragraphs Telegram shows, following the same
 * rules as `compose`: the note first, then the content, then the hashtag.
 */
function messageParts(
  message: MessageContent,
  delivery: Settings['delivery'],
  linked: boolean
) {
  const { kind, pageUrl, pageTitle, tag } = message;
  const note = message.note?.trim();
  const blocks: Block[] = [];

  if (note) blocks.push({ key: 'note', content: note });

  if (kind === 'selection' && message.text) {
    blocks.push({
      key: 'text',
      content: <span className="line-clamp-8">{message.text.trim()}</span>,
    });
  }

  if ((kind === 'link' || kind === 'image') && message.url) {
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
        kind === 'image' ? (
          <span className="flex items-start gap-1.5">
            <HugeiconsIcon
              icon={Image02Icon}
              strokeWidth={1.8}
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-bubble-muted"
            />
            {url}
          </span>
        ) : (
          url
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
        delivery.linkPreview || !pageTitle ? (
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
    delivery.linkPreview && isHttpUrl(cardUrl)
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
}) {
  const { blocks, card, sourceUrl } = messageParts(message, delivery, linked);

  // Telegram draws the time after the last line of text, or under the card.
  const meta = <Meta status={status} time={time} inline={!card} live={live} />;

  return (
    <>
      <div
        className={cn(
          'rounded-2xl rounded-br-sm bg-bubble px-3 pt-1.5 pb-1.5 text-sm text-bubble-foreground shadow-xs',
          unsent &&
            'outline-1 outline-offset-2 outline-bubble-accent/50 outline-dashed'
        )}
      >
        {blocks.length === 0 ? (
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

/** The message as it will arrive in Telegram, rebuilt from the draft. */
export function MessagePreview({
  kind,
  pageUrl,
  pageTitle,
  favIconUrl,
  text,
  note,
  tag,
  delivery,
  status,
  time,
  standOut,
}: {
  kind: 'page' | 'selection';
  pageUrl: string | undefined;
  pageTitle: string | undefined;
  favIconUrl: string | undefined;
  text: string | undefined;
  note: string;
  tag: string | undefined;
  delivery: Settings['delivery'];
  status: MessageStatus;
  time: number;
  /** Earlier messages show above, so mark this one as not sent yet. */
  standOut: boolean;
}) {
  return (
    <figure aria-label="Preview" className={outgoing}>
      <Bubble
        message={{ kind, pageUrl, pageTitle, text, note, tag }}
        delivery={delivery}
        status={status}
        time={time}
        linked={false}
        live
        favIconUrl={favIconUrl}
        empty="Write a note to send"
        unsent={standOut && (status === 'draft' || status === 'failed')}
      />
    </figure>
  );
}

/**
 * A message from history, drawn as it was sent. Delivery settings aren't kept
 * per message, so the link card and source button follow today's settings.
 */
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

export function SentMessage({
  entry,
  delivery,
  footer,
  id,
  pick,
}: {
  entry: HistoryEntry;
  delivery: Settings['delivery'];
  /** Under the bubble, such as a way to send a failed message again. */
  footer?: ReactNode;
  /** Lets a search result scroll the chat to this message. */
  id?: string | undefined;
  pick?: MessagePick | undefined;
}) {
  const body = (
    <>
      <Bubble
        message={{ kind: entry.kind, tag: entry.tag, ...entry.content }}
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
    <li id={id} className={cn(outgoing, pick && 'relative')}>
      {pick ? (
        <>
          <div inert className="flex flex-col items-stretch gap-1">
            {body}
          </div>
          <PickButton pick={pick} />
        </>
      ) : (
        body
      )}
    </li>
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
}: {
  message: InboxEntry;
  token: string | undefined;
  /** Lets a search result scroll the chat to this message. */
  id?: string | undefined;
  pick?: MessagePick | undefined;
}) {
  const { from, text, media, file } = message;
  const playable = token && file ? { token, file } : undefined;

  const visual =
    playable &&
    (media === 'photo' || media === 'video' || media === 'animation');

  return (
    <li
      id={id}
      className={cn(
        'flex max-w-[85%] min-w-24 flex-col self-start',
        pick && 'relative'
      )}
    >
      <div
        inert={pick !== undefined}
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
      {pick ? <PickButton pick={pick} /> : null}
    </li>
  );
}
