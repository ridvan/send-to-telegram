import { useCurrentFrame } from 'remotion';

import { AppMark } from '@/components/app-mark';
import { Rings } from '@/components/rings';

import { mix, progress, rise } from '../motion';
import { Scene } from '../scene';

/** The store's small tile, larger: the icon, the name, and where to find it. */
export const outroScene = 150;

/** The icon's middle, which the rings spread from. */
const icon = { x: 640, y: 250 };

export function OutroScene() {
  const frame = useCurrentFrame();
  const mark = progress(frame, 6, 24);
  const spread = progress(frame, 4, 60);

  return (
    <Scene>
      <div
        className="absolute inset-0"
        style={{ opacity: spread, scale: mix(0.8, 1, spread) }}
      >
        <Rings
          width={1280}
          height={720}
          x={icon.x}
          y={icon.y}
          radii={[120, 180, 240, 300]}
          fade={340}
          fadeBelow={icon.y + 150}
        />
      </div>
      <div className="relative flex size-full flex-col items-center gap-8 pt-42">
        <span
          className="rounded-4xl border bg-card p-3 shadow-lifted"
          style={{ opacity: mark, scale: mix(0.7, 1, mark) }}
        >
          <AppMark size="xl" />
        </span>
        <div className="flex flex-col items-center gap-4">
          <span
            className="font-heading text-7xl leading-none tracking-tight"
            style={rise(frame, 16, 18)}
          >
            Send to Telegram
          </span>
          <span
            className="text-2xl text-muted-foreground"
            style={rise(frame, 24, 18)}
          >
            Free and open source, at s2t.dev
          </span>
        </div>
      </div>
    </Scene>
  );
}
