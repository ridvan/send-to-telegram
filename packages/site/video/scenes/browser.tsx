import { useCurrentFrame } from 'remotion';

import { Accent, ChatWindow, DayMarker, Outgoing } from '@/components/chat';
import { BrowserWindow, Caption, ContextMenu } from '@/components/hero-demo';
import { PhotoArt } from '@/components/photo-art';
import { ingredients, note } from '@/lib/demo';

import { Cursor } from '../cursor';
import {
  along,
  easeInOut,
  mix,
  pressed,
  progress,
  rise,
  typed,
  type Stop,
} from '../motion';
import { Heading, Scene } from '../scene';

/*
 * The store's second and third screenshots, played: ingredients are selected
 * on a recipe and sent to Kitchen from the right-click menu, then the popup
 * opens from the toolbar, a photo is attached, a note typed with a hashtag
 * picked as it's typed, and sent. Drawn where the screenshots put it, with
 * the camera moving in on the menu and the popup.
 */

export const browserScene = 480;

/** When each moment happens, in frames from the scene's start. */
const at = {
  press: 42,
  release: 74,
  rightClick: 88,
  row: 112,
  submenu: 116,
  kitchen: 146,
  pick: 154,
  // The menu closes and the toolbar button checks the send off.
  sent: 160,
  swap: 220,
  badgeGone: 228,
  open: 252,
  attach: 300,
  typing: 324,
  pickTag: 362,
  send: 392,
  delivered: 412,
} as const;

const typedNote = 'For Sunday #rec';

/** Each ingredient's line: its middle, and where its text ends. */
const lines = [
  { y: 428, end: 455 },
  { y: 452, end: 378 },
  { y: 476, end: 413 },
  { y: 500, end: 356 },
];

const lineStart = 297;

/**
 * How much of each line the drag has selected: every line above the pointer
 * whole, and its own line up to it, as a browser selects.
 */
function selection(frame: number, x: number, y: number) {
  if (frame < at.press) return lines.map(() => 0);

  if (frame >= at.release) return lines.map(() => 1);

  return lines.map((line) => {
    if (y > line.y + 12) return 1;

    if (y < line.y - 12) return 0;

    return Math.min(1, Math.max(0, (x - lineStart) / (line.end - lineStart)));
  });
}

const pointer: readonly Stop[] = [
  [0, 1000, 690],
  [12, 1000, 690],
  [40, 297, 430],
  [58, 430, 466],
  [at.release, 357, 502],
  [at.rightClick - 6, 352, 470],
  [at.rightClick, 338, 461],
  [at.row - 2, 470, 553],
  [134, 604, 553],
  [at.kitchen, 652, 584],
  [at.swap + 2, 652, 584],
  [at.open - 4, 1169, 216],
  [at.open + 10, 1169, 216],
  [at.attach - 4, 886, 633],
  [at.typing + 6, 886, 633],
  [at.send - 4, 1155, 633],
  [at.send + 30, 1155, 633],
  [460, 1240, 700],
];

/**
 * Where the camera looks: the point that stays put and how far it's zoomed,
 * eased between stops.
 */
/** A camera stop: its frame, the point that stays put, and the zoom. */
type Shot = readonly [frame: number, x: number, y: number, zoom: number];

const camera: readonly Shot[] = [
  [24, 640, 432, 1],
  [76, 470, 500, 1.3],
  [at.pick + 4, 470, 500, 1.3],
  [at.sent + 22, 1169, 216, 1.3],
  [at.open - 2, 1169, 216, 1.3],
  [at.open + 36, 1024, 448, 1.28],
  [at.delivered + 26, 1024, 448, 1.28],
  [at.delivered + 56, 640, 432, 1],
];

function look(frame: number) {
  let from = camera[0] ?? [0, 640, 360, 1];

  for (const to of camera) {
    if (frame <= to[0]) {
      const amount =
        from === to ? 1 : progress(frame, from[0], to[0] - from[0], easeInOut);

      return {
        x: mix(from[1], to[1], amount),
        y: mix(from[2], to[2], amount),
        zoom: mix(from[3], to[3], amount),
      };
    }

    from = to;
  }

  return { x: from[1], y: from[2], zoom: from[3] };
}

export function BrowserScene() {
  const frame = useCurrentFrame();
  const after = (moment: number) => frame >= moment;
  const between = (start: number, end: number) => frame >= start && frame < end;

  const view = look(frame);
  const mouse = along(frame, pointer);
  const selected = selection(frame, mouse.x, mouse.y);

  const clicks = [
    at.press,
    at.rightClick,
    at.pick,
    at.open,
    at.attach,
    at.send,
  ];

  const open = after(at.open);
  const opening = progress(frame, at.open, 9);
  const drafting = between(at.attach + 6, at.send);
  const tagPicked = after(at.pickTag);
  const draft = tagPicked ? `${note} ` : typed(frame, typedNote, at.typing);

  const query =
    draft.includes('#') && !tagPicked ? draft.split('#')[1] : undefined;

  return (
    <Scene>
      <Heading
        title="Right-click to send"
        text="Selected text, a link, an image or the whole page, to any of your chats."
        end={at.swap}
      />
      <Heading
        title="Add a note, a photo or a hashtag"
        text="The popup shows your message the way it will arrive."
        start={at.swap + 6}
      />
      <div
        className="absolute inset-0"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 168px, black 186px)',
        }}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            translate: `${view.x * (1 - view.zoom)}px ${view.y * (1 - view.zoom)}px`,
            scale: view.zoom,
          }}
        >
          <div
            className="absolute top-48 left-20 w-280"
            style={{
              ...rise(frame, 6, 18),
              ...Object.fromEntries(
                selected.map((amount, index) => [
                  `--sweep-${index + 1}`,
                  `${amount * 100}%`,
                ])
              ),
            }}
          >
            <BrowserWindow
              selected
              badge={between(at.sent + 4, at.badgeGone)}
              pressed={open}
              menu={
                between(at.rightClick + 2, at.sent) ? (
                  <ContextMenu
                    submenu={after(at.submenu)}
                    picked={after(at.kitchen + 2)}
                  />
                ) : null
              }
            />
            {open ? (
              <div
                className="absolute top-12 right-4 h-104 w-80 origin-top-right rounded-2xl shadow-2xl"
                style={{ opacity: opening, scale: mix(0.96, 1, opening) }}
              >
                <ChatWindow
                  name="Kitchen"
                  tone="green"
                  pattern="doodles"
                  attach
                  note={drafting ? draft : undefined}
                  typing={
                    drafting &&
                    (between(at.typing, at.pickTag + 8) ||
                      Math.floor(frame / 15) % 2 === 0)
                  }
                  pressed={
                    pressed(frame, [at.attach]) > 0.3
                      ? 'attach'
                      : pressed(frame, [at.send]) > 0.3
                        ? 'send'
                        : undefined
                  }
                >
                  <DayMarker>Today</DayMarker>
                  <Outgoing time="18:32" button="Open page">
                    {ingredients.join('\n')}
                  </Outgoing>
                  {drafting ? (
                    <div
                      className="flex flex-col"
                      style={rise(frame, at.attach + 6)}
                    >
                      <Outgoing
                        time="18:34"
                        draft
                        media={<PhotoArt scene="dusk" className="aspect-3/2" />}
                      >
                        {draft ? <Caption text={draft} /> : null}
                      </Outgoing>
                    </div>
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
                {query === undefined ? null : <Suggestions query={query} />}
              </div>
            ) : null}
          </div>
          <Cursor
            x={mouse.x}
            y={mouse.y}
            press={pressed(frame, clicks)}
            opacity={progress(frame, 10, 8)}
          />
        </div>
      </div>
    </Scene>
  );
}

const tags = ['#reading', '#recipes'];

/** The saved hashtags that match what's typed after #, above the note. */
function Suggestions({ query }: { query: string }) {
  const matches = tags.filter((tag) => tag.startsWith(`#${query}`));

  return (
    <div className="absolute bottom-13 left-3 flex w-36 flex-col rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-lg">
      {matches.map((tag, index) => (
        <span
          key={tag}
          className={
            index === matches.length - 1
              ? 'flex h-7 items-center rounded-md bg-accent px-2'
              : 'flex h-7 items-center px-2'
          }
        >
          <Accent>{tag}</Accent>
        </span>
      ))}
    </div>
  );
}
