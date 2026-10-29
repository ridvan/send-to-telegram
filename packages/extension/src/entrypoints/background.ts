import { browser } from 'wxt/browser';

import { migrateStoredLegacyData } from '@/lib/legacy';
import { parseMenuId, rebuildMenus } from '@/lib/menus';
import { clearFailureBadge, send, sendRequestSchema } from '@/lib/send';
import { settingsStore } from '@/lib/settings';
import { activeTab, pageUrlOf, readSelection } from '@/lib/tabs';

export default defineBackground({
  type: 'module',
  main() {
    async function refreshMenus() {
      await rebuildMenus(await settingsStore.get());
    }

    browser.runtime.onInstalled.addListener(
      async ({ reason, previousVersion }) => {
        const migration = await migrateStoredLegacyData(previousVersion);

        await refreshMenus();

        if (reason === 'install' || migration) {
          await browser.tabs.create({
            url: browser.runtime.getURL('/welcome.html'),
          });
        }
      }
    );

    // Covers a migration interrupted by a browser restart, and Firefox, which
    // does not keep menus between sessions.
    browser.runtime.onStartup.addListener(async () => {
      await migrateStoredLegacyData(undefined);
      await refreshMenus();
    });

    settingsStore.subscribe((settings) => void rebuildMenus(settings));

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      const target = parseMenuId(info.menuItemId);

      if (!target) return;

      const pageUrl = pageUrlOf(tab, info.frameUrl);

      const text =
        target.kind === 'selection'
          ? await readSelection(tab?.id, info.frameId, info.selectionText)
          : undefined;

      const url =
        target.kind === 'link'
          ? info.linkUrl
          : target.kind === 'image'
            ? info.srcUrl
            : undefined;

      const outcome = await send({
        type: 'send',
        incognito: tab?.incognito ?? false,
        draft: {
          ...target,
          ...(pageUrl && { pageUrl }),
          ...(tab?.title && { pageTitle: tab.title }),
          ...(text && { text }),
          ...(url && { url }),
        },
      });

      if (!outcome.ok && outcome.reason === 'no_destination') {
        await browser.tabs.create({
          url: browser.runtime.getURL('/welcome.html'),
        });
      }
    });

    browser.commands.onCommand.addListener(async (command) => {
      if (command !== 'send-page') return;

      const tab = await activeTab();

      if (!tab?.url) return;

      await send({
        type: 'send',
        incognito: tab.incognito,
        draft: {
          kind: 'page',
          pageUrl: tab.url,
          ...(tab.title && { pageTitle: tab.title }),
        },
      });
    });

    browser.runtime.onMessage.addListener((message, _sender, respond) => {
      const request = sendRequestSchema.safeParse(message);

      if (!request.success) return false;

      void send(request.data).then(respond);

      // Keeps the channel open for the async response.
      return true;
    });

    browser.runtime.onConnect.addListener((port) => {
      if (port.name === 'popup') void clearFailureBadge();
    });
  },
});
