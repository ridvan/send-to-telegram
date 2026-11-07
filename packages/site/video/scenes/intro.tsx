import { useCurrentFrame } from 'remotion';

import { AppMark } from '@/components/app-mark';
import { HeroArt } from '@/components/hero-art';

import { mix, progress, rise } from '../motion';
import { Scene } from '../scene';

/** The store's first screenshot, arriving: the name and the idea, then the art. */
export const introScene = 120;

export function IntroScene() {
  const frame = useCurrentFrame();
  const art = progress(frame, 10, 30);

  return (
    <Scene>
      <div className="relative flex size-full items-center gap-12 px-20">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <span
            className="flex items-center gap-3 text-2xl font-semibold tracking-tight"
            style={rise(frame, 4, 16)}
          >
            <AppMark size="md" />
            Send to Telegram
          </span>
          <h1
            className="font-heading text-7xl leading-none tracking-tight"
            style={rise(frame, 12, 20)}
          >
            Send text, links and images to Telegram
          </h1>
          <p
            className="text-2xl text-muted-foreground"
            style={rise(frame, 22, 20)}
          >
            Right-click anything on a page, or write in the popup.
          </p>
        </div>
        <div
          className="w-128 shrink-0"
          style={{
            opacity: art,
            // Settles in, then keeps drifting closer so the frame never sits still.
            scale: mix(0.92, 1, art) * mix(1, 1.04, frame / introScene),
          }}
        >
          <HeroArt still />
        </div>
      </div>
    </Scene>
  );
}
