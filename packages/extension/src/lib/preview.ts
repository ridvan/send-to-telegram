/**
 * Development only: lets the extension pages render in a normal browser tab
 * (`pnpm dev`, then open http://localhost:3000/popup.html) by standing in for
 * the extension APIs with localStorage. Add `?demo` to seed sample data, and
 * `?fail` to make sends fail.
 * Production builds drop this module because `import.meta.env.DEV` is false.
 */

import type { Delivery, DeviceStatus, Pairing } from '@send-to-telegram/core';
import { z } from 'zod';

type Changes = Record<string, { oldValue?: string; newValue?: string }>;

type ChangeListener = (changes: Changes, area: string) => void;

const PREFIX = 'preview:';

function read(key: string) {
  const raw = localStorage.getItem(PREFIX + key);

  return raw === null ? undefined : JSON.parse(raw);
}

function demoData(now: number) {
  const minute = 60_000;

  return {
    settings: {
      destinations: [
        {
          id: 'me',
          kind: 'relay',
          relayUrl: 'https://relay.example.com',
          deviceToken: 'x',
          chatTitle: 'Rıdvan Aktogan',
          chatType: 'private',
        },
        {
          id: 'team',
          kind: 'bot',
          token: '1:x',
          chatId: -100123,
          chatTitle: 'Design crit',
          chatType: 'supergroup',
          botUsername: 'crit_bot',
        },
      ],
      defaultDestinationId: 'me',
      tags: { enabled: true, list: ['work', 'reading', 'ideas', 'recipes'] },
    },
    stats: { sent: 1284 },
    onboarding: { completedAt: now - 30 * 24 * 60 * minute },
    history: [
      {
        id: 'h1',
        sentAt: now - 2 * minute,
        kind: 'page',
        status: 'sent',
        destinationId: 'me',
        destinationName: 'Rıdvan Aktogan',
        tag: 'reading',
        content: {
          pageUrl: 'https://www.joshwcomeau.com/css/interactive-guide-to-grid/',
          pageTitle: 'An Interactive Guide to CSS Grid',
        },
      },
      {
        id: 'h2',
        sentAt: now - 26 * minute,
        kind: 'image',
        status: 'failed',
        destinationId: 'team',
        destinationName: 'Design crit',
        error:
          'The bot can’t post to this chat. Open the chat in Telegram and press Start, or add the bot back to the group.',
        content: {
          url: 'https://images.example.com/board.png',
          pageUrl: 'https://dribbble.com/shots/123',
          pageTitle: 'Moodboard',
        },
      },
      {
        id: 'h3',
        sentAt: now - 3 * 60 * minute,
        kind: 'selection',
        status: 'sent',
        destinationId: 'me',
        destinationName: 'Rıdvan Aktogan',
        content: {
          text: 'The best interfaces are the ones you never notice. Every detail that works the way you expect is a detail you never have to think about.',
          pageUrl: 'https://emilkowal.ski/ui/invisible-details',
          pageTitle: 'Invisible details of interaction design',
        },
      },
      {
        id: 'h4',
        sentAt: now - 27 * 60 * minute,
        kind: 'link',
        status: 'sent',
        destinationId: 'team',
        destinationName: 'Design crit',
        tag: 'work',
        content: {
          url: 'https://linear.app/method',
          pageUrl: 'https://news.ycombinator.com/',
          pageTitle: 'Hacker News',
        },
      },
    ],
  };
}

/**
 * Answers for a relay at relay.invalid (build with WXT_RELAY_URL set to it):
 * a pairing that links on the third status check. Other requests pass through.
 */
function fakeRelay(realFetch: typeof fetch): typeof fetch {
  let checks = 0;

  const json = (body: DeviceStatus | Pairing | Delivery, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.host !== 'relay.invalid') return realFetch(input, init);

    await new Promise((resolve) => setTimeout(resolve, 400));

    if (url.pathname === '/v1/pairings') {
      checks = 0;

      return json(
        {
          code: 'previewpreviewpreview',
          botUsername: 'SendToTelegramRelayBot',
          expiresAt: Date.now() + 600_000,
        },
        201
      );
    }

    if (url.pathname === '/v1/device') {
      checks += 1;

      return checks < 3
        ? json({ status: 'pending', expiresAt: Date.now() + 600_000 })
        : json({
            status: 'linked',
            chat: { title: 'Rıdvan Aktogan', type: 'private' },
          });
    }

    return json({ messageId: 1, via: 'text' });
  };
}

function install() {
  const listeners = new Set<ChangeListener>();
  const url = new URL(location.href);

  if (url.searchParams.has('demo')) {
    for (const [key, value] of Object.entries(demoData(Date.now()))) {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  }

  if (url.searchParams.has('reset')) {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  }

  const emit = (changes: Changes) => {
    for (const listener of listeners) listener(changes, 'local');
  };

  addEventListener('storage', (event) => {
    if (!event.key?.startsWith(PREFIX)) return;

    emit({
      [event.key.slice(PREFIX.length)]: {
        newValue:
          event.newValue === null ? undefined : JSON.parse(event.newValue),
      },
    });
  });

  const noop = () => {};
  const event = { addListener: noop, removeListener: noop };

  const chrome = {
    runtime: {
      id: 'preview',
      lastError: undefined,
      getURL: (path: string) => path,
      getManifest: () => ({ version: '2.0.0', name: 'Send to Telegram' }),
      getPlatformInfo: async () => ({ os: 'mac' }),
      connect: () => ({ name: 'popup', disconnect: noop, onDisconnect: event }),
      sendMessage: async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));

        // `?fail` shows how the pages handle a send Telegram refuses.
        if (url.searchParams.has('fail')) {
          return {
            ok: false,
            reason: 'unauthorized',
            message:
              'The bot can’t post to this chat. Open the chat in Telegram and press Start.',
          };
        }

        return { ok: true, destination: 'Rıdvan Aktogan' };
      },
      openOptionsPage: async () => void open('/options.html'),
      onMessage: event,
      onInstalled: event,
      onStartup: event,
      onConnect: event,
    },
    storage: {
      onChanged: {
        addListener: (listener: ChangeListener) => listeners.add(listener),
        removeListener: (listener: ChangeListener) =>
          listeners.delete(listener),
      },
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];

          return Object.fromEntries(list.map((key) => [key, read(key)]));
        },
        set: async (items: Record<string, string>) => {
          const changes: Changes = {};

          for (const [key, value] of Object.entries(items)) {
            changes[key] = { newValue: value };
            localStorage.setItem(PREFIX + key, JSON.stringify(value));
          }

          emit(changes);
        },
        remove: async (keys: string | string[]) => {
          const changes: Changes = {};

          for (const key of Array.isArray(keys) ? keys : [keys]) {
            changes[key] = { oldValue: read(key) };
            localStorage.removeItem(PREFIX + key);
          }

          emit(changes);
        },
        clear: async () => {
          const changes: Changes = {};

          for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(PREFIX)) continue;

            changes[key.slice(PREFIX.length)] = {
              oldValue: read(key.slice(PREFIX.length)),
            };
            localStorage.removeItem(key);
          }

          emit(changes);
        },
      },
    },
    tabs: {
      query: async () => [
        {
          id: 1,
          url: 'https://www.joshwcomeau.com/css/interactive-guide-to-grid/',
          title: 'An Interactive Guide to CSS Grid',
          favIconUrl: 'https://www.joshwcomeau.com/favicon.png',
          incognito: false,
        },
      ],
      create: async ({ url: target }: { url: string }) => {
        // Telegram links would leave the preview; log them instead.
        if (target.startsWith('https://t.me/'))
          console.info('Would open', target);
        else open(target);
      },
    },
    scripting: {
      executeScript: async () => [
        {
          result: url.searchParams.has('selection')
            ? 'Grid is a two-dimensional layout system. Flexbox lays things out in one dimension at a time.'
            : '',
        },
      ],
    },
    commands: {
      getAll: async () => [
        {
          name: '_execute_action',
          shortcut: '⌥⇧T',
          description: 'Open Send to Telegram',
        },
        {
          name: 'send-page',
          shortcut: '⌥⇧S',
          description: 'Send the current page',
        },
      ],
    },
    action: {
      setBadgeText: async () => {},
      getBadgeText: async () => '',
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
    },
    contextMenus: { create: noop, removeAll: async () => {}, onClicked: event },
  };

  Object.assign(globalThis, { chrome, fetch: fakeRelay(fetch) });
}

const insideExtension = z
  .object({ chrome: z.object({ runtime: z.object({ id: z.string() }) }) })
  .safeParse(globalThis).success;

if (import.meta.env.DEV && !insideExtension) install();
