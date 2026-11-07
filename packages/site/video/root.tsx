import './video.css';

import { Composition, continueRender, delayRender } from 'remotion';

import { fps } from './motion';
import { Promo, promoLength } from './promo';

// Fontsource loads a face when text first asks for it, so the first frames
// would draw in the fallback. Each frame waits for all of them instead.
const fonts = delayRender('Loading fonts');

void Promise.all(
  [
    '400 16px "Geist Variable"',
    '500 16px "Geist Variable"',
    '600 16px "Geist Variable"',
    '400 16px "Geist Mono Variable"',
    '400 16px "Geist Serif"',
  ].map((font) => document.fonts.load(font))
).then(() => continueRender(fonts));

export function Root() {
  return (
    <Composition
      id="promo"
      component={Promo}
      durationInFrames={promoLength}
      fps={fps}
      width={1280}
      height={720}
      defaultProps={{ theme: 'dark' as const }}
    />
  );
}
