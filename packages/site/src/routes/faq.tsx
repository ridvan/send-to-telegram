import { createFileRoute } from '@tanstack/react-router';

import { Faq } from '@/components/faq';

const description =
  'Answers about Send to Telegram: browsers, your own bot, files, the password lock, S2T Relay and more.';

export const Route = createFileRoute('/faq')({
  head: () => ({
    meta: [
      { title: 'Questions and answers · Send to Telegram' },
      { name: 'description', content: description },
      {
        property: 'og:title',
        content: 'Questions and answers · Send to Telegram',
      },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://s2t.dev/faq' },
    ],
    links: [{ rel: 'canonical', href: 'https://s2t.dev/faq' }],
  }),
  component: Faq,
});
