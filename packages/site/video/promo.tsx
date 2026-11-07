import { AbsoluteFill, Sequence } from 'remotion';

import { crossfade } from './scene';
import { BothWaysScene, bothWaysScene } from './scenes/both-ways';
import { BrowserScene, browserScene } from './scenes/browser';
import { DetailsScene, detailsScene } from './scenes/details';
import { IntroScene, introScene } from './scenes/intro';
import { OutroScene, outroScene } from './scenes/outro';
import { SetupScene, setupScene } from './scenes/setup';

/** Each scene and how long it runs, in order; each fades over the last. */
const scenes = [
  { id: 'intro', length: introScene, Scene: IntroScene },
  { id: 'browser', length: browserScene, Scene: BrowserScene },
  { id: 'both-ways', length: bothWaysScene, Scene: BothWaysScene },
  { id: 'details', length: detailsScene, Scene: DetailsScene },
  { id: 'setup', length: setupScene, Scene: SetupScene },
  { id: 'outro', length: outroScene, Scene: OutroScene },
];

/** Where each scene starts, each one overlapping the last by a crossfade. */
const starts = scenes.map((_, index) =>
  scenes
    .slice(0, index)
    .reduce((total, scene) => total + scene.length - crossfade, 0)
);

export const promoLength =
  scenes.reduce((total, scene) => total + scene.length, 0) -
  crossfade * (scenes.length - 1);

/** The store listing's video: what the extension does, one scene at a time. */
export function Promo({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <AbsoluteFill data-theme={theme} className="bg-background font-sans">
      {scenes.map(({ id, length, Scene }, index) => (
        <Sequence
          key={id}
          name={id}
          from={starts[index]}
          durationInFrames={length}
        >
          <Scene />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
