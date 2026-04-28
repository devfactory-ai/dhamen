/**
 * IndexedDB helper for persisting scanned files across navigation.
 * localStorage has a ~5 MB limit; IndexedDB can store hundreds of MB.
 */

const DB_NAME = 'dhamen-file-cache';
const STORE_NAME = 'scan-files';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Store files under a session key */
export async function saveFilesToIdb(
  sessionId: string,
  files: File[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const entries = files.map((f) => ({
    name: f.name,
    type: f.type,
    blob: new Blob([f], { type: f.type }),
  }));
  store.put(entries, sessionId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Retrieve files for a session key, returns File[] */
export async function loadFilesFromIdb(
  sessionId: string,
): Promise<File[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.get(sessionId);
    req.onsuccess = () => {
      const entries = req.result as Array<{ name: string; type: string; blob: Blob }> | undefined;
      if (!entries) return resolve([]);
      resolve(entries.map((e) => new File([e.blob], e.name, { type: e.type })));
    };
    req.onerror = () => reject(req.error);
  });
}

/** Remove files for a session key */
export async function clearFilesFromIdb(
  sessionId: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(sessionId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
