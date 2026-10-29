# Send to Telegram agent instructions

## Before handing off

- Run `pnpm check` (lint, format check, type check, tests) and `pnpm build`. Fix every finding; don't weaken lint rules, add casts without a `SAFETY:` comment, or move code to exempt files to pass.
- Lint and type checks don't verify appearance. For UI changes, look at the page in light and dark, at the popup's 360px width, and in the empty, loading and failure states.

## Previewing pages

`pnpm dev` opens Chrome with the extension loaded (profile in `packages/extension/.wxt/chrome-data`); use it to verify menus, the background worker, migration and real sends. For the pages alone, `pnpm --filter extension dev:pages` builds and serves without opening a browser (the `extension` entry in `.claude/launch.json`). Serve `packages/extension/.output/chrome-mv3-dev` (the `extension-pages` entry, port 3001) and open `popup.html`, `options.html` or `welcome.html`. `src/lib/preview.ts` stands in for extension APIs outside an extension. Add `?demo` for sample data, `?selection` for a text selection, `?fail` to make sends fail, `?reset` to clear it.

## Constraints

- Permissions: 1.x shipped `contextMenus` and `storage`. Adding a permission with an install warning (such as `tabs`, `notifications` or any host permission) disables the extension for existing users until they re-approve. Telegram's Bot API allows cross-origin requests, so none is needed for it. Its file host doesn't send `Access-Control-Allow-Origin` on successful downloads, so showing media sent to your bot asks for the optional `https://api.telegram.org/*` host permission on first use; optional permissions carry no install warning. Keep the token out of pages: download files as blobs, never put a file URL in `src` or `href`.
- Storage: every key is parsed with a zod schema in `src/lib/settings.ts`. Changing a schema must keep old stored data readable. 1.x data is migrated in `src/lib/legacy.ts`; keep its tests passing against the real 1.x shapes.
- Relay: never log or store message content, or request headers (they carry device tokens).
- UI: compose shadcn components and extend their variants in `src/components/ui` instead of restyling them at the call site; `shadcn/no-restyle` enforces this. Copy follows the `better-writing` skill: verb-first buttons, errors that say how to fix the problem, sentence case.
