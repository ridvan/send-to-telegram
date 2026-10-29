import {
  type Delivery,
  DEVICE_TOKEN_PATTERN,
  type DeviceStatus,
  deviceStatusSchema,
  type OutgoingMessage,
  type Pairing,
  pairingSchema,
  RELAY_API_VERSION,
  type RelayErrorCode,
  relayDeliverySchema,
  relayErrorSchema,
  type RelayInfo,
  relayInfoSchema,
} from '@send-to-telegram/core';
import { browser } from 'wxt/browser';
import { z } from 'zod';

import { failureCopy, SendFailure } from './failure.ts';

/** The hosted relay this build talks to; empty when the build has none. */
export const RELAY_URL = (import.meta.env.WXT_RELAY_URL ?? '').replace(
  /\/+$/,
  ''
);

export const hasRelay = RELAY_URL !== '';

const failureByCode: Record<RelayErrorCode, SendFailure['reason']> = {
  unauthorized: 'unauthorized',
  chat_unavailable: 'chat_unavailable',
  rate_limited: 'rate_limited',
  invalid_request: 'rejected',
  telegram_error: 'rejected',
  not_found: 'rejected',
};

function relayFailure(code: RelayErrorCode, message: string): SendFailure {
  const reason = failureByCode[code];

  if (reason === 'unauthorized') {
    return new SendFailure(reason, failureCopy.relay_unauthorized);
  }

  if (reason === 'chat_unavailable' || reason === 'rate_limited') {
    return new SendFailure(reason, failureCopy[reason]);
  }

  return new SendFailure(reason, message);
}

async function request<S extends z.ZodType>(
  relayUrl: string,
  path: string,
  init: RequestInit & { token?: string },
  schema: S
): Promise<z.output<S>> {
  const { token, ...rest } = init;
  let response: Response;

  try {
    response = await fetch(`${relayUrl}/${RELAY_API_VERSION}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  } catch (cause) {
    throw new SendFailure('network', failureCopy.network, { cause });
  }

  const body =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const failure = relayErrorSchema.safeParse(body);

    throw failure.success
      ? relayFailure(failure.data.error.code, failure.data.error.message)
      : new SendFailure('network', failureCopy.network);
  }

  return schema.parse(body);
}

/** A random 256-bit token, base64url without padding. The relay keeps only its hash. */
export function createDeviceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

  if (!DEVICE_TOKEN_PATTERN.test(token)) throw new Error('Bad device token');

  return token;
}

export async function clientName(): Promise<string> {
  const browserName = navigator.userAgent.includes('Edg/')
    ? 'Edge'
    : import.meta.env.FIREFOX
      ? 'Firefox'
      : 'Chrome';

  const { os } = await browser.runtime.getPlatformInfo();

  const osName = {
    mac: 'macOS',
    win: 'Windows',
    linux: 'Linux',
    cros: 'ChromeOS',
    android: 'Android',
    openbsd: 'OpenBSD',
    fuchsia: 'Fuchsia',
  }[os];

  return osName ? `${browserName} on ${osName}` : browserName;
}

export function relayInfo(relayUrl: string): Promise<RelayInfo> {
  return request(relayUrl, '/info', { method: 'GET' }, relayInfoSchema);
}

export function startPairing(
  relayUrl: string,
  token: string,
  client: string
): Promise<Pairing> {
  return request(
    relayUrl,
    '/pairings',
    { method: 'POST', token, body: JSON.stringify({ client }) },
    pairingSchema
  );
}

export function deviceStatus(
  relayUrl: string,
  token: string
): Promise<DeviceStatus> {
  return request(
    relayUrl,
    '/device',
    { method: 'GET', token },
    deviceStatusSchema
  );
}

export async function unlinkDevice(relayUrl: string, token: string) {
  await request(relayUrl, '/device', { method: 'DELETE', token }, z.null());
}

export function relaySend(
  relayUrl: string,
  token: string,
  message: OutgoingMessage
): Promise<Delivery> {
  return request(
    relayUrl,
    '/messages',
    { method: 'POST', token, body: JSON.stringify(message) },
    relayDeliverySchema
  );
}

export function pairingLink(pairing: Pairing, group: boolean): string {
  const parameter = group ? 'startgroup' : 'start';

  return `https://t.me/${pairing.botUsername}?${parameter}=${pairing.code}`;
}
