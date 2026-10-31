import { browser } from 'wxt/browser';
import type { z } from 'zod';

import {
  type Envelope,
  envelopeSchema,
  LockedError,
  openJson,
  sealJson,
  sealsWrites,
} from './vault.ts';

type Listener<T> = (value: T) => void;

/**
 * One typed key in `storage.local`. Reads are parsed with the key's schema, so
 * corrupt or outdated data falls back to defaults instead of reaching the UI.
 * The last value is cached so React can read it synchronously.
 */
export type Store<T> = {
  readonly key: string;
  /**
   * Rejects with `LockedError` for a sealed store holding data while locked,
   * so locked data is never mistaken for none.
   */
  get: () => Promise<T>;
  /** Rejects with `LockedError` for a sealed store while locked. */
  set: (value: T) => Promise<void>;
  update: (change: (value: T) => T) => Promise<T>;
  /** Last value read or written, or the default before the first `get` and while locked. */
  snapshot: () => T;
  subscribe: (listener: Listener<T>) => () => void;
};

type StoreOptions = {
  /**
   * Encrypted with the password lock's key while the lock is on. Plain values
   * written before the lock still read.
   */
  sealed?: boolean;
};

/** Loads each store defined so far, so pages can read them all before rendering. */
const loaders = new Set<() => Promise<void>>();

/** Writes each sealed key again, sealed or plain as the lock now asks. */
const rewriters = new Set<() => Promise<void>>();

/**
 * Reads every defined store into its snapshot. A store left out would render
 * its default until something wrote to it, hiding what was already saved.
 */
export async function loadStores() {
  await Promise.all([...loaders].map((load) => load()));
}

/** Seals every sealed key after the lock is turned on, or opens it after it's turned off. */
export async function rewriteSealedStores() {
  for (const rewrite of rewriters) await rewrite();
}

/**
 * Writes `key` again sealed or plain, as the lock now asks. A value already in
 * that form is left alone, and so is one that can't be opened, rather than
 * replaced with a default.
 */
async function rewriteKey(key: string) {
  const stored = (await browser.storage.local.get(key))[key];

  if (stored === undefined) return;

  const envelope = envelopeSchema.safeParse(stored);

  if (envelope.success === (await sealsWrites())) return;

  const value = envelope.success ? await openJson(key, envelope.data) : stored;

  if (value === undefined) return;

  await browser.storage.local.set({
    [key]: (await sealJson(key, JSON.stringify(value))) ?? value,
  });
}

/** A key outside any store that the lock seals as well. */
export function sealKey(key: string) {
  rewriters.add(() => rewriteKey(key));
}

export function defineStore<S extends z.ZodType>(
  key: string,
  schema: S,
  fallback: () => z.output<S>,
  options: StoreOptions = {}
): Store<z.output<S>> {
  type Value = z.output<S>;

  const listeners = new Set<Listener<Value>>();
  let cached: Value | undefined;
  let initial: Value | undefined;
  let watching = false;
  let writes = Promise.resolve();
  // Decrypting is async; only the newest change may publish.
  let changes = 0;

  /** Unseals a sealed value; anything else is parsed as it was stored. */
  async function decode(
    envelope: z.ZodSafeParseResult<Envelope>,
    plain: () => z.ZodSafeParseResult<Value>
  ): Promise<Value> {
    const result = envelope.success
      ? schema.safeParse(await openJson(key, envelope.data))
      : plain();

    return result.success ? result.data : fallback();
  }

  /** Locked data shows as the default in pages and menus, which only display it. */
  function lockedAsDefault(cause: unknown): Value {
    if (cause instanceof LockedError) return fallback();

    throw cause;
  }

  async function encode(value: Value) {
    if (!options.sealed) return value;

    return (await sealJson(key, JSON.stringify(value))) ?? value;
  }

  function publish(value: Value) {
    cached = value;

    for (const listener of listeners) listener(value);
  }

  function watch() {
    if (watching) return;

    watching = true;
    browser.storage.onChanged.addListener((storageChanges, area) => {
      const change = storageChanges[key];

      if (area !== 'local' || !change) return;

      const current = ++changes;

      void decode(envelopeSchema.safeParse(change.newValue), () =>
        schema.safeParse(change.newValue)
      )
        .catch(lockedAsDefault)
        .then((value) => {
          if (current === changes) publish(value);
        });
    });
  }

  async function get(): Promise<Value> {
    // A write still sealing would otherwise be read over, and lost by `update`.
    await writes;

    const stored = await browser.storage.local.get(key);

    const value = await decode(envelopeSchema.safeParse(stored[key]), () =>
      schema.safeParse(stored[key])
    );

    cached = value;

    return value;
  }

  /** `get` for display: the default while locked, which also drops the cached data. */
  async function load(): Promise<Value> {
    const value = await get().catch(lockedAsDefault);

    cached = value;

    return value;
  }

  // Publishes at once for the UI; writes go one at a time, so sealing one
  // can't let an older value land after a newer one.
  function set(value: Value) {
    publish(value);

    const write = writes.then(async () => {
      await browser.storage.local.set({ [key]: await encode(value) });
    });

    writes = write.catch(() => undefined);

    // A refused write leaves the stored value; show that one again.
    return write.catch(async (cause: unknown) => {
      publish(await load());
      throw cause;
    });
  }

  loaders.add(async () => {
    await load();
  });

  if (options.sealed) {
    rewriters.add(() => {
      const rewrite = writes.then(() => rewriteKey(key));

      writes = rewrite.catch(() => undefined);

      return rewrite;
    });
  }

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
