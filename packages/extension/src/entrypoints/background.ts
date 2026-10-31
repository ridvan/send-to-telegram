import { browser } from 'wxt/browser';
import { z } from 'zod';

import { migrateStoredLegacyData } from '@/lib/legacy';
import { parseMenuId, rebuildMenus } from '@/lib/menus';
import {
  clearFailureBadge,
  pruneUnsentFiles,
  send,
  type SendRequest,
  sendRequestSchema,
  showBadge,
} from '@/lib/send';
import { defaultSettings, settingsStore } from '@/lib/settings';
import { activeTab, pageUrlOf, readSelection } from '@/lib/tabs';
import {
  LockedError,
  lockState,
  type LockState,
  watchLockKeys,
} from '@/lib/vault';

/**
 * Sends from the menu or a shortcut while locked, kept in session storage
 * (memory only) and sent in order once the popup unlocks.
 */
const PENDING_KEY = 'pendingSends';

/** Long enough to type a password; an older one is dropped, not sent. */
const PENDING_FOR = 5 * 60_000;

/** Keeps session storage small; the oldest go first. */
const MAX_PENDING = 20;

const pendingSchema = z
  .array(z.object({ request: sendRequestSchema, at: z.number() }))
  .catch([]);

type PendingSends = z.infer<typeof pendingSchema>;

let pendingChanges = Promise.resolve();

/** Changes the waiting sends one at a time, so none is lost; returns them as they were. */
function changePending(
  change: (pending: PendingSends) => PendingSends
): Promise<PendingSends> {
  const run = pendingChanges.then(async () => {
    const stored = await browser.storage.session.get(PENDING_KEY);
    const pending = pendingSchema.parse(stored[PENDING_KEY]);

    await browser.storage.session.set({ [PENDING_KEY]: change(pending) });

    return pending;
  });

  pendingChanges = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

async function sendWhenUnlocked(request: SendRequest) {
  await changePending((pending) =>
    [...pending, { request, at: Date.now() }].slice(-MAX_PENDING)
  );

  try {
    await browser.action.openPopup();
  } catch {
    // Firefox opens the popup only on a click it can still see; the alert
    // badge points to the toolbar button instead.
    await showBadge(false);
  }
}

async function sendPending() {
  const pending = await changePending(() => []);

  for (const { request, at } of pending) {
    if (Date.now() - at < PENDING_FOR) await sendFromBrowser(request);
  }
}

/** Sends from the menu or a shortcut, where no page shows the outcome. */
async function sendFromBrowser(request: SendRequest) {
  const outcome = await send(request);

  if (outcome.ok) return;

  if (outcome.reason === 'locked') {
    await sendWhenUnlocked(request);
  } else if (outcome.reason === 'no_destination') {
    await browser.tabs.create({
      url: browser.runtime.getURL('/welcome.html'),
    });
  }
}

export default defineBackground({
  type: 'module',
  main() {
    async function refreshMenus() {
      const settings = await settingsStore.get().catch((cause: unknown) => {
        // Locked menus have no chats or hashtags: their names are sealed too.
        if (cause instanceof LockedError) return defaultSettings();

        throw cause;
      });

      await rebuildMenus(settings);
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
      await pruneUnsentFiles();
    });

    settingsStore.subscribe((settings) => void rebuildMenus(settings));

    let lock: LockState | undefined;
    // One check at a time, so two changes in a row can't send the pending message twice.
    let checking = Promise.resolve();

    watchLockKeys(() => {
      checking = checking
        .then(async () => {
          const next = await lockState();

          if (next === lock) return;

          lock = next;
          await refreshMenus();

          if (next !== 'locked') await sendPending();
        })
        .catch((cause: unknown) =>
          console.error('Could not follow the lock', cause)
        );
    });

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

      await sendFromBrowser({
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
    });

    browser.commands.onCommand.addListener(async (command) => {
      if (command !== 'send-page') return;

      const tab = await activeTab();

      if (!tab?.url) return;

      await sendFromBrowser({
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
