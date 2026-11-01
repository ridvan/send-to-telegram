import { createFileRoute } from '@tanstack/react-router';

import { OgCard } from '@/components/og-card';

/*
 * The social card, drawn from the landing page's own parts. It isn't linked
 * anywhere. To update public/og.png, run `pnpm dev:site`, capture /og with
 * headless Chrome at 1200x630 and a device scale of 2, then scale it to
 * 1200x630.
 */
export const Route = createFileRoute('/og')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: OgCard,
});
