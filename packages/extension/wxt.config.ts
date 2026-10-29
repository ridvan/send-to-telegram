import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  webExt: {
    // `pnpm dev:pages` builds and serves without opening a browser, for
    // previewing the pages on their own.
    disabled: process.env.PAGES_ONLY === 'true',
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
    excludeSources: [
      '.claude/**',
      '.git/**',
      'packages/relay/**',
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
