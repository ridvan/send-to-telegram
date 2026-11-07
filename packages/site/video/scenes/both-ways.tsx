import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

import {
  Accent,
  ChatWallpaper,
  ChatWindow,
  Incoming,
  Outgoing,
} from '@/components/chat';
import { PhotoArt } from '@/components/photo-art';
import { PlaneIcon } from '@/components/plane-icon';
import { VoiceMessage } from '@/components/sections/connect';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

import { easeInOut, mix, progress, rise } from '../motion';
import { Heading, Scene } from '../scene';

/*
 * What you send your bot from your phone, showing up in the popup: a link,
 * a photo and a voice message, each crossing over through Telegram.
 */

export const bothWaysScene = 270;

/** When each message leaves the phone; it reaches the popup a second later. */
const sends = [40, 100, 160];
const trip = 30;

/** The phone's and the popup's middles, which the messages travel between. */
const route = { from: 472, to: 720, y: 436 };

export function BothWaysScene() {
  const frame = useCurrentFrame();
  const arrived = (index: number) => sends[index] + trip;

  return (
    <Scene>
      <Heading
        title="Your own bot, both ways"
        text="Messages go straight to Telegram, and what you send your bot shows up here."
      />
      <div
        className="absolute top-49 left-45 h-120 w-68"
        style={rise(frame, 8, 18)}
      >
        <Phone>
          {[
            <Outgoing key="link" time="12:30">
              Read this on the train{' '}
              <Accent>trains.example/night-routes</Accent>
            </Outgoing>,
            <Outgoing
              key="photo"
              time="12:31"
              media={<PhotoArt scene="sea" className="aspect-3/2" />}
            />,
            <Outgoing key="voice" time="12:33">
              <VoiceMessage />
            </Outgoing>,
          ].map((message, index) =>
            frame >= sends[index] ? (
              <div
                key={message.key}
                className="flex flex-col"
                style={rise(frame, sends[index])}
              >
                {message}
              </div>
            ) : null
          )}
        </Phone>
      </div>
      <Route frame={frame} />
      <div
        className="absolute top-49 right-45 h-120 w-90 rounded-2xl shadow-2xl"
        style={rise(frame, 14, 18)}
      >
        <ChatWindow name="Notes to self" tone="cyan" pattern="space" attach>
          <Outgoing time="08:52">
            <Accent>news.example/rain-gardens</Accent>
          </Outgoing>
          {[
            <Incoming key="link" time="12:30">
              Read this on the train{' '}
              <Accent>trains.example/night-routes</Accent>
            </Incoming>,
            <Incoming
              key="photo"
              time="12:31"
              className="w-48"
              media={<PhotoArt scene="sea" className="aspect-3/2" />}
            />,
            <Incoming key="voice" time="12:33" timeInCorner>
              <VoiceMessage />
            </Incoming>,
          ].map((message, index) =>
            frame >= arrived(index) ? (
              <div
                key={message.key}
                className="flex flex-col"
                style={rise(frame, arrived(index))}
              >
                {message}
              </div>
            ) : null
          )}
        </ChatWindow>
      </div>
    </Scene>
  );
}

/** Telegram between the two, and each message's dot crossing over it. */
function Route({ frame }: { frame: number }) {
  const middle = (route.from + route.to) / 2;

  return (
    <div
      className="absolute inset-0"
      style={{ opacity: progress(frame, 20, 12) }}
    >
      <svg
        aria-hidden
        className="absolute inset-0 size-full"
        viewBox="0 0 1280 720"
        fill="none"
      >
        <path
          d={`M${route.from} ${route.y} H${route.to}`}
          className="stroke-muted-foreground/35"
          strokeWidth={1.25}
          strokeDasharray="3 5"
          strokeLinecap="round"
        />
        {sends.map((send) => {
          const amount = progress(frame, send, trip, easeInOut);
          const shown = amount > 0 && amount < 1;

          return shown ? (
            <circle
              key={send}
              cx={mix(route.from, route.to, amount)}
              cy={route.y}
              r={4}
              className="fill-brand"
            />
          ) : null;
        })}
      </svg>
      <span
        className="absolute flex size-14 -translate-1/2 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg"
        style={{ left: middle, top: route.y }}
      >
        <PlaneIcon className="size-6" />
      </span>
    </div>
  );
}

/** A phone open on the chat with your bot in Telegram. */
function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col overflow-hidden rounded-[2.75rem] border-6 border-muted bg-background shadow-2xl">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4 pt-2">
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          aria-hidden
          className="size-4 text-brand"
        />
        <Avatar size="sm">
          <AvatarFallback tone="cyan">A</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">Alex’s notes</span>
          <span className="text-xs text-muted-foreground">bot</span>
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden bg-chat">
        <ChatWallpaper pattern="doodles" />
        <div className="relative flex flex-col gap-2.5 p-3">{children}</div>
      </div>
      <div className="flex h-12 shrink-0 items-center border-t px-4 pb-1 text-sm text-muted-foreground">
        Message
      </div>
    </div>
  );
}
