/**
 * Couche IndexedDB locale — le socle du mode hors ligne.
 *
 * Generalisation du petit wrapper qui vivait dans receipts.ts. Quatre magasins :
 *
 *   ledger    cle = associationId  -> l'objet DB complet (miroir du serveur)
 *   outbox    cle = seq (auto)     -> operations en attente d'envoi
 *   receipts  cle = <asso>/<key>   -> photos de recus (data URL JPEG)
 *   meta      cle = libre          -> curseurs de sync, secret tresorier cache
 *
 * localStorage ne convient plus : son quota (~5 Mo) etait deja la raison pour
 * laquelle les recus vivaient a part, et il faut desormais y ajouter le miroir
 * du grand livre et une file d'attente durable.
 */

const DB_NAME = 'assocaisse'
const DB_VERSION = 1

export type StoreName = 'ledger' | 'outbox' | 'receipts' | 'meta'

const STORES: StoreName[] = ['ledger', 'outbox', 'receipts', 'meta']

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue
        // L'outbox est la seule a etre auto-incrementee : la cle EST l'ordre
        // d'emission, et rejouer les operations dans le desordre corromprait
        // le grand livre (un patch avant son insert, par exemple).
        if (name === 'outbox') db.createObjectStore(name, { keyPath: 'seq', autoIncrement: true })
        else db.createObjectStore(name)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB bloquee par un autre onglet'))
  })
  // Un echec ne doit pas empoisonner definitivement le cache de promesse :
  // navigation privee, quota, onglet concurrent — tout cela peut se resoudre.
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

/** Promesse d'une requete IndexedDB unique. */
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Ouvre une transaction et resout a sa *completion*, pas a celle des requetes.
 *
 * `run` doit emettre toutes ses requetes de facon synchrone : une transaction
 * IndexedDB se referme des que la boucle d'evenements se vide, donc un `await`
 * place a l'interieur la ferait avorter.
 */
function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(name, mode)
        let result: T
        let failed: unknown = null
        run(tx.objectStore(name)).then(
          (value) => {
            result = value
          },
          (err) => {
            failed = err
          },
        )
        tx.oncomplete = () => (failed ? reject(failed) : resolve(result))
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('Transaction annulee'))
      }),
  )
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore(store, 'readonly', (s) => req<T | undefined>(s.get(key)))
}

export function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return withStore(store, 'readonly', (s) => req<T[]>(s.getAll()))
}

export function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<IDBValidKey> {
  return withStore(store, 'readwrite', (s) => req(key === undefined ? s.put(value) : s.put(value, key)))
}

export function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  return withStore(store, 'readwrite', async (s) => {
    await req(s.delete(key))
  })
}

/** Suppression groupee dans UNE transaction : la file se vide tout ou rien. */
export function idbDeleteMany(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return Promise.resolve()
  return withStore(store, 'readwrite', async (s) => {
    await Promise.all(keys.map((key) => req(s.delete(key))))
  })
}

export function idbClear(store: StoreName): Promise<void> {
  return withStore(store, 'readwrite', async (s) => {
    await req(s.clear())
  })
}

/** Cles presentes dans un magasin — sert au nettoyage des recus d'un tenant. */
export function idbKeys(store: StoreName): Promise<IDBValidKey[]> {
  return withStore(store, 'readonly', (s) => req(s.getAllKeys()))
}

/**
 * Ajoute a l'outbox en laissant IndexedDB attribuer le `seq`. Les autres
 * magasins passent par `idbPut`, qui exige une cle explicite.
 */
export function idbAppend(store: StoreName, value: unknown): Promise<number> {
  return withStore(store, 'readwrite', (s) => req(s.add(value))).then((key) => Number(key))
}

/** Sonde ponctuelle : navigation privee et anciens WebView n'ont pas d'IDB. */
export async function idbAvailable(): Promise<boolean> {
  try {
    await open()
    return true
  } catch {
    return false
  }
}
