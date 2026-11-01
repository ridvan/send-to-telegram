import {
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  Attachment01Icon,
  Cancel01Icon,
  Clock01Icon,
  Search01Icon,
  Settings01Icon,
  TickDouble02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  patternTile,
  type ChatPattern,
} from '@send-to-telegram/core/chat-patterns';
import type { ReactNode } from 'react';

import { PlaneIcon } from '@/components/plane-icon';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/*
 * The extension's popup, drawn from the same tokens so every chat on this
 * page looks the way it does in the browser. Nothing here is interactive:
 * each chat is a picture of one, described by its label.
 */

export type Tone =
  | 'red'
  | 'orange'
  | 'violet'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'pink';

const iconProps = { strokeWidth: 1.8, 'aria-hidden': true } as const;

/** The popup: the chat's name across the top, the chat, then the note field. */
export function ChatWindow({
  label,
  name,
  tone,
  pattern,
  attach = false,
  note,
  typing = false,
  pressed,
  children,
}: {
  /**
   * What the picture shows, for screen readers. Leave it out when the chat is
   * part of a larger picture with its own description.
   */
  label?: string;
  name: string;
  tone: Tone;
  pattern?: ChatPattern | undefined;
  /** Shows the paperclip, which only your own bot's chats have. */
  attach?: boolean;
  /** What's typed in the note field; the placeholder shows without it. */
  note?: string | undefined;
  /** Shows the text cursor in the note field. */
  typing?: boolean;
  /** The composer button being pressed, for a demo. */
  pressed?: 'attach' | 'send' | undefined;
  children: ReactNode;
}) {
  return (
    <div
      {...(label ? { role: 'img', 'aria-label': label } : { inert: true })}
      className="flex size-full flex-col overflow-hidden rounded-2xl border bg-background text-left select-none"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Avatar size="sm">
          <AvatarFallback tone={tone}>{name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-semibold">{name}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          {...iconProps}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="ml-auto flex items-center gap-3 text-muted-foreground">
          <HugeiconsIcon
            icon={Search01Icon}
            {...iconProps}
            className="size-4"
          />
          <HugeiconsIcon
            icon={Settings01Icon}
            {...iconProps}
            className="size-4"
          />
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden bg-chat">
        <ChatWallpaper pattern={pattern} />
        <div className="relative flex flex-col gap-2.5 p-3">{children}</div>
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 border-t px-3">
        {attach ? (
          <span
            className={cn(
              '-ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition duration-150',
              pressed === 'attach' && 'scale-90 bg-muted text-foreground'
            )}
          >
            <HugeiconsIcon
              icon={Attachment01Icon}
              {...iconProps}
              className="size-4.5"
            />
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 items-center text-sm">
          {note ? (
            <span className="truncate">{note}</span>
          ) : (
            <span className="text-muted-foreground">Add a note</span>
          )}
          {typing ? (
            <span className="ml-px h-4 w-px shrink-0 animate-caret bg-foreground" />
          ) : null}
        </span>
        <SendButton pressed={pressed === 'send'} />
      </div>
    </div>
  );
}

/** Telegram's blue, kept for the one action that sends. */
export function SendButton({ pressed = false }: { pressed?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition duration-150',
        pressed && 'scale-90 opacity-85'
      )}
    >
      <PlaneIcon className="size-3.5" />
    </span>
  );
}

/** What's behind the messages: a soft glow, and a pattern over it. */
export function ChatWallpaper({
  pattern,
  scale = 1,
}: {
  pattern?: ChatPattern | undefined;
  /** Draws the pattern smaller, so a swatch holds more than a fragment. */
  scale?: number;
}) {
  if (!pattern) return null;

  const tile = patternTile(pattern, scale);

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 chat-glow"
    >
      <span
        className="absolute inset-0 bg-chat-pattern mask-(--tile) mask-size-(--tile-size) mask-repeat mask-luminance"
        style={{ '--tile': tile.image, '--tile-size': tile.size }}
      />
    </span>
  );
}

export type Status = 'sending' | 'sent';

/** Where a message's time sits in its bubble. */
const metaPlacements = {
  // Floats at the end of the last line of text.
  inline: 'relative top-1.5 float-right ml-3',
  // On its own row, under a link's card.
  row: 'justify-end pt-1',
  // In the bottom corner, level with a voice message's length.
  corner: 'absolute right-3 bottom-2',
};

/** The time and, on a message you sent, its ticks, as Telegram draws them. */
function Meta({
  time,
  status,
  placement = 'inline',
}: {
  time: string;
  status?: Status | undefined;
  placement?: keyof typeof metaPlacements;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs leading-5 tabular-nums',
        metaPlacements[placement],
        status ? 'text-bubble-muted' : 'text-received-muted'
      )}
    >
      {time}
      {status ? (
        <HugeiconsIcon
          key={status}
          icon={status === 'sent' ? TickDouble02Icon : Clock01Icon}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'size-3.5',
            status === 'sent' && 'animate-pop text-bubble-accent'
          )}
        />
      ) : null}
    </span>
  );
}

/** The time on a photo with no caption, in a dark pill. */
function PhotoMeta({ time, sent = false }: { time: string; sent?: boolean }) {
  return (
    <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/45 px-1.5 text-xs leading-5 text-white tabular-nums">
      {time}
      {sent ? (
        <HugeiconsIcon
          icon={TickDouble02Icon}
          strokeWidth={2}
          aria-hidden
          className="size-3.5"
        />
      ) : null}
    </span>
  );
}

/** A message you sent, on the right. */
export function Outgoing({
  time,
  status = 'sent',
  card,
  media,
  button,
  draft = false,
  className,
  children,
}: {
  time: string;
  status?: Status;
  /** A link preview under the text; the time moves under it. */
  card?: ReactNode;
  /** A photo filling the bubble, with the time on it, or the caption under it. */
  media?: ReactNode;
  /** Not sent yet: the popup's live preview of what you're writing. */
  draft?: boolean;
  /** A button under the bubble, such as Open page. */
  button?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex max-w-[85%] flex-col gap-1 self-end',
        media ? 'w-56' : undefined,
        className
      )}
    >
      {media ? (
        <div
          className={cn(
            'overflow-hidden rounded-2xl rounded-br-sm bg-bubble shadow-xs',
            draft &&
              'outline-1 outline-offset-2 outline-bubble-accent/50 outline-dashed'
          )}
        >
          <div className="relative">
            {media}
            {children || draft ? null : <PhotoMeta time={time} sent />}
            {draft ? (
              <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-service text-service-foreground backdrop-blur-sm">
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  aria-hidden
                  className="size-3"
                />
              </span>
            ) : null}
          </div>
          {children ? (
            <div className="px-3 py-1.5 text-sm break-words whitespace-pre-line text-bubble-foreground">
              {children}
              {draft ? null : <Meta time={time} status={status} />}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl rounded-br-sm bg-bubble px-3 py-1.5 text-sm text-bubble-foreground shadow-xs">
          <div className="break-words whitespace-pre-line">
            {children}
            {card ? null : <Meta time={time} status={status} />}
          </div>
          {card}
          {card ? <Meta time={time} status={status} placement="row" /> : null}
        </div>
      )}
      {button ? (
        <span className="relative flex items-center justify-center rounded-xl bg-bubble/70 py-1.5 text-xs font-medium text-bubble-foreground">
          {button}
          <HugeiconsIcon
            icon={ArrowUpRight01Icon}
            strokeWidth={2}
            aria-hidden
            className="absolute top-1 right-1 size-3"
          />
        </span>
      ) : null}
    </div>
  );
}

/** A message sent to your bot from Telegram, on the left. */
export function Incoming({
  time,
  media,
  timeInCorner = false,
  className,
  children,
}: {
  time: string;
  /** A photo or video filling the top of the bubble. */
  media?: ReactNode;
  /**
   * Puts the time in the bubble's bottom corner, for a message with no last
   * line of text to end, such as a voice message.
   */
  timeInCorner?: boolean;
  className?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative max-w-[85%] self-start overflow-hidden rounded-2xl rounded-bl-sm bg-received text-sm text-received-foreground shadow-xs',
        className
      )}
    >
      {media}
      {media && !children ? <PhotoMeta time={time} /> : null}
      {children ? (
        <div className="px-3 py-1.5 break-words">
          {children}
          <Meta time={time} placement={timeInCorner ? 'corner' : 'inline'} />
        </div>
      ) : null}
    </div>
  );
}

/** Telegram's card under a link: the site and the page's title. */
export function LinkCard({ site, title }: { site: string; title: string }) {
  return (
    <span className="mt-1.5 flex flex-col rounded-md border-l-2 border-bubble-accent bg-bubble-accent/10 py-1.5 pr-2 pl-2.5">
      <span className="truncate font-semibold text-bubble-accent">{site}</span>
      <span className="line-clamp-2 font-semibold">{title}</span>
    </span>
  );
}

/** Link-colored text inside a bubble, such as a URL or a hashtag. */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="break-all text-bubble-accent">{children}</span>;
}

/** A note from the chat itself, such as which bot it sends with. */
export function ServiceNote({
  icon,
  title,
  children,
}: {
  icon: typeof Clock01Icon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-1 flex max-w-64 flex-col items-center gap-1 self-center rounded-2xl bg-service px-4 py-3 text-center text-xs text-service-foreground backdrop-blur-sm">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={1.8}
        aria-hidden
        className="mb-0.5 size-5"
      />
      <p className="font-semibold">{title}</p>
      <p>{children}</p>
    </div>
  );
}

/** The day between messages, in a small pill. */
export function DayMarker({ children }: { children: ReactNode }) {
  return (
    <span className="self-center rounded-full bg-service px-2.5 py-0.5 text-xs font-medium text-service-foreground backdrop-blur-sm">
      {children}
    </span>
  );
}
