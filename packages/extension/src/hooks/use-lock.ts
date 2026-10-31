import { useSyncExternalStore } from 'react';

import { lockView } from '@/lib/lock';

/** Whether the password lock is on, and locked, on every page and the background. */
export function useLock() {
  return useSyncExternalStore(lockView.subscribe, lockView.snapshot);
}
