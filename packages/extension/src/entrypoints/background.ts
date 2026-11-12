import { browser } from 'wxt/browser';
import { z } from 'zod';

import {
  areaSchema,
  pickForPopup,
  type SelectAreaRequest,
  selectArea,
  selectAreaRequestSchema,
  stillShowing,
} from '@/lib/area';
import {
  markAllAnnouncementsSeen,
  markAnnouncementSeen,
} from '@/lib/announcements';
import { saveAttachment } from '@/lib/attachments';
import { isHttpUrl } from '@/lib/compose';
import { migrateStoredLegacyData } from '@/lib/legacy';
import { parseMenuId, rebuildMenus } from '@/lib/menus';
import {
  clearFailureBadge,
  pruneUnsentFiles,
  recordUnsent,
  send,
  type SendRequest,
  sendRequestSchema,
  showBadge,
  showWaitingBadge,
} from '@/lib/send';
import { attachmentInfo, captureFailure, captureTab } from '@/lib/screenshot';
import {
  type ContentKind,
  defaultSettings,
  settingsStore,
} from '@/lib/settings';
import { activeTab, pageUrlOf, readSelection } from '@/lib/tabs';
import {
  LockedError,
  lockState,
  type LockState,
  watchLockKeys,
} from '@/lib/vault';

/**
 * The source of a right-clicked image, video or song. A streamed `blob:`
 * video means nothing outside the tab, so it's left out and the page goes.
 */
function mediaUrl(
  { kind }: { kind: ContentKind },
  { srcUrl }: { srcUrl?: string | undefined }
) {
  if (kind === 'image') return srcUrl;

  if (kind === 'video' || kind === 'audio') {
    return isHttpUrl(srcUrl) ? srcUrl : undefined;
  }

  return undefined;
}

/**
 * Sends from the menu or a shortcut while locked, kept in session storage
 * (memory only) and sent in order once the popup unlocks.
 */
const PENDING_KEY = 'pendingSends';

/** Long enough to type a password; an older one is dropped, not sent. */
const PENDING_FOR = 5 * 60_000;

/** Keeps session storage small; the oldest go first. */
const MAX_PENDING = 20;

/**
 * A screenshot waits as the tab to capture, and the area picked in it, not
 * as the picture: nothing could seal it while locked, and session storage is
 * small.
 */
const captureSchema = z.object({
  tabId: z.number(),
  windowId: z.number(),
  area: areaSchema.optional(),
});

type Capture = z.infer<typeof captureSchema>;

const pendingSchema = z
  .array(
    z.object({
      request: sendRequestSchema,
      at: z.number(),
      capture: captureSchema.optional(),
    })
  )
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

async function sendWhenUnlocked(request: SendRequest, capture?: Capture) {
  await changePending((pending) =>
    [
      ...pending,
      { request, at: Date.now(), ...(capture && { capture }) },
    ].slice(-MAX_PENDING)
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

  for (const { request, at, capture } of pending) {
    if (Date.now() - at >= PENDING_FOR) continue;

    if (capture) await sendScreenshotOnceShowing(request, capture);
    else await sendFromBrowser(request);
  }
}

/**
 * Captures the tab only if it still shows what was asked for: the same tab in
 * its window and, for an area, scrolled where it was. A screenshot asked for
 * before unlocking never shows another tab or another part of the page.
 */
async function sendScreenshotOnceShowing(
  request: SendRequest,
  capture: Capture
) {
  const [showing] = await browser.tabs.query({
    active: true,
    windowId: capture.windowId,
  });

  if (showing?.id !== capture.tabId) {
    await recordUnsent(
      request.draft,
      request.incognito,
      'You switched tabs before unlocking, so no screenshot was taken. Take it again from the page.'
    );
  } else if (
    capture.area &&
    !(await stillShowing(capture.tabId, capture.area))
  ) {
    await recordUnsent(
      request.draft,
      request.incognito,
      'The page moved before you unlocked, so no screenshot was taken. Select the area again.'
    );
  } else {
    await sendScreenshot(request, capture);
  }
}

/** Captures what the tab shows and sends it with the request's page link. */
async function sendScreenshot(request: SendRequest, capture: Capture) {
  // Nothing can seal the picture while locked, so the capture waits too.
  if ((await lockState()) === 'locked') {
    await sendWhenUnlocked(request, capture);

    return;
  }

  let draft: SendRequest['draft'];

  try {
    const file = await captureTab(capture.windowId, capture.area);
    const attachment = attachmentInfo(file);

    await saveAttachment(attachment.id, file);
    draft = { ...request.draft, attachment };
  } catch (cause) {
    console.error('Could not take the screenshot', cause);
    await recordUnsent(request.draft, request.incognito, captureFailure(cause));

    return;
  }

  await sendFromBrowser({ ...request, draft });
}

/**
 * Lets you drag out an area of the tab, then sends it. The area is picked
 * first even while locked, so unlocking captures just that.
 */
async function sendAreaScreenshot(request: SendRequest, capture: Capture) {
  let picked;

  try {
    picked = await selectArea(capture.tabId);
  } catch (cause) {
    console.error('Could not select an area', cause);
    await recordUnsent(request.draft, request.incognito, captureFailure(cause));

    return;
  }

  // Escape sends nothing, and a pick already under way carries on alone.
  if (picked === 'cancelled' || picked === 'busy') return;

  await sendScreenshot(request, { ...capture, area: picked });
}

/**
 * Picks an area for the popup, which closed when the page was clicked, and
 * opens it again with the screenshot attached to its draft.
 */
async function selectAreaForPopup(request: SelectAreaRequest) {
  const reopen = await pickForPopup(request, () => selectArea(request.tabId));

  if (!reopen) return;

  try {
    await browser.action.openPopup({ windowId: request.windowId });
  } catch {
    // Firefox opens the popup only on a click it can still see; the badge
    // points to the toolbar button, and the popup picks the draft up there.
    await showWaitingBadge();
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

        // Setup shows what's there; announcements are for what's new since.
        if (reason === 'install') await markAllAnnouncementsSeen();

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
      const parsed = parseMenuId(info.menuItemId);

      if (!parsed) return;

      const { draft: target, capture } = parsed;
      const pageUrl = pageUrlOf(tab, info.frameUrl);

      if (capture) {
        if (tab?.id === undefined) return;

        const request: SendRequest = {
          type: 'send',
          incognito: tab.incognito,
          draft: {
            ...target,
            ...(pageUrl && { pageUrl }),
            ...(tab.title && { pageTitle: tab.title }),
          },
        };

        const where = { tabId: tab.id, windowId: tab.windowId };

        void markAnnouncementSeen('screenshots');

        if (capture === 'area') await sendAreaScreenshot(request, where);
        else await sendScreenshot(request, where);

        return;
      }

      const text =
        target.kind === 'selection'
          ? await readSelection(tab?.id, info.frameId, info.selectionText)
          : undefined;

      const url =
        target.kind === 'link' ? info.linkUrl : mediaUrl(target, info);

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
      if (
        command !== 'send-page' &&
        command !== 'send-screenshot' &&
        command !== 'send-area-screenshot'
      ) {
        return;
      }

      const tab = await activeTab();

      if (!tab?.url) return;

      const request: SendRequest = {
        type: 'send',
        incognito: tab.incognito,
        draft: {
          kind: 'page',
          pageUrl: tab.url,
          ...(tab.title && { pageTitle: tab.title }),
        },
      };

      if (command === 'send-page') {
        await sendFromBrowser(request);

        return;
      }

      if (tab.id === undefined) return;

      const where = { tabId: tab.id, windowId: tab.windowId };

      void markAnnouncementSeen('screenshots');

      if (command === 'send-area-screenshot') {
        await sendAreaScreenshot(request, where);
      } else {
        await sendScreenshot(request, where);
      }
    });

    browser.runtime.onMessage.addListener((message, _sender, respond) => {
      const area = selectAreaRequestSchema.safeParse(message);

      if (area.success) {
        // Answered at once: the popup closes as soon as the page is clicked.
        respond(true);
        void selectAreaForPopup(area.data);

        return false;
      }

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
