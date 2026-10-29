import { useSyncExternalStore } from 'react';

import type { Store } from '@/lib/storage';

/** Reads a store and re-renders when any page or the background changes it. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.snapshot);
}
