import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// `pnpm dev:pages` builds and serves without opening a browser, for previewing
// the pages on their own.
const pagesOnly = process.env.PAGES_ONLY === 'true';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  // Every build starts by deleting its output folder. If `dev:pages` shared
  // `chrome-mv3-dev` with `pnpm dev`, starting it would delete the extension
  // out from under the dev browser, which then drops it without an error.
  ...(pagesOnly && {
    outDirTemplate: '{{browser}}-mv{{manifestVersion}}-pages',
  }),
  dev: {
    // Fixed ports, so a second dev server fails to listen (which happens
    // before it builds) instead of moving to the next port and wiping the
    // first one's output.
    server: { port: pagesOnly ? 3002 : 3000, strictPort: true },
  },
  webExt: {
    disabled: pagesOnly,
    // Keeps the dev browser's profile between runs, so a connected chat and
    // its history survive restarting `pnpm dev`. Firefox starts fresh.
    chromiumProfile: resolve('.wxt/chrome-data'),
    keepProfileChanges: true,
  },
  manifest: ({ browser }) => ({
    name: 'Send to Telegram',
    description:
      'Send text, links, images and pages to a Telegram chat from the right-click menu.',
    // 1.x shipped contextMenus and storage. activeTab and scripting add no
    // install warning, so updating users are not asked to re-approve.
    permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
    // Telegram's file host leaves out Access-Control-Allow-Origin on
    // successful downloads (only its errors carry it), so showing media sent
    // to your bot needs this. Optional: asked for when media first shows, with
    // no install warning.
    optional_host_permissions: ['https://api.telegram.org/*'],
    action: { default_title: 'Send to Telegram' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+T' },
        description: 'Open Send to Telegram',
      },
      'send-page': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Send the current page',
      },
    },
    // Tailwind v4 needs Chrome 111. Older browsers stay on 1.x instead of
    // updating to a popup that can't draw.
    ...(browser !== 'firefox' && { minimum_chrome_version: '111' }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'send-to-telegram@ridvan',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
  zip: {
    name: 'send-to-telegram',
    // Firefox reviewers rebuild from source, which needs the shared core package.
    sourcesRoot: '../..',
    // Dot files are left out by default, and without this one a rebuild has
    // no relay. Setting this replaces WXT's default of everything, so keep it.
    includeSources: ['**/*', 'packages/extension/.env.production'],
    excludeSources: [
      '.claude/**',
      '.git/**',
      'packages/relay/**',
      // The website and the store listing images play no part in the build.
      'packages/site/**',
      'packages/extension/store/**',
      'skills-lock.json',
      '**/.output/**',
      '**/.wxt/**',
      '**/node_modules/**',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
