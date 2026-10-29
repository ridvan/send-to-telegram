import { activeTab, readSelection } from '@/lib/tabs';

export type PageContext = {
  url?: string;
  title?: string;
  favIconUrl?: string;
  incognito: boolean;
  selection?: string;
};

/** The tab the popup was opened over; `activeTab` grants its URL for this click. */
export async function loadPage(): Promise<PageContext> {
  const tab = await activeTab();
  const selection = await readSelection(tab?.id, 0, undefined);

  return {
    incognito: tab?.incognito ?? false,
    ...(tab?.url && { url: tab.url }),
    ...(tab?.title && { title: tab.title }),
    ...(tab?.favIconUrl && { favIconUrl: tab.favIconUrl }),
    ...(selection && { selection }),
  };
}
