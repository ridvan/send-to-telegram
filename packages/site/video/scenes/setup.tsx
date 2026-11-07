import { Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

import { Cursor } from '../cursor';
import { along, pressed, progress, rise, type Stop } from '../motion';
import { Heading, Scene } from '../scene';

/*
 * Getting started, in its three steps: BotFather's token, pasted on the
 * welcome page, then Start in the bot's chat, and the chat shows up.
 */

export const setupScene = 240;

const at = { reply: 34, paste: 92, checked: 104, start: 168, linked: 178 };

const token = '123456789:AAH4kYbPq…';

const pointer: readonly Stop[] = [
  [0, 760, 700],
  [at.paste - 18, 760, 700],
  [at.paste - 2, 560, 418],
  [at.start - 22, 560, 418],
  [at.start, 1000, 497],
  [220, 1000, 497],
  [236, 1100, 640],
];

export function SetupScene() {
  const frame = useCurrentFrame();
  const after = (moment: number) => frame >= moment;

  return (
    <Scene>
      <Heading
        title="Set up in about two minutes"
        text="There’s no chat ID to look up: press Start, and the chat shows up by itself."
      />
      <ol className="absolute top-50 right-20 left-20 grid grid-cols-3 gap-8">
        <Step index={1} title="Create a bot with @BotFather" frame={frame}>
          <div className="flex flex-col gap-2 text-sm">
            <span
              className="self-end rounded-2xl rounded-br-sm bg-bubble px-3 py-1.5 font-mono text-bubble-foreground"
              style={rise(frame, 18)}
            >
              /newbot
            </span>
            {after(at.reply) ? (
              <span
                className="flex max-w-[85%] flex-col gap-1 self-start rounded-2xl rounded-bl-sm bg-received px-3 py-1.5 text-received-foreground shadow-xs"
                style={rise(frame, at.reply)}
              >
                Done! Use this token to access the HTTP API:
                <span className="w-fit rounded-sm bg-bubble px-1 font-mono text-bubble-accent">
                  {token}
                </span>
              </span>
            ) : null}
          </div>
        </Step>
        <Step index={2} title="Paste its token" frame={frame}>
          <div className="flex flex-col gap-2 self-stretch rounded-xl bg-card p-4">
            <span className="text-sm font-medium">Bot token</span>
            <span className="flex h-9 items-center gap-2 rounded-lg border px-3 font-mono text-sm">
              {after(at.paste) ? (
                <span className="flex-1 truncate">{token}</span>
              ) : (
                <span className="flex-1 truncate text-muted-foreground">
                  123456789:AAH4kYbPq…
                </span>
              )}
              {after(at.checked) ? (
                <span style={rise(frame, at.checked, 8)}>
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    aria-hidden
                    className="size-4 text-success"
                  />
                </span>
              ) : null}
            </span>
            <span className="text-sm text-muted-foreground">
              {after(at.checked)
                ? 'Works for @alex_notes_bot.'
                : 'Keep it private. Anyone with it can post as your bot.'}
            </span>
          </div>
        </Step>
        <Step index={3} title="Press Start in your bot" frame={frame}>
          <div className="flex flex-col items-stretch gap-3 self-stretch">
            {after(at.linked) ? (
              <span
                className="flex h-12 items-center gap-3 rounded-xl bg-card px-3"
                style={rise(frame, at.linked)}
              >
                <Avatar size="sm">
                  <AvatarFallback tone="blue">A</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium">Alex</span>
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  aria-hidden
                  className="size-4 text-success"
                />
              </span>
            ) : (
              <span
                className={cn(
                  'flex h-12 items-center justify-center rounded-xl bg-brand text-sm font-semibold tracking-wide text-brand-foreground uppercase'
                )}
                style={{ scale: 1 - pressed(frame, [at.start]) * 0.05 }}
              >
                Start
              </span>
            )}
          </div>
        </Step>
      </ol>
      <Cursor
        {...along(frame, pointer)}
        press={pressed(frame, [at.paste, at.start])}
        opacity={progress(frame, at.paste - 20, 8)}
      />
    </Scene>
  );
}

/** One step: its number and what to do, over a picture of it. */
function Step({
  index,
  title,
  frame,
  children,
}: {
  index: number;
  title: string;
  frame: number;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-4" style={rise(frame, 10 + index * 6, 16)}>
      <span className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
          {index}
        </span>
        <span className="text-xl font-semibold">{title}</span>
      </span>
      <div className="flex h-64 flex-col justify-center rounded-2xl border bg-chat p-5">
        {children}
      </div>
    </li>
  );
}
