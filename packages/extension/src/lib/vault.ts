/**
 * The password lock's keys. A random data key encrypts the sealed stores; the
 * password and a recovery code each only wrap that key, so changing the
 * password re-wraps one key instead of every store. While unlocked, the data
 * key is kept in `storage.session`: in memory only, cleared when the browser
 * quits, and out of reach of content scripts.
 */

import { browser } from 'wxt/browser';
import { z } from 'zod';

/** OWASP's floor for PBKDF2-SHA256; about a third of a second in Chrome. */
export const KDF_ITERATIONS = 600_000;

export const MIN_PASSWORD_LENGTH = 8;

const VAULT_KEY = 'vault';
const SESSION_KEY = 'vaultKey';

/** Uses closer together than this don't move the auto-lock clock. */
const TOUCH_EVERY = 60_000;

const wrappedKeySchema = z.object({
  salt: z.string(),
  iterations: z.number().int().positive(),
  iv: z.string(),
  key: z.string(),
});

type WrappedKey = z.infer<typeof wrappedKeySchema>;

export const autoLockSchema = z.enum(['quit', '15m', '1h']);

export type AutoLock = z.infer<typeof autoLockSchema>;

const autoLockAfter: Record<AutoLock, number> = {
  quit: Number.POSITIVE_INFINITY,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
};

export const vaultSchema = z.object({
  version: z.literal(1),
  password: wrappedKeySchema,
  recovery: wrappedKeySchema,
  autoLock: autoLockSchema.catch('quit'),
  /**
   * Set while the lock is being turned on, until every store is sealed. A run
   * that stops partway never showed its recovery code, so the next unlock
   * turns the lock off again.
   */
  turningOn: z.boolean().optional(),
  /**
   * Set while the lock is being turned off: stores are written in the clear
   * again, and an interrupted run finishes at the next unlock.
   */
  turningOff: z.boolean().optional(),
});

export type Vault = z.infer<typeof vaultSchema>;

const sessionSchema = z.object({ key: z.string(), usedAt: z.number() });

/** A sealed value as stored: AES-GCM ciphertext and its nonce. */
export const envelopeSchema = z.object({
  sealed: z.literal(1),
  iv: z.string(),
  data: z.string(),
});

export type Envelope = z.infer<typeof envelopeSchema>;

const jsonSchema = z.json();

export type Json = z.infer<typeof jsonSchema>;

export type LockState = 'off' | 'locked' | 'unlocked';

/** A read or write that needs the data key while the extension is locked. */
export class LockedError extends Error {
  override name = 'LockedError';

  constructor() {
    super('Send to Telegram is locked. Unlock it, then try again.');
  }
}

/** Spread into `String.fromCharCode` in chunks; one call per byte overflows the stack on large values. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function wrappingKey(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapKey(
  dataKey: Uint8Array<ArrayBuffer>,
  secret: string,
  iterations: number
): Promise<WrappedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await wrappingKey(secret, salt, iterations);

  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataKey
  );

  return {
    salt: toBase64(salt),
    iterations,
    iv: toBase64(iv),
    key: toBase64(new Uint8Array(wrapped)),
  };
}

/** The data key, or undefined when the secret is wrong. */
export async function unwrapKey(
  wrapped: WrappedKey,
  secret: string
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const key = await wrappingKey(
    secret,
    fromBase64(wrapped.salt),
    wrapped.iterations
  );

  try {
    const dataKey = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(wrapped.iv) },
      key,
      fromBase64(wrapped.key)
    );

    return new Uint8Array(dataKey);
  } catch {
    // AES-GCM refuses to decrypt with the wrong key.
    return undefined;
  }
}

/** Letters and digits that can't be misread: no I, O, 0 or 1. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 32 characters of a 32-letter alphabet: 160 random bits, in groups of four. */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  // 256 is a multiple of 32, so taking the remainder adds no bias.
  const code = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % 32]).join(
    ''
  );

  return code.match(/.{4}/g)?.join('-') ?? code;
}

/** Ignores case, spaces and dashes, so a code typed by hand still works. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function readVault(): Promise<Vault | undefined> {
  const stored = await browser.storage.local.get(VAULT_KEY);
  const vault = vaultSchema.safeParse(stored[VAULT_KEY]);

  return vault.success ? vault.data : undefined;
}

export async function writeVault(vault: Vault) {
  await browser.storage.local.set({ [VAULT_KEY]: vault });
}

export async function removeVault() {
  await browser.storage.local.remove(VAULT_KEY);
}

/** The last imported key, so each read doesn't import it again. */
let imported: { raw: string; key: Promise<CryptoKey> } | undefined;

export async function storeSessionKey(dataKey: Uint8Array<ArrayBuffer>) {
  await browser.storage.session.set({
    [SESSION_KEY]: { key: toBase64(dataKey), usedAt: Date.now() },
  });
}

export async function clearSessionKey() {
  imported = undefined;
  await browser.storage.session.remove(SESSION_KEY);
}

function importDataKey(raw: string): Promise<CryptoKey> {
  if (imported?.raw !== raw) {
    imported = {
      raw,
      key: crypto.subtle.importKey('raw', fromBase64(raw), 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]),
    };
  }

  return imported.key;
}

/**
 * The data key while unlocked. Locks once the auto-lock time has passed since
 * the last use; `touch` counts this call as a use.
 */
async function currentKey(
  vault: Vault | undefined,
  touch = false
): Promise<CryptoKey | undefined> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  const session = sessionSchema.safeParse(stored[SESSION_KEY]);

  if (!session.success) return undefined;

  const { key, usedAt } = session.data;
  const now = Date.now();

  if (vault && now - usedAt > autoLockAfter[vault.autoLock]) {
    await clearSessionKey();

    return undefined;
  }

  if (touch && now - usedAt > TOUCH_EVERY) {
    await browser.storage.session.set({ [SESSION_KEY]: { key, usedAt: now } });
  }

  return importDataKey(key);
}

/**
 * Counts as a use, so a page left open doesn't lock while someone works in it.
 * Only clicks, keys and sends count: reading or writing sealed data doesn't,
 * or a page that polls would never lock.
 */
export async function touchSession() {
  await currentKey(await readVault(), true);
}

export async function lockState(): Promise<LockState> {
  const vault = await readVault();

  if (!vault) return 'off';

  return (await currentKey(vault)) ? 'unlocked' : 'locked';
}

/** Whether writes are sealed now: the lock is on and not being turned off. */
export async function sealsWrites(): Promise<boolean> {
  const vault = await readVault();

  return vault !== undefined && !vault.turningOff;
}

async function sealing(): Promise<CryptoKey | undefined> {
  const vault = await readVault();

  if (!vault || vault.turningOff) return undefined;

  const key = await currentKey(vault);

  if (!key) throw new LockedError();

  return key;
}

/**
 * Seals `bytes` when the lock is on, or returns undefined to store them in the
 * clear. `label` is bound into the ciphertext, so one store's data can't be
 * moved under another's name.
 */
export async function sealBytes(
  label: string,
  bytes: Uint8Array<ArrayBuffer> | Blob
): Promise<{ iv: string; data: Uint8Array<ArrayBuffer> } | undefined> {
  const key = await sealing();

  if (!key) return undefined;

  const iv = crypto.getRandomValues(new Uint8Array(12));

  // A blob is read only here, so one stored in the clear isn't copied for nothing.
  const plain = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes;

  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(label) },
    key,
    plain
  );

  return { iv: toBase64(iv), data: new Uint8Array(data) };
}

/**
 * The plain bytes, or undefined when the data was altered. Rejects with
 * `LockedError` while locked, so locked data never reads as missing.
 */
export async function openBytes(
  label: string,
  iv: string,
  data: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const key = await currentKey(await readVault());

  if (!key) throw new LockedError();

  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(iv),
        additionalData: encoder.encode(label),
      },
      key,
      data
    );

    return new Uint8Array(plain);
  } catch {
    return undefined;
  }
}

/** An envelope for `json` when the lock is on; undefined to store it as is. */
export async function sealJson(
  label: string,
  json: string
): Promise<Envelope | undefined> {
  const sealed = await sealBytes(label, encoder.encode(json));

  return sealed && { sealed: 1, iv: sealed.iv, data: toBase64(sealed.data) };
}

/** The sealed value, or undefined when it was altered. Rejects with `LockedError` while locked. */
export async function openJson(
  label: string,
  envelope: Envelope
): Promise<Json | undefined> {
  let data: Uint8Array<ArrayBuffer>;

  try {
    data = fromBase64(envelope.data);
  } catch {
    // Not base64: altered by hand, so as unreadable as a failed decryption.
    return undefined;
  }

  const plain = await openBytes(label, envelope.iv, data);

  if (!plain) return undefined;

  const json = jsonSchema.safeParse(JSON.parse(decoder.decode(plain)));

  return json.success ? json.data : undefined;
}

/** Calls `listener` when the lock is turned on or off, or locks or unlocks. */
export function watchLockKeys(listener: () => void) {
  const onChanged: Parameters<
    typeof browser.storage.onChanged.addListener
  >[0] = (changes, area) => {
    if (
      (area === 'local' && VAULT_KEY in changes) ||
      (area === 'session' && SESSION_KEY in changes)
    ) {
      listener();
    }
  };

  browser.storage.onChanged.addListener(onChanged);

  return () => browser.storage.onChanged.removeListener(onChanged);
}
