import { type ChatType, chatTypeSchema } from '@send-to-telegram/core';
import { z } from 'zod';

export type Device = {
  tokenHash: string;
  client: string;
  pairingCode: string | null;
  pairingExpiresAt: number | null;
  chatId: number | null;
  chatTitle: string | null;
  chatType: ChatType | null;
  createdAt: number;
  linkedAt: number | null;
};

export type LinkedChat = { id: number; title: string; type: ChatType };

/** Everything the relay remembers, which is only devices and the chat each one sends to. */
export type DeviceStore = {
  createPairing: (device: {
    tokenHash: string;
    client: string;
    code: string;
    expiresAt: number;
    now: number;
  }) => Promise<void>;
  findByToken: (tokenHash: string) => Promise<Device | undefined>;
  findByCode: (code: string) => Promise<Device | undefined>;
  link: (tokenHash: string, chat: LinkedChat, now: number) => Promise<void>;
  touch: (tokenHash: string, now: number) => Promise<void>;
  remove: (tokenHash: string) => Promise<void>;
  listForChat: (chatId: number) => Promise<Device[]>;
  removeForChat: (chatId: number) => Promise<void>;
  purgeExpired: (now: number) => Promise<void>;
};

const rowSchema = z.object({
  token_hash: z.string(),
  client: z.string(),
  pairing_code: z.string().nullable(),
  pairing_expires_at: z.number().nullable(),
  chat_id: z.number().nullable(),
  chat_title: z.string().nullable(),
  chat_type: chatTypeSchema.nullable(),
  created_at: z.number(),
  linked_at: z.number().nullable(),
});

function toDevice(row: z.infer<typeof rowSchema>): Device {
  return {
    tokenHash: row.token_hash,
    client: row.client,
    pairingCode: row.pairing_code,
    pairingExpiresAt: row.pairing_expires_at,
    chatId: row.chat_id,
    chatTitle: row.chat_title,
    chatType: row.chat_type,
    createdAt: row.created_at,
    linkedAt: row.linked_at,
  };
}

const COLUMNS =
  'token_hash, client, pairing_code, pairing_expires_at, chat_id, chat_title, chat_type, created_at, linked_at';

export function d1Store(db: D1Database): DeviceStore {
  async function one(statement: D1PreparedStatement) {
    const row = await statement.first();

    return row === null ? undefined : toDevice(rowSchema.parse(row));
  }

  return {
    async createPairing({ tokenHash, client, code, expiresAt, now }) {
      await db
        .prepare(
          'INSERT INTO devices (token_hash, client, pairing_code, pairing_expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(tokenHash, client, code, expiresAt, now)
        .run();
    },
    findByToken: (tokenHash) =>
      one(
        db
          .prepare(`SELECT ${COLUMNS} FROM devices WHERE token_hash = ?`)
          .bind(tokenHash)
      ),
    findByCode: (code) =>
      one(
        db
          .prepare(`SELECT ${COLUMNS} FROM devices WHERE pairing_code = ?`)
          .bind(code)
      ),
    async link(tokenHash, chat, now) {
      await db
        .prepare(
          'UPDATE devices SET chat_id = ?, chat_title = ?, chat_type = ?, linked_at = ?, pairing_code = NULL, pairing_expires_at = NULL WHERE token_hash = ?'
        )
        .bind(chat.id, chat.title, chat.type, now, tokenHash)
        .run();
    },
    async touch(tokenHash, now) {
      await db
        .prepare('UPDATE devices SET last_used_at = ? WHERE token_hash = ?')
        .bind(now, tokenHash)
        .run();
    },
    async remove(tokenHash) {
      await db
        .prepare('DELETE FROM devices WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
    },
    async listForChat(chatId) {
      const { results } = await db
        .prepare(
          `SELECT ${COLUMNS} FROM devices WHERE chat_id = ? ORDER BY linked_at`
        )
        .bind(chatId)
        .all();

      return results.map((row) => toDevice(rowSchema.parse(row)));
    },
    async removeForChat(chatId) {
      await db
        .prepare('DELETE FROM devices WHERE chat_id = ?')
        .bind(chatId)
        .run();
    },
    async purgeExpired(now) {
      await db
        .prepare(
          'DELETE FROM devices WHERE chat_id IS NULL AND pairing_expires_at < ?'
        )
        .bind(now)
        .run();
    },
  };
}
