/**
 * Miroir local du grand livre.
 *
 * Le serveur fait autorite, mais le client garde en permanence une copie
 * complete du `DB` de l'association connectee. C'est ce qui permet a
 * `src/lib/selectors.ts` et aux neuf pages de continuer a travailler sur un
 * objet en memoire, et a l'application de s'ouvrir instantanement — puis de
 * fonctionner entierement — sans reseau.
 */

import type { DB } from '../types'
import { idbDelete, idbGet, idbPut } from '../idb'

/** Curseur de pull : derniere `updated_at` recue, par table. */
export type Cursor = Record<string, string>

const EPOCH = '1970-01-01T00:00:00Z'

export async function loadLedger(associationId: string): Promise<DB | null> {
  try {
    return (await idbGet<DB>('ledger', associationId)) ?? null
  } catch {
    // IndexedDB indisponible (navigation privee, vieux WebView) : le mode hors
    // ligne est perdu, mais l'application doit rester utilisable en ligne.
    return null
  }
}

export async function saveLedger(associationId: string, db: DB): Promise<void> {
  await idbPut('ledger', db, associationId)
}

export async function clearLedger(associationId: string): Promise<void> {
  try {
    await idbDelete('ledger', associationId)
    await idbDelete('meta', cursorKey(associationId))
  } catch {
    /* rien a nettoyer */
  }
}

function cursorKey(associationId: string): string {
  return `cursor:${associationId}`
}

export async function loadCursor(associationId: string): Promise<Cursor> {
  try {
    return (await idbGet<Cursor>('meta', cursorKey(associationId))) ?? {}
  } catch {
    return {}
  }
}

export async function saveCursor(associationId: string, cursor: Cursor): Promise<void> {
  await idbPut('meta', cursor, cursorKey(associationId))
}

export function cursorFor(cursor: Cursor, table: string): string {
  return cursor[table] ?? EPOCH
}
