import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Miniflare } from 'miniflare';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { type DeviceStore, d1Store } from './store.ts';

// Runs the store's SQL against a local D1 with the real migration applied.
const mf = new Miniflare({
  workers: [
    {
      config: {
        name: 'relay-test',
        compatibilityDate: '2026-10-20',
        manifest: {
          mainModule: 'index.js',
          modules: {
            'index.js': {
              type: 'esm',
              contents: 'export default { fetch: () => new Response(null) }',
            },
          },
        },
        env: { DB: { type: 'd1', name: 'relay-test' } },
      },
    },
  ],
});

afterAll(() => mf.dispose());

const schema = await readFile(
  join(import.meta.dirname, '../migrations/0001_devices.sql'),
  'utf8'
);

let store: DeviceStore;

beforeEach(async () => {
  const db = await mf.getD1Database('DB');

  await db.exec('DROP TABLE IF EXISTS devices');

  // exec takes one statement per line.
  const statements = schema
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const statement of statements) await db.exec(statement);

  store = d1Store(db);
});

const group = { id: -1001234567890, title: 'Reading list', type: 'supergroup' };

async function pairing(tokenHash: string, code: string, expiresAt = 2_000) {
  await store.createPairing({
    tokenHash,
    client: 'Chrome on macOS',
    code,
    expiresAt,
    now: 1_000,
  });
}

describe('d1Store', () => {
  it('creates a pairing and finds it by token and code', async () => {
    await pairing('hash-a', 'code-a');

    expect(await store.findByToken('hash-a')).toEqual({
      tokenHash: 'hash-a',
      client: 'Chrome on macOS',
      pairingCode: 'code-a',
      pairingExpiresAt: 2_000,
      chatId: null,
      chatTitle: null,
      chatType: null,
      createdAt: 1_000,
      linkedAt: null,
    });
    expect((await store.findByCode('code-a'))?.tokenHash).toBe('hash-a');
    expect(await store.findByToken('missing')).toBeUndefined();
  });

  it('links a device and clears its code', async () => {
    await pairing('hash-a', 'code-a');
    await store.link('hash-a', { ...group, type: 'supergroup' }, 1_500);

    expect(await store.findByCode('code-a')).toBeUndefined();
    expect(await store.findByToken('hash-a')).toMatchObject({
      chatId: group.id,
      chatTitle: 'Reading list',
      chatType: 'supergroup',
      linkedAt: 1_500,
      pairingCode: null,
      pairingExpiresAt: null,
    });
  });

  it('lists, moves and removes the devices of a chat', async () => {
    await pairing('hash-a', 'code-a');
    await pairing('hash-b', 'code-b');
    await store.link('hash-a', { id: -42, title: 'Old', type: 'group' }, 1_100);
    await store.link('hash-b', { id: -42, title: 'Old', type: 'group' }, 1_200);
    await store.touch('hash-a', 1_300);

    expect(
      (await store.listForChat(-42)).map((device) => device.tokenHash)
    ).toEqual(['hash-a', 'hash-b']);

    await store.moveChat(-42, group.id);

    expect(await store.listForChat(-42)).toEqual([]);
    expect(await store.listForChat(group.id)).toHaveLength(2);
    expect((await store.findByToken('hash-a'))?.chatType).toBe('supergroup');

    await store.remove('hash-a');
    expect(await store.listForChat(group.id)).toHaveLength(1);

    await store.removeForChat(group.id);
    expect(await store.findByToken('hash-b')).toBeUndefined();
  });

  it('purges only unlinked pairings that have expired', async () => {
    await pairing('expired', 'code-a', 1_500);
    await pairing('pending', 'code-b', 5_000);
    await pairing('linked', 'code-c', 1_500);
    await store.link('linked', { ...group, type: 'supergroup' }, 1_200);

    await store.purgeExpired(2_000);

    expect(await store.findByToken('expired')).toBeUndefined();
    expect(await store.findByToken('pending')).toBeDefined();
    expect(await store.findByToken('linked')).toBeDefined();
  });

  it('keeps chat IDs beyond 32 bits intact', async () => {
    await pairing('hash-a', 'code-a');
    await store.link('hash-a', { ...group, type: 'supergroup' }, 1_500);

    expect((await store.findByToken('hash-a'))?.chatId).toBe(-1001234567890);
  });
});
