/**
 * Turning the password lock on and off, unlocking and locking. The keys and
 * ciphers are in `vault.ts`; this moves the stored data between sealed and
 * plain as the lock changes.
 */

import { browser } from 'wxt/browser';

import { rewriteAttachments } from './attachments.ts';
// Defines the sealed stores, so turning the lock on or off rewrites them all.
import './settings.ts';
import { loadStores, rewriteSealedStores } from './storage.ts';
import { forgetFiles } from './telegram-files.ts';
import {
  type AutoLock,
  clearSessionKey,
  KDF_ITERATIONS,
  lockState,
  type LockState,
  newRecoveryCode,
  normalizeRecoveryCode,
  readVault,
  removeVault,
  storeSessionKey,
  touchSession,
  unwrapKey,
  type Vault,
  watchLockKeys,
  wrapKey,
  writeVault,
} from './vault.ts';

async function rewriteEverything() {
  await rewriteSealedStores();
  await rewriteAttachments();
}

/**
 * Turns the lock on and returns the recovery code, shown once. The session key
 * is stored before the vault, so the stores can be sealed as soon as the vault
 * says to. A run that fails is undone, and one that stops partway is undone at
 * the next unlock: either way its recovery code was never shown.
 */
export async function turnOnLock(
  password: string,
  iterations = KDF_ITERATIONS
): Promise<string> {
  if (await readVault()) throw new Error('The lock is already on');

  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const recoveryCode = newRecoveryCode();

  const [wrappedPassword, wrappedRecovery] = await Promise.all([
    wrapKey(dataKey, password, iterations),
    wrapKey(dataKey, normalizeRecoveryCode(recoveryCode), iterations),
  ]);

  const vault: Vault = {
    version: 1,
    password: wrappedPassword,
    recovery: wrappedRecovery,
    autoLock: 'quit',
  };

  await storeSessionKey(dataKey);
  await writeVault({ ...vault, turningOn: true });

  try {
    await rewriteEverything();
    // Received photos were cached in the clear; while locked they're downloaded each time.
    await forgetFiles();
    await writeVault(vault);
  } catch (cause) {
    try {
      await finishTurningOff(vault);
    } catch (undoCause) {
      // Left as it is, the next unlock finishes undoing it.
      console.error('Could not undo turning on the lock', undoCause);
    }

    throw cause;
  }

  return recoveryCode;
}

/** Writes every store in the clear again, then forgets the keys. */
async function finishTurningOff(vault: Vault) {
  await writeVault({ ...vault, turningOff: true });
  await rewriteEverything();
  await removeVault();
  // Another page or the background may have sealed a write after reading the
  // vault from before `turningOff`; the key is still here to open it.
  await rewriteEverything();
  await clearSessionKey();
}

/** Opens the vault with its data key, finishing a turn-on or turn-off that was interrupted. */
async function openWith(vault: Vault, dataKey: Uint8Array<ArrayBuffer>) {
  await storeSessionKey(dataKey);

  if (vault.turningOn || vault.turningOff) await finishTurningOff(vault);
}

/** False when the password is wrong. */
export async function unlock(password: string): Promise<boolean> {
  const vault = await readVault();

  if (!vault) return true;

  const dataKey = await unwrapKey(vault.password, password);

  if (!dataKey) return false;

  await openWith(vault, dataKey);

  return true;
}

/** Unlocks with the recovery code and sets a new password. False when the code is wrong. */
export async function resetPassword(
  recoveryCode: string,
  password: string
): Promise<boolean> {
  const vault = await readVault();

  if (!vault) return true;

  const dataKey = await unwrapKey(
    vault.recovery,
    normalizeRecoveryCode(recoveryCode)
  );

  if (!dataKey) return false;

  const wrapped = await wrapKey(dataKey, password, vault.password.iterations);
  const next = { ...vault, password: wrapped };

  await writeVault(next);
  await openWith(next, dataKey);

  return true;
}

/** False when the current password is wrong. */
export async function changePassword(
  current: string,
  password: string
): Promise<boolean> {
  const vault = await readVault();

  if (!vault) return false;

  const dataKey = await unwrapKey(vault.password, current);

  if (!dataKey) return false;

  const wrapped = await wrapKey(dataKey, password, vault.password.iterations);

  await writeVault({ ...vault, password: wrapped });

  return true;
}

/** False when the password is wrong. */
export async function turnOffLock(password: string): Promise<boolean> {
  const vault = await readVault();

  if (!vault) return true;

  const dataKey = await unwrapKey(vault.password, password);

  if (!dataKey) return false;

  await storeSessionKey(dataKey);
  await finishTurningOff(vault);

  return true;
}

export async function setAutoLock(autoLock: AutoLock) {
  const vault = await readVault();

  if (!vault) return;

  // Counted from now, so a shorter time doesn't lock at once.
  await touchSession();
  await writeVault({ ...vault, autoLock });
}

export async function lockNow() {
  await clearSessionKey();
}

/**
 * Removes chats, settings, history and the lock, for a fresh start. The only
 * way back in when both the password and recovery code are lost.
 */
export async function resetExtension() {
  await browser.storage.local.clear();
  await clearSessionKey();
  // Received photos are cached apart from storage.
  await forgetFiles();
}

export async function readAutoLock(): Promise<AutoLock | undefined> {
  return (await readVault())?.autoLock;
}

type LockView = { state: LockState; autoLock: AutoLock | undefined };

let view: LockView = { state: 'off', autoLock: undefined };
let loaded = false;
const listeners = new Set<() => void>();
let loading = Promise.resolve();
let unwatch: (() => void) | undefined;

/**
 * Reads the lock's state for pages, and the stores with it the first time.
 * Stores are read again on every change, so an unlocked page shows its data
 * and a locked one keeps none of it.
 */
export function loadLock(): Promise<void> {
  loading = loading.then(async () => {
    const [state, autoLock] = await Promise.all([lockState(), readAutoLock()]);
    const changed = !loaded || state !== view.state;

    if (changed) await loadStores();

    loaded = true;

    if (changed || autoLock !== view.autoLock) {
      view = { state, autoLock };

      for (const listener of listeners) listener();
    }
  });
  loading = loading.catch((cause: unknown) => {
    console.error('Could not read the lock', cause);
  });

  return loading;
}

export const lockView = {
  snapshot: () => view,
  subscribe(listener: () => void) {
    if (listeners.size === 0) unwatch = watchLockKeys(() => void loadLock());

    listeners.add(listener);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) unwatch?.();
    };
  },
};
