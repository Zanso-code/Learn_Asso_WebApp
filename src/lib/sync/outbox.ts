/**
 * File d'attente durable des ecritures.
 *
 * Toute mutation s'applique d'abord en memoire (affichage instantane), se
 * recopie dans le miroir IndexedDB, puis depose ici une operation. Le moteur de
 * synchronisation vide cette file des que le reseau revient.
 *
 * Elle vit dans IndexedDB et non en memoire : un tresorier qui saisit vingt
 * cotisations en reunion, sans reseau, puis ferme l'onglet, doit retrouver ses
 * vingt operations en attente au redemarrage.
 */

import { idbAppend, idbDeleteMany, idbGet, idbGetAll, idbPut } from '../idb'
import type { EntityName } from './mapping'

/** Fenetre pendant laquelle deux patches sur la meme ligne fusionnent. */
const COALESCE_MS = 2000

/** Champs communs, `seq` etant attribue par IndexedDB (= ordre d'emission). */
interface OpMeta {
  seq: number
  associationId: string
  ts: number
}

export type OpBody =
  | { kind: 'insert'; entity: EntityName; item: Record<string, unknown> }
  | { kind: 'patch'; entity: EntityName; rowId: string; patch: Record<string, unknown> }
  | { kind: 'delete'; entity: EntityName; rowId: string }
  /** Les champs de l'association elle-meme (nom, tresorier, logo, devise...). */
  | { kind: 'assocPatch'; patch: Record<string, unknown> }
  | { kind: 'receiptPut'; receiptKey: string }
  | { kind: 'receiptDelete'; receiptKey: string }

export type Op = OpMeta & OpBody

/**
 * Une operation avant son passage en base : `seq` est attribue par IndexedDB et
 * `ts` par `enqueue`. Ecrit comme une intersection, et non comme un
 * `Omit<Op, ...>`, parce qu'`Omit` applique a une union ne conserve que les
 * proprietes communes a tous ses membres — ici, presque rien.
 */
export type NewOp = OpBody & { associationId: string }

export interface DeadOp {
  op: Op
  reason: string
  at: number
}

const DEAD_LETTER_KEY = 'deadletter'

/**
 * Derniere operation ajoutee dans cette session, pour fusionner sans relire
 * toute la file a chaque frappe clavier.
 */
let tail: Op | null = null

/**
 * Vrai pendant que le moteur vide la file. La fusion est alors interdite :
 * fusionner dans une operation que le moteur vient d'envoyer et s'apprete a
 * supprimer ferait disparaitre la modification fusionnee.
 */
let pushing = false

export function beginPush(): void {
  pushing = true
}

export function endPush(): void {
  pushing = false
  tail = null
}

async function coalesceInto(merged: Op): Promise<void> {
  await idbPut('outbox', merged)
  tail = merged
}

/**
 * Depose une operation.
 *
 * Fusionne avec la precedente quand elle vise la meme ligne a moins de deux
 * secondes d'intervalle. C'est ce qui rend supportables les champs relies
 * directement au store (`onChange={() => updateAssociation({ name })}`) : une
 * rafale de frappe produit une seule operation au lieu d'une par caractere.
 */
export async function enqueue(op: NewOp): Promise<void> {
  const now = Date.now()
  // Copie locale : `tail` est un `let` de module, dont TypeScript abandonne le
  // affinage de type des qu'un `await` s'intercale.
  const prev = tail

  const fresh =
    !pushing && prev !== null && prev.associationId === op.associationId && now - prev.ts < COALESCE_MS

  if (fresh && prev) {
    if (
      prev.kind === 'patch' &&
      op.kind === 'patch' &&
      prev.entity === op.entity &&
      prev.rowId === op.rowId
    ) {
      return coalesceInto({ ...prev, ts: now, patch: { ...prev.patch, ...op.patch } })
    }
    if (prev.kind === 'assocPatch' && op.kind === 'assocPatch') {
      return coalesceInto({ ...prev, ts: now, patch: { ...prev.patch, ...op.patch } })
    }
  }

  const seq = await idbAppend('outbox', { ...op, ts: now })
  tail = { ...op, ts: now, seq }
}

/** Operations en attente pour une association, dans l'ordre d'emission. */
export async function pending(associationId: string): Promise<Op[]> {
  const all = await idbGetAll<Op>('outbox')
  return all.filter((op) => op.associationId === associationId).sort((a, b) => a.seq - b.seq)
}

export async function pendingCount(associationId: string): Promise<number> {
  return (await pending(associationId)).length
}

/**
 * Cles `entite:id` ayant une operation non envoyee.
 *
 * Le pull s'en sert pour ne PAS ecraser une modification locale encore en
 * attente avec la version du serveur, qui est forcement plus ancienne.
 */
export async function pendingKeys(associationId: string): Promise<Set<string>> {
  const keys = new Set<string>()
  for (const op of await pending(associationId)) {
    if (op.kind === 'insert') keys.add(`${op.entity}:${String(op.item.id)}`)
    else if (op.kind === 'patch' || op.kind === 'delete') keys.add(`${op.entity}:${op.rowId}`)
    else if (op.kind === 'assocPatch') keys.add('association:self')
  }
  return keys
}

export async function remove(seqs: number[]): Promise<void> {
  await idbDeleteMany('outbox', seqs)
  if (tail && seqs.includes(tail.seq)) tail = null
}

export async function clearFor(associationId: string): Promise<void> {
  const ops = await pending(associationId)
  await remove(ops.map((op) => op.seq))
}

/**
 * Sort une operation que le serveur refuse (403, contrainte violee...) pour que
 * la file ne se bloque pas indefiniment dessus. Elle est conservee : il s'agit
 * le plus souvent d'argent enregistre, jamais quelque chose a jeter en silence.
 */
export async function deadLetter(op: Op, reason: string): Promise<void> {
  const existing = (await idbGet<DeadOp[]>('meta', DEAD_LETTER_KEY)) ?? []
  existing.push({ op, reason, at: Date.now() })
  await idbPut('meta', existing, DEAD_LETTER_KEY)
}

export async function deadLetters(): Promise<DeadOp[]> {
  return (await idbGet<DeadOp[]>('meta', DEAD_LETTER_KEY)) ?? []
}

export async function clearDeadLetters(): Promise<void> {
  await idbPut('meta', [], DEAD_LETTER_KEY)
}
