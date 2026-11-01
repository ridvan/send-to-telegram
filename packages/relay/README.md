# Relay

The optional hosted bot behind "Use S2T Relay". It lets people link a browser to a chat by pressing Start, without creating a bot of their own.

## How it works

1. The extension makes a random 256-bit device token and asks the relay for a pairing code (`POST /v1/pairings`). The relay stores a SHA-256 hash of the token, never the token itself.
2. The extension opens `t.me/<bot>?start=<code>`, or `?startgroup=<code>` for a group. Pressing Start sends `/start <code>` to the bot's webhook, and the relay links that device to the chat.
3. The extension polls `GET /v1/device` until the link shows up, then sends with `POST /v1/messages`.

Codes expire after 10 minutes, and a daily cron removes unused ones. In Telegram, `/devices` lists the browsers linked to a chat, with a button to unlink each. Removing the bot from a group or blocking it unlinks every browser for that chat, and any member of a group can unlink its browsers. When Telegram upgrades a group to a supergroup, its links move to the new chat.

What is stored per device: the token hash, the browser's name (such as "Chrome on macOS"), the chat ID, title and type, and when it was linked and last used. Message content is never stored or logged. Invocation logs are off in `wrangler.jsonc` because they would record request headers.

## Deploy to Cloudflare

`wrangler.jsonc` holds no account or database IDs, so a fork deploys to its own account unchanged.

1. Create a bot with [@BotFather](https://t.me/BotFather). In `wrangler.jsonc`, set `BOT_USERNAME` to its username and the `routes` pattern to a hostname on your own Cloudflare zone. Linked browsers keep that address, so pick one you won't change.
2. Deploy. The first deploy creates the `send-to-telegram` D1 database and writes its ID into `wrangler.jsonc`; discard that change rather than committing it. Later deploys reuse the database bound to the deployed Worker, and D1 commands find it by name. Then create the table:

    ```bash
    pnpm run deploy
    git restore wrangler.jsonc
    pnpm db:migrate
    ```

3. Add the secrets. `WEBHOOK_SECRET` is 16–256 letters, digits, `_` or `-`, which is all Telegram accepts; `openssl rand -hex 32` makes one. The relay refuses every webhook until it's set:

    ```bash
    pnpm wrangler secret put BOT_TOKEN
    pnpm wrangler secret put WEBHOOK_SECRET
    ```

4. Point the bot at the worker. Copy `.dev.vars.example` to `.dev.vars` and fill in the token, secret and the worker's URL first:

    ```bash
    pnpm webhook
    ```

5. Build the extension with `WXT_RELAY_URL` set to the worker's URL.

Commands run from `packages/relay`, or from the repository root with `pnpm --filter relay <command>`.

## Limits

Each linked browser can send 30 messages a minute, and each IP address can request 10 pairing codes a minute. Both are set under `ratelimits` in `wrangler.jsonc`. Telegram itself allows a bot about 30 messages a second across all chats.

## API

All routes except `/v1/info` take `Authorization: Bearer <device token>`. Errors are `{ "error": { "code", "message" } }`; the shapes live in `packages/core/src/relay-api.ts`.

| Route                    | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `GET /v1/info`           | Bot username and relay version                                                     |
| `POST /v1/pairings`      | Starts linking; body `{ "client": "Chrome on macOS" }`                             |
| `GET /v1/device`         | `pending` or `linked` with the chat's title and type; 401 once expired or unlinked |
| `DELETE /v1/device`      | Unlinks this browser                                                               |
| `POST /v1/messages`      | Sends one message; body is an `OutgoingMessage`                                    |
| `POST /telegram/webhook` | Telegram updates, checked against `WEBHOOK_SECRET`                                 |
