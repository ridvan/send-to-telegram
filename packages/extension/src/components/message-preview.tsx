import {
  AlertCircleIcon,
  ArrowUpRight01Icon,
  Clock01Icon,
  TickDouble02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState, type ReactNode } from 'react';

import { isHttpUrl } from '@/lib/compose';
import { displayUrl, formatClock, hostname } from '@/lib/format';
import type { Settings } from '@/lib/settings';

export type MessageStatus = 'draft' | 'sending' | 'sent' | 'failed';

const statusIcons = {
  sending: Clock01Icon,
  sent: TickDouble02Icon,
  failed: AlertCircleIcon,
} satisfies Record<Exclude<MessageStatus, 'draft'>, typeof Clock01Icon>;

/** The time and delivery ticks in a bubble's corner, as Telegram draws them. */
function Meta({
  status,
  time,
  inline,
}: {
  status: MessageStatus;
  time: number;
  /** Floats at the end of the last line of text instead of on its own row. */
  inline: boolean;
}) {
  return (
    <span
      className={
        inline
          ? 'relative top-1.5 float-right ml-3 flex items-center gap-1 text-xs leading-5 text-bubble-muted tabular-nums select-none'
          : 'flex items-center justify-end gap-1 pt-1 text-xs leading-5 text-bubble-muted tabular-nums select-none'
      }
    >
      {formatClock(time)}
      {status === 'draft' ? null : (
        <HugeiconsIcon
          key={status}
          icon={statusIcons[status]}
          strokeWidth={2}
          className={
            status === 'failed'
              ? 'size-3.5 animate-pop text-destructive'
              : status === 'sent'
                ? 'size-3.5 animate-pop text-bubble-accent'
                : 'size-3.5'
          }
        />
      )}
    </span>
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

/**
 * The message as it will arrive in Telegram, rebuilt from the same parts and
 * settings `compose` uses: the note first, then the content, then the hashtag.
 */
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
}) {
  const trimmedNote = note.trim();
  const linkUrl = kind === 'page' && isHttpUrl(pageUrl) ? pageUrl : undefined;
  const card = delivery.linkPreview ? linkUrl : undefined;

  const sourceButton =
    kind === 'selection' && delivery.sourceButton && isHttpUrl(pageUrl);

  // Each block is a paragraph of the message's text. Telegram draws the link
  // card under all of it, and the time after the last line or under the card.
  const blocks: { key: string; content: ReactNode }[] = [];

  if (trimmedNote) blocks.push({ key: 'note', content: trimmedNote });

  if (kind === 'selection' && text) {
    blocks.push({
      key: 'text',
      content: <span className="line-clamp-8">{text.trim()}</span>,
    });
  }

  if (kind === 'page' && pageUrl) {
    const url = (
      <span className={linkUrl ? 'break-all text-bubble-accent' : 'break-all'}>
        {linkUrl ? displayUrl(pageUrl) : pageUrl}
      </span>
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

  const meta = <Meta status={status} time={time} inline={!card} />;

  return (
    <figure
      aria-label="Preview"
      className="flex max-w-[85%] min-w-24 flex-col items-stretch gap-1 self-end"
    >
      <div className="rounded-2xl rounded-br-sm bg-bubble px-3 pt-1.5 pb-1.5 text-sm text-bubble-foreground shadow-xs">
        {blocks.length === 0 ? (
          <p className="text-bubble-muted">
            Write a note to send
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
            <LinkCard url={card} title={pageTitle} favIconUrl={favIconUrl} />
            {meta}
          </>
        ) : null}
      </div>
      {sourceButton ? (
        <span className="relative flex items-center justify-center rounded-xl bg-bubble/70 py-1.5 text-xs font-medium text-bubble-foreground">
          Open page
          <HugeiconsIcon
            icon={ArrowUpRight01Icon}
            strokeWidth={2}
            className="absolute top-1 right-1 size-3"
          />
        </span>
      ) : null}
    </figure>
  );
}
