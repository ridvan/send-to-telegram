import { createFileRoute, notFound } from '@tanstack/react-router';

import { StoreAsset } from '@/components/store-asset';
import { isStoreAsset } from '@/lib/store-assets';
import { isStoreBrowser } from '@/lib/store-look';

/*
 * The store listings' pictures, one per page and not linked anywhere. To
 * update them, run `pnpm dev:site` and capture each page with headless Chrome
 * at its size and a device scale of 2, then scale it back down. Add
 * `?theme=light` for the light versions and `?browser=edge` or
 * `?browser=firefox` for those stores.
 */
export const Route = createFileRoute('/store/$asset')({
  validateSearch: (search: { theme?: unknown; browser?: unknown }) => ({
    theme: search.theme === 'light' ? ('light' as const) : ('dark' as const),
    browser: isStoreBrowser(search.browser) ? search.browser : 'chrome',
  }),
  beforeLoad: ({ params }) => {
    if (!isStoreAsset(params.asset)) throw notFound();
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: StoreAsset,
});
