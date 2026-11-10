<p align="center"><img src="./packages/extension/public/icon/logo.svg" height="64" width="64" alt=""></p>

<h3 align="center">Send to Telegram</h3>

<p align="center">Send text, links, images and pages to a Telegram chat from the right-click menu.</p>

<p align="center">
<a href="https://chromewebstore.google.com/detail/send-to-telegram/jejaagembgeeipilhpjpndednmcphenh"><picture><source media="(prefers-color-scheme: dark)" srcset="./.github/badges/chrome-dark.svg"><img src="./.github/badges/chrome-light.svg" height="32" alt="Add to Chrome"></picture></a>
<a href="https://microsoftedge.microsoft.com/addons/detail/send-to-telegram/gefemahopiogjhmaailegnjippcpfgbb"><picture><source media="(prefers-color-scheme: dark)" srcset="./.github/badges/edge-dark.svg"><img src="./.github/badges/edge-light.svg" height="32" alt="Add to Edge"></picture></a>
<a href="https://addons.mozilla.org/firefox/addon/send-to-telegram-addon/"><picture><source media="(prefers-color-scheme: dark)" srcset="./.github/badges/firefox-dark.svg"><img src="./.github/badges/firefox-light.svg" height="32" alt="Add to Firefox"></picture></a>
</p>

---

## What it does

- **Right-click to send.** Selected text keeps its line breaks, links and images go as they are, and the page goes as a link with a preview.
- **Send from the toolbar.** The popup sends the current page or your selection, with an optional note and hashtag. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> sends the page without opening anything.
- **More than one chat.** Send to yourself, a group or a channel. With several chats, the menu asks which one.
- **Hashtags.** Pick one as you send, so messages are easy to find in Telegram later.
- **Your chat, both ways.** The popup shows what you sent to each chat, and with your own bot what was sent back, including photos, videos and files. Search it, or send a failed message again. The settings page lists everything you sent across chats. Keep everything, only times, or nothing. Private windows never leave a trace.
- **Light and dark.** Follows your system, or pick one.

## Connecting a chat

There are two ways, and you can mix them:

|       | S2T Relay                         | Your own bot                                                               |
| ----- | --------------------------------- | -------------------------------------------------------------------------- |
| Setup | Press Start in Telegram           | Create a bot with [@BotFather](https://t.me/BotFather) and paste its token |
| Time  | A few seconds                     | About two minutes                                                          |
| Path  | Browser → relay server → Telegram | Browser → Telegram                                                         |

The relay keeps only a hash of your browser's token and the chat it delivers to. Message content passes through and is never stored or logged. If you'd rather nothing sits in between, use your own bot. The relay is open source in [`packages/relay`](packages/relay) and you can host your own.

With your own bot, the extension finds your chat by itself: open the bot, press Start, and it appears in the list.

## Upgrading from 1.x

Version 2.0 is a rewrite. On update, your bot token, chat, message settings, hashtags, history and sent count move to the new format automatically, and a page explains what changed. The original data is kept in the extension's storage under `legacyBackup`.

## Development

Requires Node.js 24 or later and pnpm.

```bash
pnpm install
pnpm dev
```

`pnpm dev` opens a separate Chrome window with the extension already loaded, and reloads it as you save. That window keeps its own profile in `packages/extension/.wxt/chrome-data`, so a connected chat and its history carry over between runs; delete the folder to start fresh. `pnpm dev:firefox` does the same in Firefox, with a fresh profile each time.

To work on the pages without a browser window, run `pnpm --filter extension dev:pages`, serve `packages/extension/.output/chrome-mv3-pages`, and open `popup.html`, `options.html` or `welcome.html` in any browser. Extension APIs are replaced with a local stand-in there. Add `?demo` to the URL for sample chats and history, `?selection` for a text selection, `?fail` to make sends fail, or `?reset` to start over.

| Command            | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `pnpm check`       | Lint, format check, type check and tests         |
| `pnpm build`       | Production builds for Chrome and Firefox         |
| `pnpm zip`         | Store-ready zips in `packages/extension/.output` |
| `pnpm dev:relay`   | Runs the relay locally with Wrangler             |
| `pnpm dev:site`    | Runs the website on port 3003                    |
| `pnpm build:site`  | Builds the website, rendering its pages to HTML  |
| `pnpm deploy:site` | Builds the website and deploys it to s2t.dev     |

S2T Relay is optional at build time. Set `WXT_RELAY_URL` to the relay's address (see `packages/extension/.env.example`) to offer it; without it, setup goes straight to the own-bot flow.

### Layout

- `packages/extension`: the browser extension (WXT, React, shadcn/ui on Base UI, Tailwind CSS)
- `packages/relay`: S2T Relay, the optional hosted bot (Cloudflare Workers, Hono, D1)
- `packages/core`: the message model and Telegram client the extension and relay share, and the chat backgrounds the extension and website both draw
- `packages/site`: the website at [s2t.dev](https://s2t.dev) (TanStack Start on Cloudflare Workers, shadcn/ui)

Code is checked with oxlint, including the [anti-slop](https://github.com/dmmulroy/anti-slop) rules in `tools/oxlint/anti-slop` and shadcn's design lint, and formatted with oxfmt.

## Contributing

Pull requests are welcome. Run `pnpm check` before opening one, and describe how you tested the change in a real browser.

## Credits

- Icons: [Hugeicons](https://hugeicons.com)
- Fonts: [Inter](https://rsms.me/inter/) and [Geist Mono](https://vercel.com/font)

## Disclaimer

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with Telegram, or any of its subsidiaries or its affiliates. The official Telegram website can be found at [telegram.org](https://telegram.org). The name "Telegram" as well as related names, marks, emblems and images are registered trademarks of their respective owners.
