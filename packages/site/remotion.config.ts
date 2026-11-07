import path from 'node:path';

import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';

/*
 * The store listing's video in `video/`, drawn from the site's own parts.
 * `pnpm video` opens Remotion Studio, `pnpm video:render` writes the MP4.
 */

const source = path.resolve('src');

Config.setEntryPoint('video/index.ts');

Config.setPublicDir('public');

// PNG frames keep the hairline borders and small text sharp.
Config.setVideoImageFormat('png');

Config.setCodec('h264');

Config.setCrf(16);

Config.setPixelFormat('yuv420p');

// Drawn at 1280 by 720, like the store's screenshots, and written at 1080p.
Config.setScale(1.5);

Config.overrideWebpackConfig((config) => {
  const tailwind = enableTailwind(config);

  return {
    ...tailwind,
    resolve: {
      ...tailwind.resolve,
      alias: {
        ...tailwind.resolve?.alias,
        // The site's mark loads `/logo.svg` from the site's root, which a
        // render serves somewhere else; this one asks Remotion for it.
        '@/components/app-mark$': path.resolve('video/app-mark.tsx'),
        '@': source,
      },
    },
  };
});
