/**
 * Files attached in the popup, kept in IndexedDB so the background can send
 * them after the popup closes: runtime messages carry JSON, not files. Extension
 * pages and the background share one origin, so they share the database.
 */

import { z } from 'zod';

import { openBytes, sealBytes, sealsWrites } from './vault.ts';

const DATABASE = 'attachments';
const STORE = 'files';

/** Long enough for any send in flight; a failed one keeps its file for retrying. */
const KEEP_UNREFERENCED_FOR = 60 * 60 * 1000;

const storedFileSchema = z.object({
  id: z.string(),
  /** Ciphertext when `iv` is present, under the password lock. */
  file: z.instanceof(Blob),
  savedAt: z.number(),
  iv: z.string().optional(),
  /** The plain file's MIME type, which a sealed blob can't carry. */
  type: z.string().optional(),
});

type StoredFile = z.infer<typeof storedFileSchema>;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await open();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));

      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

const label = (id: string) => `attachment:${id}`;

async function writeFile(id: string, file: Blob, savedAt: number) {
  const sealed = await sealBytes(label(id), file);

  const stored: StoredFile = sealed
    ? {
        id,
        file: new Blob([sealed.data]),
        savedAt,
        iv: sealed.iv,
        type: file.type,
      }
    : { id, file, savedAt };

  await run('readwrite', (objects) => objects.put(stored));
}

async function unseal(stored: StoredFile): Promise<Blob | undefined> {
  if (!stored.iv) return stored.file;

  const plain = await openBytes(
    label(stored.id),
    stored.iv,
    new Uint8Array(await stored.file.arrayBuffer())
  );

  return plain && new Blob([plain], { type: stored.type ?? '' });
}

export async function saveAttachment(id: string, file: Blob): Promise<void> {
  await writeFile(id, file, Date.now());
}

/** The file, or undefined when it's gone. Rejects with `LockedError` while locked. */
export async function loadAttachment(id: string): Promise<Blob | undefined> {
  const stored = storedFileSchema
    .optional()
    .safeParse(await run('readonly', (objects) => objects.get(id)));

  return stored.success && stored.data ? unseal(stored.data) : undefined;
}

export async function deleteAttachment(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

/** Deletes files older than an hour that no failed message could send again. */
export async function pruneAttachments(keep: ReadonlySet<string>) {
  const stored = z
    .array(storedFileSchema)
    .catch([])
    .parse(await run('readonly', (store) => store.getAll()));

  const cutoff = Date.now() - KEEP_UNREFERENCED_FOR;

  const stale = stored.filter(
    (item) => item.savedAt < cutoff && !keep.has(item.id)
  );

  await Promise.all(stale.map((item) => deleteAttachment(item.id)));
}

/**
 * Saves every file again, sealed or plain as the password lock now asks. Files
 * already in that form are left alone.
 */
export async function rewriteAttachments() {
  const sealing = await sealsWrites();

  const stored = z
    .array(storedFileSchema)
    .catch([])
    .parse(await run('readonly', (objects) => objects.getAll()));

  for (const item of stored) {
    if ((item.iv !== undefined) === sealing) continue;

    const file = await unseal(item);

    if (file) await writeFile(item.id, file, item.savedAt);
  }
}
