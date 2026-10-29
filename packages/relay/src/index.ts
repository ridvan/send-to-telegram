import { createBotClient } from '@send-to-telegram/core';

import { createApp, type Deps } from './app.ts';
import { d1Store } from './store.ts';

function deps(env: Env): Deps {
  return {
    store: d1Store(env.DB),
    bot: createBotClient(env.BOT_TOKEN),
    botUsername: env.BOT_USERNAME,
    webhookSecret: env.WEBHOOK_SECRET,
    async allow(limiter, key) {
      const binding = limiter === 'send' ? env.SEND_LIMITER : env.PAIR_LIMITER;
      const { success } = await binding.limit({ key });

      return success;
    },
    now: Date.now,
  };
}

const app = createApp(deps);

export default {
  fetch: app.fetch,
  async scheduled(_controller, env) {
    await d1Store(env.DB).purgeExpired(Date.now());
  },
} satisfies ExportedHandler<Env>;
