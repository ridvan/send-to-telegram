/**
 * Development only: lets the extension pages render in a normal browser tab
 * (`pnpm dev`, then open http://localhost:3000/popup.html) by standing in for
 * the extension APIs with localStorage. Add `?demo` to seed sample data, and
 * `?fail` to make sends and downloads fail. The demo group chat's bot answers
 * with messages people sent it; `?noperm` starts without permission to
 * download their media.
 * Production builds drop this module because `import.meta.env.DEV` is false.
 */

import type {
  Delivery,
  DeviceStatus,
  Pairing,
  Update,
} from '@send-to-telegram/core';
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
          avatar: { kind: 'pattern', style: 'marble' },
        },
      ],
      defaultDestinationId: 'me',
      tags: { enabled: true, list: ['work', 'reading', 'ideas', 'recipes'] },
    },
    stats: { sent: 1284 },
    // Sample messages deleted in an earlier look come back with the rest.
    inboxRemoved: [],
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
        id: 'h1b',
        sentAt: now - 20 * minute,
        kind: 'page',
        status: 'sent',
        destinationId: 'team',
        destinationName: 'Design crit',
        via: 'photo',
        content: {
          note: 'My take on the grid',
          attachment: {
            id: 'a1',
            name: 'image.png',
            type: 'image/png',
            size: 412_000,
          },
          sentMedia: {
            media: 'photo',
            file: {
              id: 'photo',
              uniqueId: 'P',
              width: 800,
              height: 533,
              preview: { id: 'photo', uniqueId: 'P', width: 800, height: 533 },
            },
          },
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
      {
        id: 'h5',
        sentAt: now - 50 * 60 * minute,
        kind: 'link',
        status: 'sent',
        destinationId: 'me',
        destinationName: 'Rıdvan Aktogan',
        tag: 'ideas',
        content: {
          url: 'https://linear.app/method',
          note: 'Read this before the planning meeting',
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
          botUsername: 'S2TRelayBot',
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

/**
 * What people sent to the demo bot (token `1:x`): two group messages and a
 * photo, plus a command and a private message the group's chat leaves out.
 */
function demoUpdates(now: number): Update[] {
  const seconds = (minutesAgo: number) =>
    Math.round((now - minutesAgo * 60_000) / 1000);

  const group = {
    id: -100123,
    type: 'supergroup',
    title: 'Design crit',
  } as const;

  const ana = { id: 2, is_bot: false, first_name: 'Ana' };
  const mert = { id: 3, is_bot: false, first_name: 'Mert' };
  const link = 'figma.com/board/crit-42';
  const text = `Here’s the board from today: ${link}`;

  return [
    {
      update_id: 1,
      message: {
        message_id: 10,
        chat: group,
        from: mert,
        date: seconds(40),
        text: '/start',
        entities: [{ type: 'bot_command', offset: 0, length: 6 }],
      },
    },
    {
      update_id: 2,
      message: {
        message_id: 11,
        chat: group,
        from: ana,
        date: seconds(35),
        text,
        entities: [
          { type: 'url', offset: text.indexOf(link), length: link.length },
        ],
      },
    },
    {
      update_id: 3,
      message: {
        message_id: 12,
        chat: group,
        from: ana,
        date: seconds(31),
        photo: [
          { file_id: 'photo-s', file_unique_id: 'S', width: 90, height: 60 },
          { file_id: 'photo', file_unique_id: 'P', width: 800, height: 533 },
        ],
        caption: 'Option B, with the tighter grid',
      },
    },
    {
      update_id: 6,
      message: {
        message_id: 14,
        chat: group,
        from: mert,
        date: seconds(28),
        voice: {
          file_id: 'voice',
          file_unique_id: 'V',
          duration: 2,
          mime_type: 'audio/wav',
        },
      },
    },
    {
      update_id: 7,
      message: {
        message_id: 15,
        chat: group,
        from: ana,
        date: seconds(25),
        video: {
          file_id: 'video',
          file_unique_id: 'R',
          width: 1920,
          height: 1080,
          duration: 94,
          file_size: 48_000_000,
          thumbnail: {
            file_id: 'photo',
            file_unique_id: 'P',
            width: 320,
            height: 180,
          },
        },
        caption: 'Walkthrough of the prototype',
      },
    },
    {
      update_id: 8,
      message: {
        message_id: 16,
        chat: group,
        from: ana,
        date: seconds(22),
        document: {
          file_id: 'notes',
          file_unique_id: 'N',
          file_name: 'crit-notes.txt',
          mime_type: 'text/plain',
          file_size: 2_400,
        },
      },
    },
    {
      update_id: 4,
      message: {
        message_id: 1,
        chat: { id: 9, type: 'private', first_name: 'Someone' },
        date: seconds(20),
        text: 'Not in the group',
      },
    },
    {
      update_id: 5,
      message: {
        message_id: 13,
        chat: group,
        from: mert,
        date: seconds(4),
        text: 'Can you send the grid article here too?',
      },
    },
  ];
}

/** A moodboard-like picture, drawn as the JPEG Telegram would send. */
async function demoPhoto() {
  const canvas = new OffscreenCanvas(800, 533);
  const context = canvas.getContext('2d');

  if (!context) return new Blob();

  const gradient = context.createLinearGradient(0, 0, 800, 533);

  gradient.addColorStop(0, '#7dd3fc');
  gradient.addColorStop(1, '#a78bfa');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 800, 533);
  context.fillStyle = 'rgb(255 255 255 / 0.85)';

  for (const [x, y, width, height] of [
    [60, 60, 300, 190],
    [400, 60, 340, 90],
    [400, 170, 340, 80],
    [60, 280, 680, 190],
  ] as const) {
    context.beginPath();
    context.roundRect(x, y, width, height, 18);
    context.fill();
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

/** A short beep as a WAV file, standing in for a voice message. */
function demoSound() {
  const rate = 8000;
  const samples = rate * 2;
  const view = new DataView(new ArrayBuffer(44 + samples));

  const text = (offset: number, value: string) =>
    [...value].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0))
    );

  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);

  for (let index = 0; index < samples; index += 1) {
    const fade = 1 - index / samples;

    view.setUint8(
      44 + index,
      128 + Math.round(40 * fade * Math.sin((index / rate) * 2 * Math.PI * 440))
    );
  }

  return view.buffer;
}

const demoFiles = new Map<string, () => BodyInit | Promise<BodyInit>>([
  ['photo', demoPhoto],
  ['photo-s', demoPhoto],
  ['voice', demoSound],
  ['notes', () => 'Notes from the design crit.\n'],
]);

/** What the fake Bot API answers. */
type FakeAnswer =
  | { ok: true; result: Update[] | { file_id: string; file_path: string } }
  | { ok: false; error_code: number; description: string };

/**
 * Answers for the demo bot (token `1:x`): `getUpdates`, `getFile` and its
 * file downloads. `failDownloads` makes every download fail, as a file
 * Telegram no longer has would. Other requests pass through.
 */
function fakeTelegram(
  realFetch: typeof fetch,
  failDownloads: boolean
): typeof fetch {
  const updates = demoUpdates(Date.now());

  const json = (body: FakeAnswer) =>
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    });

  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.href === 'https://api.telegram.org/bot1:x/getUpdates') {
      return json({ ok: true, result: updates });
    }

    if (url.href === 'https://api.telegram.org/bot1:x/getFile') {
      const { file_id: id } = z
        .object({ file_id: z.string() })
        .parse(JSON.parse(String(init?.body)));

      await new Promise((resolve) => setTimeout(resolve, 500));

      return failDownloads
        ? json({
            ok: false,
            error_code: 400,
            description:
              'Bad Request: wrong file_id or the file is temporarily unavailable',
          })
        : json({ ok: true, result: { file_id: id, file_path: `demo/${id}` } });
    }

    const file = /^\/file\/bot1:x\/demo\/(.+)$/.exec(url.pathname)?.[1];
    const body = file ? demoFiles.get(file) : undefined;

    if (body) return new Response(await body());

    return realFetch(input, init);
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

  // `?noperm` starts without the optional permission to download media.
  let downloadsAllowed = !url.searchParams.has('noperm');
  const permissionListeners = new Set<() => void>();

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
    permissions: {
      contains: async () => downloadsAllowed,
      request: async () => {
        downloadsAllowed = true;

        for (const listener of permissionListeners) listener();

        return true;
      },
      onAdded: {
        addListener: (listener: () => void) =>
          permissionListeners.add(listener),
        removeListener: (listener: () => void) =>
          permissionListeners.delete(listener),
      },
    },
  };

  Object.assign(globalThis, {
    chrome,
    fetch: fakeTelegram(fakeRelay(fetch), url.searchParams.has('fail')),
  });
}

const insideExtension = z
  .object({ chrome: z.object({ runtime: z.object({ id: z.string() }) }) })
  .safeParse(globalThis).success;

if (import.meta.env.DEV && !insideExtension) install();
