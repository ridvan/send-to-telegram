import { toast } from 'sonner';

import type { ChatItem } from '@/hooks/use-chat-items';
import {
  deleteCopy,
  type DeleteOutcome,
  deleteMessages,
} from '@/lib/chat-actions';
import { plural } from '@/lib/format';

/**
 * Says how a delete went. Messages Telegram kept are still here, and the
 * toast offers to remove them here only.
 */
export function announceDeletion(outcome: DeleteOutcome, count: number) {
  const { kept, problem, inTelegram } = outcome;

  // Nothing went anywhere, so there's nothing Telegram kept to remove here.
  if (outcome.locked) {
    toast.error(deleteCopy.locked);

    return;
  }

  if (kept.length > 0) {
    toast.error(
      plural(kept.length, {
        one: 'Telegram kept # message',
        other: 'Telegram kept # messages',
      }),
      {
        // Long enough to read why and choose.
        duration: 10_000,
        ...(problem && { description: problem }),
        action: {
          label: 'Remove here only',
          onClick: () => void removeHereOnly(kept),
        },
      }
    );

    return;
  }

  if (inTelegram === 0) {
    toast(
      plural(count, {
        one: 'Deleted # message from this browser',
        other: 'Deleted # messages from this browser',
      })
    );

    return;
  }

  toast(
    inTelegram === count
      ? plural(count, {
          one: 'Deleted here and in Telegram',
          other: 'Deleted # messages here and in Telegram',
        })
      : plural(count, {
          one: 'Deleted # message',
          other: 'Deleted # messages',
        }),
    inTelegram === count
      ? {}
      : {
          description: plural(inTelegram, {
            other: '# of them in Telegram too. The rest stay there.',
          }),
        }
  );
}

async function removeHereOnly(items: ChatItem[]) {
  await deleteMessages(items);
  toast(
    plural(items.length, {
      one: 'Removed from this browser. The message stays in Telegram.',
      other: 'Removed # messages from this browser. They stay in Telegram.',
    })
  );
}
