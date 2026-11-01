import type { ReactNode } from 'react';

import { AppMark } from '@/components/app-mark';
import { PhotoArt } from '@/components/photo-art';
import { Rings } from '@/components/rings';
import { usePrefersStill } from '@/lib/motion';
import { cn } from '@/lib/utils';

/*
 * What you keep, drifting into the extension: a quote, a link, a photo and a
 * hashtag, each on a dashed path to the icon, with a dot travelling along it,
 * and faint rings around the icon. Drawn on a 440 by 330 grid; the cards sit
 * at the same points in percent.
 */

const paths = [
  'M196 72 C 238 72, 254 100, 262 124',
  'M174 186 C 198 184, 214 178, 234 172',
  'M226 244 C 242 238, 252 230, 258 222',
  'M270 42 C 288 60, 298 76, 300 94',
];

/** The icon at 68% across and halfway down, on the 440 by 330 grid. */
const center = { x: 299.2, y: 165 };

/**
 * Evenly spaced, starting clear of the icon's tile: it reaches about 72 from
 * the middle at its sides and 92 at its corners, so a smaller ring would only
 * show in slivers beside it.
 */
const rings = [104, 144, 184];

/** Where the rings have faded out, a little past the last one. */
const fadeRadius = 212;

export function HeroArt({ still: forced = false }: { still?: boolean }) {
  const prefersStill = usePrefersStill();
  const still = forced || prefersStill;

  return (
    <div aria-hidden className="relative aspect-4/3 w-full select-none">
      <Rings
        width={440}
        height={330}
        x={center.x}
        y={center.y}
        radii={rings}
        fade={fadeRadius}
      />
      <svg
        viewBox="0 0 440 330"
        className="absolute inset-0 size-full overflow-visible"
        fill="none"
      >
        {paths.map((path) => (
          <path
            key={path}
            d={path}
            className="stroke-muted-foreground/35"
            strokeWidth={1.25}
            strokeDasharray="3 5"
            strokeLinecap="round"
          />
        ))}
        {still
          ? null
          : paths.map((path, index) => (
              <circle key={path} r={3.5} className="fill-brand" opacity={0}>
                <animateMotion
                  path={path}
                  dur="3.2s"
                  begin={`${index * 0.8}s`}
                  repeatCount="indefinite"
                  keyPoints="0;1;1"
                  keyTimes="0;0.55;1"
                  calcMode="spline"
                  keySplines="0.65 0 0.35 1;0 0 1 1"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0;0"
                  keyTimes="0;0.1;0.45;0.55;1"
                  dur="3.2s"
                  begin={`${index * 0.8}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
      </svg>

      <span className="absolute top-1/2 left-[68%] -translate-1/2 rounded-4xl border bg-card p-3 shadow-lifted">
        <AppMark size="xl" />
      </span>

      <Floating x={25} y={21} tilt="-rotate-6">
        <span className="flex w-44 flex-col gap-1.5 rounded-xl border bg-background p-3 text-xs shadow-lg">
          <span className="text-muted-foreground">woodshop.example</span>
          <span className="w-fit bg-(--selection-ink) leading-snug font-medium">
            Measure twice, cut once.
          </span>
        </span>
      </Floating>

      <Floating x={21.5} y={56} tilt="rotate-3">
        <span className="flex w-40 flex-col rounded-xl border bg-background p-2.5 text-xs shadow-lg">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-3 rounded-full bg-linear-to-b from-tint-orange to-tint-orange-to" />
            bakehouse.example
          </span>
          <span className="mt-1 font-semibold">Pizza dough, the slow way</span>
        </span>
      </Floating>

      <Floating x={36} y={86} tilt="-rotate-4">
        <span className="block w-32 rounded-xl border bg-background p-1.5 shadow-lg">
          <PhotoArt scene="sea" className="aspect-4/3 rounded-lg" />
        </span>
      </Floating>

      <Floating x={59.5} y={9} tilt="rotate-6">
        <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-brand shadow-lg">
          #reading
        </span>
      </Floating>
    </div>
  );
}

/** A card at a point on the grid, tilted a little. */
function Floating({
  x,
  y,
  tilt,
  children,
}: {
  x: number;
  y: number;
  tilt: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn('absolute top-(--y) left-(--x) -translate-1/2', tilt)}
      style={{ '--x': `${x}%`, '--y': `${y}%` }}
    >
      {children}
    </span>
  );
}
