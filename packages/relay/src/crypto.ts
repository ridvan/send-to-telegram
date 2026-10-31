/** Hex SHA-256; the relay identifies browsers by the hash of their token. */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/**
 * What Telegram accepts as a webhook secret (1–256 of [A-Za-z0-9_-]), with a
 * floor of 16 so a short or missing secret never opens the webhook.
 */
export const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

/** A random code that fits Telegram's /start payload: 32 characters of [A-Za-z0-9_-]. */
export function pairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}
