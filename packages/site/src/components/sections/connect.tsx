import {
  ArrowDataTransferHorizontalIcon,
  ArrowRight02Icon,
  ArrowUpRight01Icon,
  Attachment01Icon,
  BotIcon,
  BrowserIcon,
  Clock01Icon,
  DatabaseIcon,
  FlashIcon,
  InboxDownloadIcon,
  PlayIcon,
  Settings02Icon,
  Shield01Icon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';

import {
  Accent,
  ChatWindow,
  DayMarker,
  Incoming,
  LinkCard,
  Outgoing,
  ServiceNote,
} from '@/components/chat';
import { IconTile, type TileTone } from '@/components/icon-tile';
import { PhotoArt } from '@/components/photo-art';
import { PlaneIcon } from '@/components/plane-icon';
import { SectionHeading } from '@/components/section-heading';
import { Badge } from '@/components/ui/badge';
import { links } from '@/lib/links';
import { cn } from '@/lib/utils';

/** The rows both ways answer, in order, so they line up side by side. */
const rows = [
  { key: 'setup', term: 'Setup', icon: Settings02Icon, tone: 'blue' },
  { key: 'time', term: 'Setup time', icon: Clock01Icon, tone: 'orange' },
  {
    key: 'stored',
    term: 'Stored',
    icon: DatabaseIcon,
    tone: 'violet',
  },
  {
    key: 'incoming',
    term: 'Incoming',
    icon: InboxDownloadIcon,
    tone: 'green',
  },
  { key: 'files', term: 'Files', icon: Attachment01Icon, tone: 'pink' },
] as const satisfies {
  key: string;
  term: string;
  icon: typeof BotIcon;
  tone: TileTone;
}[];

type Way = {
  id: string;
  title: string;
  /** Not in the extension yet. */
  soon?: boolean;
  badges: { icon: typeof BotIcon; label: string }[];
  summary: string;
  route: ReactNode;
  chat: ReactNode;
  facts: Record<(typeof rows)[number]['key'], string>;
  more: { href: string; label: string };
};

const ways: Way[] = [
  {
    id: 'own-bot',
    title: 'Your own bot',
    badges: [
      { icon: ArrowDataTransferHorizontalIcon, label: 'Two-way' },
      { icon: SlidersHorizontalIcon, label: 'Full control' },
    ],
    summary:
      'Create a bot in Telegram and paste its token. Messages go straight to Telegram, and what you send your bot shows up in the popup.',
    route: (
      <Route>
        <Stop label="This browser" align="start">
          <HugeiconsIcon icon={BrowserIcon} strokeWidth={1.8} aria-hidden />
        </Stop>
        <Leg>
          <Dot className="animate-travel" />
          <Dot className="animate-travel-back" back />
        </Leg>
        <Telegram />
      </Route>
    ),
    chat: (
      <ChatWindow
        label="A chat sent with your own bot: a link sent from the browser, then a link, a photo and a voice message sent to the bot"
        name="Notes to self"
        tone="cyan"
        pattern="space"
        attach
      >
        <ServiceNote icon={BotIcon} title="Sent with your bot, @alex_notes_bot">
          Messages go straight from this browser to Telegram, and what people
          send @alex_notes_bot shows up here.
        </ServiceNote>
        <Outgoing time="08:52">
          <Accent>news.example/rain-gardens</Accent>
        </Outgoing>
        <Incoming time="12:30">
          Read this on the train <Accent>trains.example/night-routes</Accent>
        </Incoming>
        <Incoming
          time="12:31"
          className="w-44"
          media={<PhotoArt scene="sea" className="aspect-3/2" />}
        />
        <Incoming time="12:33" timeInCorner>
          <VoiceMessage />
        </Incoming>
      </ChatWindow>
    ),
    facts: {
      setup:
        'Create a bot with @BotFather, paste its token, and press Start. The extension finds the chat by itself.',
      time: 'About two minutes.',
      stored:
        'Nothing. Your token stays in this browser, and messages go straight to Telegram.',
      incoming:
        'Messages sent to your bot show up in the popup, photos, videos and files included. Send a link from your phone and it’s a click away.',
      files: 'Attach one from the popup, or paste or drop it in.',
    },
    more: { href: links.botFather, label: 'Open @BotFather in Telegram' },
  },
  {
    id: 'relay',
    title: 'S2T Relay',
    soon: true,
    badges: [
      { icon: FlashIcon, label: 'Ready in seconds' },
      { icon: ArrowRight02Icon, label: 'One-way' },
    ],
    summary:
      'Press Start in Telegram and the chat is linked. A small relay passes your messages on to Telegram without reading or storing them.',
    route: (
      <Route>
        <Stop label="This browser" align="start">
          <HugeiconsIcon icon={BrowserIcon} strokeWidth={1.8} aria-hidden />
        </Stop>
        <Leg>
          <Dot className="animate-travel" />
        </Leg>
        <Stop label="relay.s2t.dev">
          <HugeiconsIcon icon={Shield01Icon} strokeWidth={1.8} aria-hidden />
        </Stop>
        <Leg>
          <Dot className="animate-travel-next" />
        </Leg>
        <Telegram />
      </Route>
    ),
    chat: (
      <ChatWindow
        label="A chat sent with S2T Relay: a link with a note and #club, then a quote with an Open page button"
        name="Reading club"
        tone="violet"
        pattern="doodles"
      >
        <ServiceNote icon={Shield01Icon} title="Sent with S2T Relay">
          It passes your messages to Telegram without reading or storing them,
          so what people send the bot doesn’t show up here.
        </ServiceNote>
        <DayMarker>Today</DayMarker>
        <Outgoing
          time="20:41"
          card={<LinkCard site="essays.example" title="On reading slowly" />}
        >
          {'For Thursday '}
          <Accent>#club</Accent>
          {'\n'}
          <Accent>essays.example/reading-slowly</Accent>
        </Outgoing>
        <Outgoing time="20:44" button="Open page">
          The second time through, you notice what the first one was for.
        </Outgoing>
      </ChatWindow>
    ),
    facts: {
      setup: 'Press Start in Telegram.',
      time: 'A few seconds.',
      stored:
        'A hash of your browser’s token, its name (such as “Chrome on macOS”) and the chat it sends to. Never your messages.',
      incoming:
        'Messages sent to the chat stay in Telegram. The relay only sends one way.',
      files:
        'Text, links, pages and images. Attaching a file needs your own bot.',
    },
    more: {
      href: links.relay,
      label: 'Read the relay’s code',
    },
  },
];

/** One way's name, badges and chat, without the rest, for the store pictures. */
export function WayPreview({ id }: { id: string }) {
  const way = ways.find((candidate) => candidate.id === id);

  if (!way) return null;

  return (
    <div className="flex size-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{way.title}</h2>
        <WayBadges way={way} />
      </div>
      <div className="min-h-0 flex-1">{way.chat}</div>
    </div>
  );
}

export function Connect() {
  return (
    <section
      aria-labelledby="connect"
      className="page flex flex-col gap-14 py-24"
    >
      <SectionHeading id="connect" title="Two ways to connect a chat">
        Use your own bot for a direct, two-way connection. S2T Relay, which
        links a chat in seconds, is coming soon.
      </SectionHeading>
      <div className="grid gap-y-20 lg:grid-cols-2 lg:gap-x-16 lg:gap-y-6">
        {ways.map((way) => (
          <article
            key={way.id}
            aria-labelledby={`${way.id}-title`}
            className="grid gap-y-6 lg:row-span-9 lg:grid-rows-subgrid"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3
                  id={`${way.id}-title`}
                  className="text-xl font-semibold tracking-tight"
                >
                  {way.title}
                </h3>
                <WayBadges way={way} />
              </div>
              <p className="text-muted-foreground">{way.summary}</p>
            </div>
            {way.route}
            <div className="h-144">{way.chat}</div>
            {rows.map((row) => (
              <dl
                key={row.key}
                className="grid items-start gap-1.5 border-t pt-4 text-sm sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4"
              >
                <dt className="flex items-center gap-2.5 font-medium">
                  <IconTile icon={row.icon} tone={row.tone} size="sm" />
                  {row.term}
                </dt>
                <dd className="pl-9.5 text-muted-foreground sm:pt-1 sm:pl-0">
                  {way.facts[row.key]}
                </dd>
              </dl>
            ))}
            <a
              href={way.more.href}
              className="flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              {way.more.label}
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                strokeWidth={2}
                aria-hidden
                className="size-3.5"
              />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

/** What sets a way apart, in a word or two each. */
function WayBadges({ way }: { way: Way }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {way.soon ? (
        <li>
          <Badge>Coming soon</Badge>
        </li>
      ) : null}
      {way.badges.map((badge) => (
        <li key={badge.label}>
          <Badge variant="secondary">
            <HugeiconsIcon
              icon={badge.icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {badge.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** The path a message takes, drawn left to right. */
function Route({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="flex items-start pb-6">
      {children}
    </div>
  );
}

/** A place on the route, with its name under it. */
function Stop({
  label,
  align = 'center',
  className,
  children,
}: {
  label: string;
  /** Where the label sits; the ends line up with the route's edges. */
  align?: keyof typeof labelAlignments;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className="relative flex flex-col items-center">
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full border bg-background [&_svg]:size-5',
          className
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          'absolute top-12 text-xs whitespace-nowrap text-muted-foreground',
          labelAlignments[align]
        )}
      >
        {label}
      </span>
    </span>
  );
}

const labelAlignments = {
  start: 'left-0',
  center: '',
  end: 'right-0',
};

function Telegram() {
  return (
    <Stop
      label="Telegram"
      align="end"
      className="border-transparent bg-brand text-brand-foreground [&_svg]:size-4"
    >
      <PlaneIcon className="-translate-x-px" />
    </Stop>
  );
}

/**
 * The line between two stops, which messages travel along. It clips them,
 * so one never travels past the stop it's going to.
 */
function Leg({ children }: { children: ReactNode }) {
  return (
    <span className="relative mx-2 mt-4 h-2 flex-1 overflow-hidden">
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {children}
    </span>
  );
}

/** A message on its way: out in Telegram's blue, back in gray. */
function Dot({
  className,
  back = false,
}: {
  className: string;
  back?: boolean;
}) {
  return (
    <span className={cn('absolute inset-0', className)}>
      <span
        className={cn(
          'absolute top-0 left-0 size-2 rounded-full',
          back ? 'bg-muted-foreground' : 'bg-brand'
        )}
      />
    </span>
  );
}

/** A voice message as Telegram draws it: play, a waveform, its length. */
function VoiceMessage() {
  return (
    <span className="flex items-center gap-2.5 py-1">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
        <HugeiconsIcon
          icon={PlayIcon}
          strokeWidth={2}
          aria-hidden
          className="size-4 fill-current"
        />
      </span>
      <span className="flex flex-col gap-1">
        <span className="flex h-4 items-center gap-0.5">
          {waveform.map((height, index) => (
            <span
              key={index}
              className={cn('w-0.5 rounded-full bg-received-muted/60', height)}
            />
          ))}
        </span>
        <span className="text-xs text-received-muted tabular-nums">0:07</span>
      </span>
    </span>
  );
}

/** The bars' heights, written out whole so Tailwind sees each class. */
const waveform = [
  'h-0.75',
  'h-1.25',
  'h-2',
  'h-1.5',
  'h-2.5',
  'h-1.75',
  'h-3',
  'h-2.25',
  'h-1.5',
  'h-2.75',
  'h-2',
  'h-1.25',
  'h-2.25',
  'h-3',
  'h-1.75',
  'h-1',
  'h-2',
  'h-1.5',
  'h-0.75',
  'h-1.25',
];
