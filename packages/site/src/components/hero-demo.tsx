import {
  ArrowRight01Icon,
  LockIcon,
  PauseIcon,
  PlayIcon,
  PuzzleIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useRef, useState } from 'react';

import { AppMark } from '@/components/app-mark';
import { Accent, ChatWindow, DayMarker, Outgoing } from '@/components/chat';
import { PhotoArt } from '@/components/photo-art';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ingredients, note } from '@/lib/demo';
import { useInView, usePrefersStill } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** How long each typed character takes, in milliseconds. */
const keystroke = 55;

/** When each moment of the demo happens, in milliseconds from the start. */
const at = {
  select: 600,
  menu: 1600,
  submenu: 2300,
  pick: 2900,
  // The menu closes and the toolbar button shows its check, as it does.
  sent: 3400,
  badgeGone: 5400,
  // The toolbar button is clicked and the popup opens.
  open: 6000,
  attach: 7100,
  typing: 7900,
  send: 9400,
  delivered: 10200,
  close: 14200,
  end: 14700,
} as const;

/** The frame shown without motion: the photo sent from the open popup. */
const stillFrame = at.delivered + 400;

/** Every time the picture changes, so the clock only wakes for those. */
const marks = [
  ...Object.values(at),
  at.attach + 250,
  at.send + 200,
  ...Array.from(
    { length: note.length },
    (_, index) => at.typing + index * keystroke
  ),
].sort((first, second) => first - second);

/** Moments worth a still picture, such as for the store listings. */
const moments = {
  menu: at.pick,
  draft: at.send - 50,
  sent: stillFrame,
} as const;

/**
 * The whole idea, on a loop. Text is selected on a page and sent from the
 * right-click menu, and the toolbar button checks it off. Then the extension's
 * popup opens from that button, a photo is attached, a note typed, and sent.
 */
export function HeroDemo({
  hold,
}: {
  /** Holds the demo at one moment instead of playing it. */
  hold?: keyof typeof moments;
}) {
  const moment = hold === undefined ? undefined : moments[hold];
  const [clock, setClock] = useState(0);
  const [paused, setPaused] = useState(false);
  const figure = useRef<HTMLElement>(null);
  const inView = useInView(figure);
  const prefersStill = usePrefersStill();
  const still = moment !== undefined || prefersStill;
  const time = moment ?? (prefersStill ? stillFrame : clock);

  useEffect(() => {
    if (still || paused || !inView) return;

    const next = marks.find((mark) => mark > clock);

    const timer = window.setTimeout(
      () => setClock(next ?? 0),
      next === undefined ? 0 : next - clock
    );

    return () => window.clearTimeout(timer);
  }, [clock, paused, still, inView]);

  const after = (moment: number) => time >= moment;
  const between = (start: number, end: number) => time >= start && time < end;

  const open = between(at.open, at.close);

  const typed = after(at.typing)
    ? note.slice(0, Math.floor((time - at.typing) / keystroke) + 1)
    : '';

  const drafting = between(at.attach + 250, at.send);

  return (
    <figure ref={figure}>
      <figcaption className="sr-only">
        Ingredients selected on a recipe page are sent to the Kitchen chat from
        the right-click menu. Then the extension’s popup opens from its toolbar
        button, a photo is attached with the note “For Sunday #recipes”, and
        sent.
      </figcaption>
      <div className="relative">
        <BrowserWindow
          selected={after(at.select)}
          badge={between(at.sent, at.badgeGone)}
          pressed={open}
          menu={
            between(at.menu, at.sent) ? (
              <ContextMenu
                submenu={after(at.submenu)}
                picked={after(at.pick)}
              />
            ) : null
          }
        />
        {open ? (
          <div className="absolute top-12 right-2 h-96 w-80 animate-popup rounded-2xl shadow-2xl sm:right-4 sm:h-104">
            <ChatWindow
              name="Kitchen"
              tone="green"
              pattern="doodles"
              attach
              note={drafting ? typed : undefined}
              typing={drafting && after(at.typing)}
              pressed={
                between(at.attach, at.attach + 250)
                  ? 'attach'
                  : between(at.send, at.send + 200)
                    ? 'send'
                    : undefined
              }
            >
              <DayMarker>Today</DayMarker>
              <Outgoing time="18:32" button="Open page">
                {ingredients.join('\n')}
              </Outgoing>
              {drafting ? (
                <Outgoing
                  time="18:34"
                  draft
                  media={<PhotoArt scene="dusk" className="aspect-3/2" />}
                  className="animate-rise"
                >
                  {typed ? <Caption text={typed} /> : null}
                </Outgoing>
              ) : null}
              {after(at.send) ? (
                <Outgoing
                  time="18:34"
                  status={after(at.delivered) ? 'sent' : 'sending'}
                  media={<PhotoArt scene="dusk" className="aspect-3/2" />}
                >
                  <Caption text={note} />
                </Outgoing>
              ) : null}
            </ChatWindow>
          </div>
        ) : null}
        {still ? null : (
          <Button
            variant="outline"
            size="sm"
            tone="muted"
            className="absolute bottom-3 left-3"
            onClick={() => setPaused((value) => !value)}
          >
            <HugeiconsIcon
              icon={paused ? PlayIcon : PauseIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {paused ? 'Play' : 'Pause'}
          </Button>
        )}
      </div>
    </figure>
  );
}

/** A note with its hashtag in the link color, as the chat shows it. */
export function Caption({ text }: { text: string }) {
  const [words, tag] = text.split('#');

  return (
    <>
      {words}
      {tag === undefined ? null : <Accent>#{tag}</Accent>}
    </>
  );
}

/**
 * A page in a browser, with a recipe's ingredients being selected, and the
 * toolbar the extension's button sits in.
 */
export function BrowserWindow({
  selected,
  badge,
  pressed,
  menu,
}: {
  selected: boolean;
  /** The check the button shows for a moment after a send. */
  badge: boolean;
  /** The button is held down while its popup is open. */
  pressed: boolean;
  menu: React.ReactNode;
}) {
  return (
    <div
      inert
      className="relative flex h-120 flex-col overflow-hidden rounded-2xl border bg-background select-none"
    >
      <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
        <span aria-hidden className="hidden gap-1.5 sm:flex">
          <span className="size-2.5 rounded-full bg-muted-foreground/20" />
          <span className="size-2.5 rounded-full bg-muted-foreground/20" />
          <span className="size-2.5 rounded-full bg-muted-foreground/20" />
        </span>
        <span className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-3 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={LockIcon}
            strokeWidth={2}
            aria-hidden
            className="size-3 shrink-0"
          />
          <span className="truncate">bakehouse.example/country-loaf</span>
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="flex size-7 items-center justify-center">
            <HugeiconsIcon
              icon={PuzzleIcon}
              strokeWidth={1.8}
              aria-hidden
              className="size-4"
            />
          </span>
          <span
            className={cn(
              'relative flex size-7 items-center justify-center rounded-md transition-colors duration-150',
              pressed && 'bg-muted ring-1 ring-border'
            )}
          >
            <AppMark size="sm" />
            {badge ? (
              <span className="absolute -right-1 -bottom-1 flex size-3.5 animate-pop items-center justify-center rounded-sm bg-success text-success-foreground">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={3}
                  aria-hidden
                  className="size-2.5"
                />
              </span>
            ) : null}
          </span>
        </span>
      </div>
      <div className="relative min-h-0 flex-1 px-6 py-6 sm:px-10 sm:py-8">
        <p className="text-xs font-medium text-muted-foreground">
          Bread · 12 min read
        </p>
        <p className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
          A weeknight country loaf
        </p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Mix it after dinner, shape it before bed, and bake it while the kettle
          boils.
        </p>
        <div className="mt-5 flex max-w-md gap-4">
          <PhotoArt
            scene="dusk"
            className="hidden aspect-3/2 w-40 shrink-0 rounded-lg sm:block"
          />
          <div className="relative min-w-0 flex-1">
            <p className="text-sm font-semibold">Ingredients</p>
            <ul className="relative mt-2 flex flex-col gap-1 text-sm">
              {ingredients.map((line) => (
                <li key={line}>
                  <span
                    data-selected={selected ? '' : undefined}
                    className="selection-sweep"
                  >
                    {line}
                  </span>
                </li>
              ))}
              {menu}
            </ul>
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold">Method</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Stir the starter into the water until it’s milky, then add the flour
          and rest it for half an hour before the salt goes in.
        </p>
      </div>
    </div>
  );
}

const chats = [
  { name: 'Me', tone: 'blue' },
  { name: 'Kitchen', tone: 'green' },
  { name: 'Reading list', tone: 'orange' },
] as const;

/** The browser's right-click menu, with the extension's item and its chats. */
export function ContextMenu({
  submenu,
  picked,
}: {
  submenu: boolean;
  picked: boolean;
}) {
  return (
    <div className="absolute top-10 left-10 z-10 flex items-start">
      <div className="flex w-64 animate-menu flex-col rounded-lg border bg-popover p-1 text-sm whitespace-nowrap text-popover-foreground shadow-lg">
        <MenuRow muted>Copy</MenuRow>
        <MenuRow muted>Search the web</MenuRow>
        <Separator className="my-1" />
        <MenuRow active={submenu}>
          <AppMark size="sm" />
          <span className="flex-1">Send selection to Telegram</span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            aria-hidden
            className="size-3.5 text-muted-foreground"
          />
        </MenuRow>
      </div>
      {submenu ? (
        <div className="-ml-1 hidden w-40 animate-menu flex-col rounded-lg border bg-popover p-1 text-sm whitespace-nowrap text-popover-foreground shadow-lg sm:mt-18 sm:flex">
          {chats.map((chat) => (
            <MenuRow key={chat.name} active={picked && chat.name === 'Kitchen'}>
              <Avatar size="xs">
                <AvatarFallback tone={chat.tone}>
                  {chat.name.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              {chat.name}
            </MenuRow>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({
  active = false,
  muted = false,
  children,
}: {
  active?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-150',
        active && 'bg-accent text-accent-foreground',
        muted && 'text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}
