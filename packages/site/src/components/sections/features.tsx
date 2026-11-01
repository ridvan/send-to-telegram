import { LockIcon } from '@hugeicons/core-free-icons';
import type { ChatPattern } from '@send-to-telegram/core/chat-patterns';
import type { ReactNode } from 'react';

import { ChatWallpaper } from '@/components/chat';
import { IconTile } from '@/components/icon-tile';
import { PhotoArt } from '@/components/photo-art';
import { SectionHeading } from '@/components/section-heading';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

type Feature = { title: string; text: string; art: ReactNode };

const features: Feature[] = [
  {
    title: 'More than one chat',
    text: 'Send to yourself, a group or a channel. With several chats, the menu asks which one.',
    art: <ChatsArt />,
  },
  {
    title: 'Hashtags as you type',
    text: 'Type # in the note to pick a saved tag, so messages are easy to find in Telegram later.',
    art: <HashtagArt />,
  },
  {
    title: 'One shortcut for the page',
    text: 'Sends the page you’re on without opening anything. Another one opens the popup.',
    art: <ShortcutArt />,
  },
  {
    title: 'History you control',
    text: 'Search what you sent and send it again, or keep only the times, or nothing. Private windows never leave a trace.',
    art: <HistoryArt />,
  },
  {
    title: 'An optional password lock',
    text: 'Encrypts your chats, tokens and history in the browser, and asks for the password when the browser starts.',
    art: <LockArt />,
  },
  {
    title: 'Your chat, your look',
    text: 'Light and dark, six backgrounds, or a photo of your own.',
    art: <LooksArt />,
  },
];

/** Every detail's picture and name, larger, for the store pictures. */
export function FeatureTiles() {
  return (
    <ul className="grid grid-cols-3 gap-x-12 gap-y-10">
      {features.map((feature) => (
        <FeatureItem key={feature.title} feature={feature} large />
      ))}
    </ul>
  );
}

export function Features() {
  return (
    <section
      aria-labelledby="details"
      className="page flex flex-col gap-14 py-24"
    >
      <SectionHeading id="details" title="The details" />
      <ul className="grid gap-x-12 gap-y-12 sm:grid-cols-2 sm:gap-y-16 lg:grid-cols-3">
        {features.map((feature) => (
          <FeatureItem key={feature.title} feature={feature} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One detail: its picture, name and line. Large in the store pictures, where
 * it's the page's own heading.
 */
function FeatureItem({
  feature,
  large = false,
}: {
  feature: Feature;
  large?: boolean;
}) {
  const Heading = large ? 'h2' : 'h3';

  return (
    <li className={cn('flex flex-col', large ? 'gap-3' : 'gap-4')}>
      <div
        inert
        aria-hidden
        className={cn(
          'flex h-28 items-center select-none',
          !large && 'sm:h-36'
        )}
      >
        {feature.art}
      </div>
      <div className="flex flex-col gap-1.5">
        <Heading className={cn('font-semibold', large && 'text-xl')}>
          {feature.title}
        </Heading>
        <p
          className={cn(
            'text-muted-foreground',
            large ? 'text-lg text-pretty' : 'text-sm'
          )}
        >
          {feature.text}
        </p>
      </div>
    </li>
  );
}

function ChatsArt() {
  const chats = [
    { name: 'Me', tone: 'blue' },
    { name: 'Kitchen', tone: 'green' },
    { name: 'Design links', tone: 'pink' },
  ] as const;

  return (
    <div className="flex w-52 flex-col rounded-lg border bg-popover p-1 text-sm text-popover-foreground">
      {chats.map((chat, index) => (
        <span
          key={chat.name}
          className={
            index === 2
              ? 'flex h-8 items-center gap-2 rounded-md bg-accent px-2'
              : 'flex h-8 items-center gap-2 px-2'
          }
        >
          <Avatar size="xs">
            <AvatarFallback tone={chat.tone}>
              {chat.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          {chat.name}
        </span>
      ))}
    </div>
  );
}

function HashtagArt() {
  return (
    <div className="flex w-60 flex-col gap-1.5">
      <div className="flex w-36 flex-col rounded-lg border bg-popover p-1 text-sm text-popover-foreground">
        <span className="flex h-7 items-center rounded-md bg-accent px-2">
          #reading
        </span>
        <span className="flex h-7 items-center px-2">#recipes</span>
      </div>
      <div className="flex h-10 items-center rounded-xl border px-3 text-sm">
        Worth a second look #rea
        <span className="ml-px h-4 w-px animate-pulse bg-foreground" />
      </div>
    </div>
  );
}

function ShortcutArt() {
  return (
    <KbdGroup>
      <Kbd size="lg">Alt</Kbd>
      <Kbd size="lg">Shift</Kbd>
      <Kbd size="lg">S</Kbd>
    </KbdGroup>
  );
}

function HistoryArt() {
  return (
    <ToggleGroup variant="segmented" defaultValue={['all']}>
      <ToggleGroupItem value="all">Everything</ToggleGroupItem>
      <ToggleGroupItem value="times">Only times</ToggleGroupItem>
      <ToggleGroupItem value="none">Nothing</ToggleGroupItem>
    </ToggleGroup>
  );
}

function LockArt() {
  return (
    <div className="flex items-center gap-3">
      <IconTile icon={LockIcon} tone="violet" />
      <span className="flex h-10 w-44 items-center gap-1.5 rounded-xl border px-3">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} className="size-1.5 rounded-full bg-foreground" />
        ))}
      </span>
    </div>
  );
}

const looks: (ChatPattern | 'photo')[] = ['doodles', 'space', 'waves', 'photo'];

/** Telegram's background picker: small chats, each on its own wallpaper. */
function LooksArt() {
  return (
    <div className="flex items-center gap-2.5">
      {looks.map((look, index) => (
        <span
          key={look}
          className={cn(
            'relative flex h-24 w-16 flex-col justify-end gap-1.5 overflow-hidden rounded-xl border bg-chat p-2',
            index === 0 &&
              'ring-2 ring-foreground/70 ring-offset-2 ring-offset-background'
          )}
        >
          {look === 'photo' ? (
            <PhotoArt scene="dusk" className="absolute inset-0 h-full" />
          ) : (
            <ChatWallpaper pattern={look} scale={0.45} />
          )}
          <span className="relative h-2.5 w-8 rounded-full bg-received" />
          <span className="relative h-2.5 w-9 self-end rounded-full bg-bubble" />
        </span>
      ))}
    </div>
  );
}
