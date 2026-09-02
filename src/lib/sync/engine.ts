/**
 * Moteur de synchronisation.
 *
 * Deux moities :
 *   push — vide l'outbox vers Supabase, dans l'ordre d'emission.
 *   pull — recupere les lignes modifiees depuis le dernier curseur et les
 *          fusionne dans le grand livre en memoire.
 *
 * Resolution de conflit : dernier ecrivain gagne, ligne par ligne ET champ par
 * champ. Les inserts (cotisations, contributions, depenses) portent des
 * identifiants uniques et ne peuvent donc jamais entrer en collision ; les
 * modifications voyagent sous forme de patch partiel, si bien que deux
 * personnes qui editent des champs differents du meme membre conservent chacune
 * leur changement. Les suppressions sont des pierres tombales et l'emportent
 * sur une modification concurrente.
 */

import type { DB } from '../types'
import { isOfflineError, supabase, writeClient } from '../supabase'
import {
  ENTITIES,
  TABLES,
  fromRow,
  rowToAssociation,
  toAssociationPatchRow,
  toPatchRow,
  toRow,
  type EntityName,
  type SyncRow,
} from './mapping'
import * as outbox from './outbox'
import { cursorFor, loadCursor, saveCursor, type Cursor } from './ledger'
import { dataUrlToBlob, getLocalReceipt, receiptPath } from '../receipts'

/** Lignes par page de pull. Au-dela, on repagine sur le curseur. */
const PAGE = 1000

/**
 * Nombre d'essais avant de sortir une operation de la file.
 *
 * Sans ce plafond, une operation que le serveur refuse pour une raison
 * imprevue bloquerait la file pour toujours — et avec elle toutes les
 * cotisations saisies apres elle.
 */
const MAX_ATTEMPTS = 5

const attempts = new Map<number, number>()

type Verdict = 'ok' | 'retry' | 'dead'

interface Failure {
  error: unknown
  status?: number
}

function classify({ error, status }: Failure): Verdict {
  if (!error) return 'ok'
  if (isOfflineError(error)) return 'retry'
  // 403 = refus RLS, 400/422 = donnee invalide : rejouer ne changera rien.
  if (status === 403 || status === 400 || status === 422) return 'dead'
  // 401 (jeton expire), 5xx, contrainte temporairement violee : on rejoue.
  return 'retry'
}

function describe(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}
 
/* ----------------------------------------------------------------- push */

export async function push(associationId: string): Promise<{ pushed: number; offline: boolean }> {
  const ops = await outbox.pending(associationId)
  if (!ops.length) return { pushed: 0, offline: false }

  outbox.beginPush()
  let pushed = 0
  let offline = false

  try {
    let i = 0
    while (i < ops.length) {
      const op = ops[i]

      // Les inserts consecutifs de la meme entite partent en un seul upsert :
      // vingt cotisations saisies en reunion = une requete, pas vingt.
      if (op.kind === 'insert') {
        const batch: typeof ops = []
        while (i < ops.length) {
          const next = ops[i]
          if (next.kind !== 'insert' || next.entity !== op.entity) break
          batch.push(next)
          i++
        }
        const rows = batch.map((b) =>
          toRow(
            (b as Extract<outbox.Op, { kind: 'insert' }>).entity,
            (b as Extract<outbox.Op, { kind: 'insert' }>).item,
            associationId,
          ),
        )
        const failure = await attempt(() =>
          writeClient().from(TABLES[op.entity]).upsert(rows, { onConflict: 'id' }),
        )
        const verdict = decide(failure, batch.map((b) => b.seq))
        if (verdict === 'retry') {
          offline = true
          break
        }
        if (verdict === 'dead') {
          for (const b of batch) await outbox.deadLetter(b, describe(failure.error))
        }
        await outbox.remove(batch.map((b) => b.seq))
        pushed += batch.length
        continue
      }

      const failure = await applyOne(op, associationId)
      const verdict = decide(failure, [op.seq])
      if (verdict === 'retry') {
        offline = true
        break
      }
      if (verdict === 'dead') await outbox.deadLetter(op, describe(failure.error))
      await outbox.remove([op.seq])
      attempts.delete(op.seq)
      pushed += 1
      i++
    }
  } finally {
    outbox.endPush()
  }

  return { pushed, offline }
}

/** Compte les essais et finit par declarer mort ce qui ne passe jamais. */
function decide(failure: Failure, seqs: number[]): Verdict {
  const verdict = classify(failure)
  if (verdict !== 'retry') {
    for (const seq of seqs) attempts.delete(seq)
    return verdict
  }
  let exhausted = false
  for (const seq of seqs) {
    const n = (attempts.get(seq) ?? 0) + 1
    attempts.set(seq, n)
    if (n >= MAX_ATTEMPTS) exhausted = true
  }
  if (!exhausted) return 'retry'
  for (const seq of seqs) attempts.delete(seq)
  return 'dead'
}

async function attempt(
  run: () => PromiseLike<{ error: unknown; status?: number }>,
): Promise<Failure> {
  try {
    const res = await run()
    return { error: res.error, status: res.status }
  } catch (error) {
    // supabase-js laisse remonter les pannes reseau brutes.
    return { error }
  }
}

async function applyOne(op: outbox.Op, associationId: string): Promise<Failure> {
  switch (op.kind) {
    case 'patch':
      return attempt(() =>
        writeClient()
          .from(TABLES[op.entity])
          .update(toPatchRow(op.entity, op.patch))
          .eq('id', op.rowId),
      )

    case 'delete':
      // Pierre tombale, jamais de suppression physique : un appareil hors ligne
      // doit pouvoir apprendre au retour que la ligne a disparu.
      return attempt(() =>
        writeClient()
          .from(TABLES[op.entity])
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', op.rowId),
      )

    case 'assocPatch':
      return attempt(() =>
        writeClient()
          .from('associations')
          .update(toAssociationPatchRow(op.patch))
          .eq('id', associationId),
      )

    case 'receiptPut': {
      const dataUrl = await getLocalReceipt(associationId, op.receiptKey)
      // Photo evincee du cache avant son envoi : rien a televerser, et rien a
      // signaler — la depense reste valable sans son justificatif.
      if (!dataUrl) return { error: null }
      const blob = dataUrlToBlob(dataUrl)
      return attempt(async () => {
        const res = await writeClient().storage
          .from('receipts')
          .upload(`${receiptPath(associationId, op.receiptKey)}.jpg`, blob, {
            upsert: true,
            contentType: blob.type || 'image/jpeg',
          })
        return { error: res.error }
      })
    }

    case 'receiptDelete':
      return attempt(async () => {
        const res = await writeClient().storage
          .from('receipts')
          .remove([`${receiptPath(associationId, op.receiptKey)}.jpg`])
        return { error: res.error }
      })

    default:
      return { error: null }
  }
}

/* ----------------------------------------------------------------- pull */

type Identified = { id: string }

/**
 * Fusionne les lignes recues dans une collection.
 *
 * Une `Map` sert de collection : elle preserve l'ordre d'insertion (les
 * nouveaux arrivent a la fin, les modifications restent en place) tout en
 * offrant la recherche par identifiant, ce qu'un `Array.findIndex` dans une
 * boucle ne ferait qu'en temps quadratique.
 */
function mergeRows(
  current: Identified[],
  rows: SyncRow[],
  entity: EntityName,
  skip: Set<string>,
): { list: Identified[]; changed: boolean } {
  if (!rows.length) return { list: current, changed: false }

  const byId = new Map(current.map((item) => [item.id, item]))
  let changed = false

  for (const row of rows) {
    // Une modification locale pas encore envoyee est forcement plus recente que
    // ce que le serveur renvoie : la garder evite de la voir disparaitre sous
    // les yeux de l'utilisateur juste avant d'etre poussee.
    if (skip.has(`${entity}:${row.id}`)) continue

    if (row.deleted_at) {
      if (byId.delete(row.id)) changed = true
      continue
    }

    const next = fromRow(entity, row) as Identified
    const previous = byId.get(row.id)
    // Comparer avant d'ecrire n'est pas une micro-optimisation : nos propres
    // ecritures nous reviennent par le canal temps reel, et les reappliquer
    // sans distinction relancerait un rendu et une reecriture du miroir a
    // chaque fois — une boucle qui ne s'arreterait jamais.
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) continue

    byId.set(row.id, next)
    changed = true
  }

  return { list: changed ? Array.from(byId.values()) : current, changed }
}

async function fetchSince(
  table: string,
  associationId: string,
  since: string,
): Promise<{ rows: SyncRow[]; failure: Failure }> {
  const rows: SyncRow[] = []
  let cursor = since

  for (let page = 0; page < 50; page++) {
    const res = await supabase
      .from(table)
      .select('*')
      .eq('association_id', associationId)
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(PAGE)

    if (res.error) return { rows, failure: { error: res.error, status: res.status } }

    const batch = (res.data ?? []) as SyncRow[]
    rows.push(...batch)
    if (batch.length < PAGE) break

    const last = batch[batch.length - 1].updated_at
    // Toute une page partageant la meme `updated_at` ferait tourner la
    // pagination en rond : on s'arrete plutot que de boucler.
    if (last === cursor) break
    cursor = last
  }

  return { rows, failure: { error: null } }
}

export interface PullResult {
  changes: Partial<Record<EntityName, SyncRow[]>>
  accountRow: Record<string, unknown> | null
  /** A n'enregistrer qu'une fois les changements reellement appliques. */
  cursor: Cursor
  offline: boolean
}

/**
 * Rapatrie les lignes modifiees — sans rien fusionner.
 *
 * La fusion est deliberement laissee a l'appelant, qui l'applique de facon
 * synchrone sur le grand livre *courant*. Fusionner ici, sur l'instantane pris
 * au debut du pull, effacerait toute saisie faite pendant les quelques secondes
 * qu'aura dure la requete — precisement le scenario d'une reunion ou le reseau
 * revient pendant que le tresorier continue d'encaisser.
 */
export async function pull(associationId: string): Promise<PullResult> {
  const cursor: Cursor = await loadCursor(associationId)
  const nextCursor: Cursor = { ...cursor }
  const changes: Partial<Record<EntityName, SyncRow[]>> = {}
  let offline = false

  // La ligne `associations` porte a la fois les parametres du grand livre et
  // l'abonnement, que la couche plateforme relit derriere.
  let accountRow: Record<string, unknown> | null = null
  const assoc = await attempt(async () => {
    const res = await supabase.from('associations').select('*').eq('id', associationId).maybeSingle()
    accountRow = (res.data as Record<string, unknown> | null) ?? null
    return { error: res.error, status: res.status }
  })
  if (classify(assoc) === 'retry') offline = true

  for (const entity of ENTITIES) {
    const table = TABLES[entity]
    const { rows, failure } = await fetchSince(table, associationId, cursorFor(cursor, table))
    if (failure.error) {
      if (classify(failure) === 'retry') offline = true
      continue
    }
    if (!rows.length) continue
    changes[entity] = rows
    nextCursor[table] = rows[rows.length - 1].updated_at
  }

  return { changes, accountRow, cursor: nextCursor, offline }
}

/**
 * Applique un `PullResult` sur un grand livre. Purement synchrone, pour tenir
 * dans le meme tour de boucle que la mise a jour d'etat React.
 */
export function mergeChanges(
  base: DB,
  result: PullResult,
  skip: Set<string>,
): { db: DB; changed: boolean } {
  let db = base
  let changed = false

  if (result.accountRow && !skip.has('association:self')) {
    const association = rowToAssociation(result.accountRow)
    if (JSON.stringify(association) !== JSON.stringify(db.association)) {
      db = { ...db, association }
      changed = true
    }
  }

  for (const entity of ENTITIES) {
    const rows = result.changes[entity]
    if (!rows?.length) continue
    const merged = mergeRows(db[entity] as Identified[], rows, entity, skip)
    if (merged.changed) {
      db = { ...db, [entity]: merged.list } as DB
      changed = true
    }
  }

  return { db, changed }
}

/* ------------------------------------------------------------- sync complet */

export interface SyncOutcome {
  pull: PullResult
  /** Lignes a ne pas ecraser : elles ont une ecriture locale en attente. */
  skip: Set<string>
  pushed: number
  offline: boolean
  pending: number
}

/** Toujours push avant pull : nos ecritures priment sur ce qu'on relit. */
export async function sync(associationId: string): Promise<SyncOutcome> {
  const pushed = await push(associationId)
  const pulled = await pull(associationId)
  // Lu au plus pres de la fusion : toute operation deposee entre-temps doit
  // proteger sa ligne.
  const skip = await outbox.pendingKeys(associationId)
  return {
    pull: pulled,
    skip,
    pushed: pushed.pushed,
    offline: pushed.offline || pulled.offline,
    pending: await outbox.pendingCount(associationId),
  }
}

/** A appeler une fois la fusion appliquee et le miroir local enregistre. */
export async function commitCursor(associationId: string, result: PullResult): Promise<void> {
  if (result.offline) return
  await saveCursor(associationId, result.cursor)
}

/**
 * Premiere connexion sur un appareil : aucun miroir local, on repart de zero.
 */
export async function hydrate(
  associationId: string,
  blank: DB,
): Promise<{ db: DB; accountRow: Record<string, unknown> | null; offline: boolean }> {
  await saveCursor(associationId, {})
  const result = await pull(associationId)
  const skip = await outbox.pendingKeys(associationId)
  const merged = mergeChanges(blank, result, skip)
  await commitCursor(associationId, result)
  return { db: merged.db, accountRow: result.accountRow, offline: result.offline }
}
