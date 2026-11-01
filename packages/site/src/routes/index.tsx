import { createFileRoute } from '@tanstack/react-router';

import { Home } from '@/components/home';

const title = 'Send to Telegram · A browser extension for sending to Telegram';

const description =
  'A free, open-source browser extension for Chrome and Edge. Right-click text, a link, an image or the page to send it to your Telegram chat, group or channel.';

/** Tells search engines what this is: a free browser extension. */
const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Send to Telegram',
  applicationCategory: 'BrowserApplication',
  operatingSystem: 'Chrome, Edge',
  description,
  url: 'https://s2t.dev',
  image: 'https://s2t.dev/og.png',
  isAccessibleForFree: true,
  license: 'https://opensource.org/licenses/MIT',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: 'Send to Telegram' },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://s2t.dev' },
    ],
    links: [{ rel: 'canonical', href: 'https://s2t.dev' }],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(softwareApplication),
      },
    ],
  }),
  component: Home,
});
