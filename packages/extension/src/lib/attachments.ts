/**
 * Files attached in the popup, kept in IndexedDB so the background can send
 * them after the popup closes: runtime messages carry JSON, not files. Extension
 * pages and the background share one origin, so they share the database.
 */

import { z } from 'zod';

const DATABASE = 'attachments';
const STORE = 'files';

/** Long enough for any send in flight; a failed one keeps its file for retrying. */
const KEEP_UNREFERENCED_FOR = 60 * 60 * 1000;

const storedFileSchema = z.object({
  id: z.string(),
  file: z.instanceof(Blob),
  savedAt: z.number(),
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

export async function saveAttachment(id: string, file: Blob): Promise<void> {
  const stored: StoredFile = { id, file, savedAt: Date.now() };

  await run('readwrite', (store) => store.put(stored));
}

export async function loadAttachment(id: string): Promise<Blob | undefined> {
  const stored = storedFileSchema
    .optional()
    .safeParse(await run('readonly', (store) => store.get(id)));

  return stored.success ? stored.data?.file : undefined;
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
