/**
 * Receipt images live in IndexedDB, not localStorage: a handful of 150 KB
 * photos would blow the ~5 MB localStorage quota and take the whole ledger
 * down with it. Blobs stay out of the JSON store; records keep only a key.
 */

const DB_NAME = 'assocaisse-receipts'
const STORE = 'receipts'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function putReceipt(key: string, dataUrl: string): Promise<void> {
  await tx('readwrite', (s) => s.put(dataUrl, key) as IDBRequest<IDBValidKey>)
}

export async function getReceipt(key: string): Promise<string | null> {
  try {
    const value = await tx<string | undefined>('readonly', (s) => s.get(key))
    return value ?? null
  } catch {
    return null
  }
}

export async function deleteReceipt(key: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(key) as IDBRequest<undefined>)
  } catch {
    /* a missing receipt is not worth failing the delete of its expense */
  }
}

export async function clearReceipts(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear() as IDBRequest<undefined>)
  } catch {
    /* ignore */
  }
}

/**
 * Delete a specific set of receipts. Multi-tenant safe: `clearReceipts` empties
 * the object store for *every* association on the device, so anything scoped to
 * one association must go through here with that association's own keys.
 */
export async function deleteReceipts(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteReceipt(key)))
}
