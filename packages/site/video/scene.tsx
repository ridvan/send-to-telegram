import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { during, easeInOut, progress, rise } from './motion';

/** How long one scene fades over the last. */
export const crossfade = 12;

/** A scene, on the page's background, fading in over the one before it. */
export function Scene({ children }: { children: ReactNode }) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      className="bg-background text-foreground"
      style={{ opacity: progress(frame, 0, crossfade, easeInOut) }}
    >
      {children}
    </AbsoluteFill>
  );
}

/**
 * What a scene shows, in a line and a sentence, where the store's screenshots
 * put theirs. Leave out `end` to keep it up.
 */
export function Heading({
  title,
  text,
  start = 4,
  end,
}: {
  title: string;
  text: string;
  start?: number;
  end?: number;
}) {
  const frame = useCurrentFrame();

  return (
    <div
      className="absolute top-12 left-20 flex max-w-4xl flex-col gap-3"
      style={{ opacity: during(frame, start, end) }}
    >
      <h1
        className="font-heading text-6xl leading-none tracking-tight"
        style={rise(frame, start, 16)}
      >
        {title}
      </h1>
      <p
        className="text-2xl text-muted-foreground"
        style={rise(frame, start + 5, 16)}
      >
        {text}
      </p>
    </div>
  );
}
