import { createFileRoute } from '@tanstack/react-router';

import { Privacy } from '@/components/privacy-policy';

const description =
  'What Send to Telegram and S2T Relay store, where they keep it, and how to remove it.';

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy policy · Send to Telegram' },
      { name: 'description', content: description },
      { property: 'og:title', content: 'Privacy policy · Send to Telegram' },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://s2t.dev/privacy' },
    ],
    links: [{ rel: 'canonical', href: 'https://s2t.dev/privacy' }],
  }),
  component: Privacy,
});
