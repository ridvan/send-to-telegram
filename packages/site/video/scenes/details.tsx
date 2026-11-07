import { LockIcon } from '@hugeicons/core-free-icons';
import type { ChatPattern } from '@send-to-telegram/core/chat-patterns';
import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

import { ChatWallpaper } from '@/components/chat';
import { IconTile } from '@/components/icon-tile';
import { PhotoArt } from '@/components/photo-art';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { features, type FeatureId } from '@/lib/features';
import { cn } from '@/lib/utils';

import { rise, typed } from '../motion';
import { Heading, Scene } from '../scene';

/*
 * The store's last screenshot, with each detail's picture doing what it
 * says: picking a chat, a hashtag, pressing the shortcut, and so on.
 */

export const detailsScene = 300;

/** When the details start moving, after they've all arrived. */
const play = 60;

/** Each detail's picture, drawn at a frame of its own. */
const arts = {
  chats: chatsArt,
  hashtags: hashtagArt,
  shortcut: shortcutArt,
  history: historyArt,
  lock: lockArt,
  looks: looksArt,
} satisfies { [id in FeatureId]: (frame: number) => ReactNode };

export function DetailsScene() {
  const frame = useCurrentFrame();

  return (
    <Scene>
      <Heading
        title="Yours, down to the details"
        text="No account and no analytics. Your chats and history stay in your browser."
      />
      <ul className="absolute top-48 right-20 left-20 grid grid-cols-3 gap-x-12 gap-y-8">
        {features.map((feature, index) => (
          <li
            key={feature.id}
            className="flex flex-col gap-3"
            style={rise(frame, 14 + index * 5, 16)}
          >
            <div className="flex h-28 items-center">
              {arts[feature.id](frame - play - index * 12)}
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{feature.title}</h2>
              <p className="text-base text-pretty text-muted-foreground">
                {feature.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Scene>
  );
}

/** Which of a few states a picture is in, moving on every `every` frames. */
function step(frame: number, count: number, every: number) {
  return frame < 0 ? 0 : Math.floor(frame / every) % count;
}

const chats = [
  { name: 'Me', tone: 'blue' },
  { name: 'Kitchen', tone: 'green' },
  { name: 'Design links', tone: 'pink' },
] as const;

function chatsArt(frame: number) {
  const active = step(frame, chats.length, 26);

  return (
    <div className="flex w-52 flex-col rounded-lg border bg-popover p-1 text-sm text-popover-foreground">
      {chats.map((chat, index) => (
        <span
          key={chat.name}
          className={cn(
            'flex h-8 items-center gap-2 rounded-md px-2',
            index === active && 'bg-accent'
          )}
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

function hashtagArt(frame: number) {
  const words = 'Worth a second look ';
  const tag = frame < 0 ? '' : typed(frame, '#rea', 10, 4);
  const picked = frame >= 56;
  const note = picked ? `${words}#reading` : `${words}${tag}`;
  const asking = tag !== '' && !picked;

  return (
    <div className="flex w-60 flex-col justify-end gap-1.5 self-stretch">
      {asking ? (
        <div className="flex w-36 flex-col rounded-lg border bg-popover p-1 text-sm text-popover-foreground">
          <span className="flex h-7 items-center rounded-md bg-accent px-2">
            #reading
          </span>
          {tag === '#' || tag === '#r' ? (
            <span className="flex h-7 items-center px-2">#recipes</span>
          ) : null}
        </div>
      ) : null}
      <div className="flex h-10 items-center rounded-xl border px-3 text-sm">
        {note}
        <span className="ml-px h-4 w-px bg-foreground" />
      </div>
    </div>
  );
}

const keys = ['Alt', 'Shift', 'S'];

function shortcutArt(frame: number) {
  // Each key goes down in turn, and all three come up together.
  const down = frame < 0 ? 0 : Math.floor((frame % 72) / 8) + 1;

  return (
    <KbdGroup>
      {keys.map((key, index) => (
        <span
          key={key}
          className={cn(
            'block',
            index < down && down < 6 && 'translate-y-1 scale-95 opacity-60'
          )}
        >
          <Kbd size="lg">{key}</Kbd>
        </span>
      ))}
    </KbdGroup>
  );
}

const keeps = [
  { value: 'all', label: 'Everything' },
  { value: 'times', label: 'Only times' },
  { value: 'none', label: 'Nothing' },
];

function historyArt(frame: number) {
  const chosen = keeps[step(frame, keeps.length, 30)]?.value ?? 'all';

  return (
    <ToggleGroup variant="segmented" value={[chosen]}>
      {keeps.map((keep) => (
        <ToggleGroupItem key={keep.value} value={keep.value}>
          {keep.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function lockArt(frame: number) {
  const dots = frame < 0 ? 0 : Math.min(9, Math.floor(frame / 3));

  return (
    <div className="flex items-center gap-3">
      <IconTile icon={LockIcon} tone="violet" />
      <span className="flex h-10 w-44 items-center gap-1.5 rounded-xl border px-3">
        {Array.from({ length: dots }, (_, index) => (
          <span key={index} className="size-1.5 rounded-full bg-foreground" />
        ))}
        {dots < 9 ? <span className="h-4 w-px bg-foreground" /> : null}
      </span>
    </div>
  );
}

const looks: (ChatPattern | 'photo')[] = ['doodles', 'space', 'waves', 'photo'];

function looksArt(frame: number) {
  const chosen = step(frame, looks.length, 24);

  return (
    <div className="flex items-center gap-2.5">
      {looks.map((look, index) => (
        <span
          key={look}
          className={cn(
            'relative flex h-24 w-16 flex-col justify-end gap-1.5 overflow-hidden rounded-xl border bg-chat p-2',
            index === chosen &&
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
