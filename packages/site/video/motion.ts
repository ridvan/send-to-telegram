import type { CSSProperties } from 'react';
import { Easing, interpolate } from 'remotion';

/*
 * Motion by frame. The site's curves, so the video moves the way the site
 * does, at 30 frames a second.
 */

export const fps = 30;

/** The site's `--ease-out-strong`, for things arriving. */
export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

/** The site's `--ease-in-out-strong`, for things moving across. */
export const easeInOut = Easing.bezier(0.77, 0, 0.175, 1);

/** How far along a change is, from 0 before `start` to 1 after it's done. */
export function progress(
  frame: number,
  start: number,
  duration: number,
  easing = easeOut
) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
}

/** A value part of the way from one number to another. */
export function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

/** The site's `animate-rise`: up a little, out of a blur. */
export function rise(frame: number, start: number, duration = 12) {
  const amount = progress(frame, start, duration);

  return {
    opacity: amount,
    translate: `0 ${mix(12, 0, amount)}px`,
    filter: amount < 1 ? `blur(${mix(4, 0, amount)}px)` : 'none',
  } satisfies CSSProperties;
}

/**
 * Shown from `start` until `end`, fading in and out over a few frames. With
 * no `end`, it stays.
 */
export function during(
  frame: number,
  start: number,
  end: number | undefined,
  fade = 8
) {
  const shown = progress(frame, start, fade);

  return end === undefined
    ? shown
    : Math.min(shown, 1 - progress(frame, end, fade));
}

/** A stop on a path: the frame it's reached, and where it is then. */
export type Stop = readonly [frame: number, x: number, y: number];

/**
 * Where something moving between stops is: still at each stop, and easing
 * across between them.
 */
export function along(frame: number, stops: readonly Stop[]) {
  const first = stops[0];

  if (!first) return { x: 0, y: 0 };

  let from = first;

  for (const to of stops) {
    if (frame <= to[0]) {
      const amount =
        from === to ? 1 : progress(frame, from[0], to[0] - from[0], easeInOut);

      return { x: mix(from[1], to[1], amount), y: mix(from[2], to[2], amount) };
    }

    from = to;
  }

  return { x: from[1], y: from[2] };
}

/** How far a button is pushed in, peaking on each click's frame. */
export function pressed(frame: number, clicks: readonly number[]) {
  return Math.max(
    0,
    ...clicks.map((click) =>
      interpolate(frame, [click - 3, click, click + 5], [0, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    )
  );
}

/** Text typed from `start`, a character every `every` frames. */
export function typed(frame: number, text: string, start: number, every = 2) {
  if (frame < start) return '';

  return text.slice(0, Math.floor((frame - start) / every) + 1);
}
