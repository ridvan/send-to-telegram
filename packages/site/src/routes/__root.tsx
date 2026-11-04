import { createRootRoute } from '@tanstack/react-router';

import { Document, Failed, NotFound } from '@/components/document';
import { themeScript } from '@/lib/theme';
import styles from '@/styles.css?url';

// Fallbacks for pages that don't set their own, such as the 404.
const title = 'Send to Telegram';

const description =
  'A free, open-source browser extension that sends text, links, images and pages to your Telegram chats.';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      { name: 'description', content: description },
      { name: 'color-scheme', content: 'light dark' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Send to Telegram' },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: 'https://s2t.dev/og.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content:
          'Send to Telegram, a browser extension that sends text, links and images to Telegram.',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://s2t.dev/og.png' },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      // The extension's toolbar icons, copied from packages/extension/public/icon.
      ...[16, 32, 48, 96, 128].map((size) => ({
        rel: 'icon',
        type: 'image/png',
        sizes: `${size}x${size}`,
        href: `/icon/${size}.png`,
      })),
    ],
    scripts: [{ children: themeScript }],
  }),
  shellComponent: Document,
  notFoundComponent: NotFound,
  errorComponent: Failed,
});
