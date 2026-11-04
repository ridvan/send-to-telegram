import { BotIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import type { Destination } from '@/lib/settings';

/**
 * Which bot a chat sends with, at the top of the chat, as Telegram opens a
 * bot's chat with what it does.
 */
export function ChatIntro({ destination }: { destination: Destination }) {
  const bot = destination.botUsername;

  return (
    <aside className="flex max-w-64 flex-col items-center gap-1 self-center rounded-2xl bg-service px-4 py-3 text-center text-xs text-service-foreground backdrop-blur-sm">
      <HugeiconsIcon
        icon={BotIcon}
        strokeWidth={1.8}
        aria-hidden
        className="mb-0.5 size-5"
      />
      <p className="font-semibold">
        {bot ? `Sent with your bot, @${bot}` : 'Sent with your own bot'}
      </p>
      <p className="text-pretty">
        {`Messages go straight from this browser to Telegram, and what people send ${bot ? `@${bot}` : 'it'} shows up here.`}
      </p>
    </aside>
  );
}
