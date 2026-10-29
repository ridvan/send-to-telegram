import { useState } from 'react';

import { usePoll } from '@/hooks/use-poll';
import { checkInbox } from '@/lib/inbox';
import type { Destination } from '@/lib/settings';

/** Often enough that a link sent from a phone shows up while you look. */
const INTERVAL = 5000;

/**
 * Reads what was sent to your own bot in this chat while the popup is open.
 * The hosted bot can't: its relay never keeps message content. Pass `active`
 * false in private windows, which keep nothing.
 */
export function useInbox(
  destination: Destination | undefined,
  active: boolean
) {
  const bot = destination?.kind === 'bot' ? destination : undefined;
  // Bots that give their updates to a webhook or another app; asking again
  // would cut off that app's own read.
  const [elsewhere, setElsewhere] = useState<ReadonlySet<string>>(new Set());

  usePoll(
    async (signal) => {
      if (!bot) return;

      if ((await checkInbox(bot, signal)) === 'elsewhere') {
        setElsewhere((current) => new Set(current).add(bot.token));
      }
    },
    INTERVAL,
    active && bot !== undefined && !elsewhere.has(bot.token),
    bot?.id
  );
}
