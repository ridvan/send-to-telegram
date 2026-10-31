/**
 * Points the bot at the deployed worker and sets its command list.
 * Run after deploying: `pnpm --filter relay webhook` (reads .dev.vars).
 */
import { createBotClient } from '@send-to-telegram/core';
import { z } from 'zod';

import { WEBHOOK_SECRET_PATTERN } from '../src/crypto.ts';

const env = z
  .object({
    BOT_TOKEN: z.string().min(1),
    WEBHOOK_SECRET: z
      .string()
      .regex(
        WEBHOOK_SECRET_PATTERN,
        'Use 16–256 letters, digits, _ or -, for example from `openssl rand -hex 32`'
      ),
    RELAY_URL: z.url(),
  })
  .parse(process.env);

const bot = createBotClient(env.BOT_TOKEN);
const url = `${env.RELAY_URL.replace(/\/+$/, '')}/telegram/webhook`;

await bot.call('setWebhook', {
  url,
  secret_token: env.WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query', 'my_chat_member'],
});

await bot.call('setMyCommands', {
  commands: [
    { command: 'devices', description: 'See or unlink connected browsers' },
    { command: 'help', description: 'What this bot does' },
  ],
});

const info = await bot.call('getWebhookInfo', undefined);

console.log(`Webhook set to ${info.url}`);
