-- One row per browser. A row starts as a pending pairing (code set, chat
-- empty) and becomes linked when someone presses Start with that code.
-- Only a SHA-256 hash of the browser's token is stored, never the token.
CREATE TABLE devices (
  token_hash TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  pairing_code TEXT UNIQUE,
  pairing_expires_at INTEGER,
  chat_id INTEGER,
  chat_title TEXT,
  chat_type TEXT,
  created_at INTEGER NOT NULL,
  linked_at INTEGER,
  last_used_at INTEGER
);

CREATE INDEX devices_chat_id ON devices (chat_id);
