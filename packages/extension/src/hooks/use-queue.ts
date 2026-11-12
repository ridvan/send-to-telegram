import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useStore } from '@/hooks/use-store';
import { isTrying, waitingCopy } from '@/lib/queue';
import { type QueuedSend, sendQueueStore } from '@/lib/settings';

/** Finds a failed entry's place in the queue, if it's waiting to be tried again. */
export function useQueued(): (entryId: string) => QueuedSend | undefined {
  const queue = useStore(sendQueueStore);

  return useMemo(() => {
    const byId = new Map(queue.map((item) => [item.entryId, item]));

    return (entryId) => byId.get(entryId);
  }, [queue]);
}

function subscribeOnline(onChange: () => void) {
  addEventListener('online', onChange);
  addEventListener('offline', onChange);

  return () => {
    removeEventListener('online', onChange);
    removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/**
 * "Trying again in 2 min", kept current while it shows, and whether a try is
 * under way, when Send now would add nothing.
 */
export function useWaiting(item: QueuedSend | undefined): {
  copy: string;
  trying: boolean;
} {
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!item) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 15_000);

    return () => clearInterval(timer);
  }, [item]);

  return item
    ? {
        copy: waitingCopy(item, online, now),
        trying: online && isTrying(item, now),
      }
    : { copy: '', trying: false };
}
