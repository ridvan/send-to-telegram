import { browser } from 'wxt/browser';
import type { z } from 'zod';

type Listener<T> = (value: T) => void;

/**
 * One typed key in `storage.local`. Reads are parsed with the key's schema, so
 * corrupt or outdated data falls back to defaults instead of reaching the UI.
 * The last value is cached so React can read it synchronously.
 */
export type Store<T> = {
  readonly key: string;
  get: () => Promise<T>;
  set: (value: T) => Promise<void>;
  update: (change: (value: T) => T) => Promise<T>;
  /** Last value read or written, or the default before the first `get`. */
  snapshot: () => T;
  subscribe: (listener: Listener<T>) => () => void;
};

/** Loads each store defined so far, so pages can read them all before rendering. */
const loaders = new Set<() => Promise<void>>();

/**
 * Reads every defined store into its snapshot. A store left out would render
 * its default until something wrote to it, hiding what was already saved.
 */
export async function loadStores() {
  await Promise.all([...loaders].map((load) => load()));
}

export function defineStore<S extends z.ZodType>(
  key: string,
  schema: S,
  fallback: () => z.output<S>
): Store<z.output<S>> {
  type Value = z.output<S>;

  const listeners = new Set<Listener<Value>>();
  let cached: Value | undefined;
  let initial: Value | undefined;
  let watching = false;

  function valueOf(result: z.ZodSafeParseResult<Value>): Value {
    return result.success ? result.data : fallback();
  }

  function publish(value: Value) {
    cached = value;

    for (const listener of listeners) listener(value);
  }

  function watch() {
    if (watching) return;

    watching = true;
    browser.storage.onChanged.addListener((changes, area) => {
      const change = changes[key];

      if (area === 'local' && change)
        publish(valueOf(schema.safeParse(change.newValue)));
    });
  }

  async function get(): Promise<Value> {
    const stored = await browser.storage.local.get(key);
    const value = valueOf(schema.safeParse(stored[key]));

    cached = value;

    return value;
  }

  async function set(value: Value) {
    publish(value);
    await browser.storage.local.set({ [key]: value });
  }

  loaders.add(async () => {
    await get();
  });

  return {
    key,
    get,
    set,
    async update(change) {
      const next = change(await get());

      await set(next);

      return next;
    },
    snapshot() {
      if (cached !== undefined) return cached;

      initial ??= fallback();

      return initial;
    },
    subscribe(listener) {
      watch();
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
}
