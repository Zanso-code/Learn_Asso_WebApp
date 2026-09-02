/**
 * Photos de recus.
 *
 * Le serveur (Supabase Storage, bucket `receipts`) fait autorite ; IndexedDB
 * sert a la fois de cache de lecture et de tampon d'envoi. Les blobs ne
 * transitent jamais par le grand livre : une depense ne garde qu'une cle.
 *
 * Isolation : la cle locale ET le chemin distant sont tous deux prefixes par
 * l'identifiant de l'association. L'ancien magasin partage laissait une
 * association heriter des photos orphelines d'une autre sur le meme appareil.
 * Le type `Expense.receiptKey` ne change pas pour autant — il reste une cle
 * nue, de sorte que l'export Excel et les enregistrements existants tiennent.
 */

import { idbDelete, idbGet, idbKeys, idbPut } from './idb'
import { enqueue } from './sync/outbox'
import { supabase } from './supabase'

/** Cle locale et chemin distant partagent la meme forme. */
export function receiptPath(associationId: string, key: string): string {
  return `${associationId}/${key}`
}

/** Data URL -> Blob, pour televerser sans repasser par le reseau en base64. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg'
  const binary = atob(encoded ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Ecrit la photo localement et programme son televersement. */
export async function putReceipt(
  associationId: string,
  key: string,
  dataUrl: string,
): Promise<void> {
  await idbPut('receipts', dataUrl, receiptPath(associationId, key))
  await enqueue({ associationId, kind: 'receiptPut', receiptKey: key })
}

/** Copie locale seule — utilisee par le moteur pour alimenter son cache. */
export async function cacheReceipt(
  associationId: string,
  key: string,
  dataUrl: string,
): Promise<void> {
  try {
    await idbPut('receipts', dataUrl, receiptPath(associationId, key))
  } catch {
    /* cache plein ou indisponible : la photo restera lue depuis le serveur */
  }
}

export async function getLocalReceipt(
  associationId: string,
  key: string,
): Promise<string | null> {
  try {
    return (await idbGet<string>('receipts', receiptPath(associationId, key))) ?? null
  } catch {
    return null
  }
}

/**
 * Cache local d'abord, serveur ensuite.
 *
 * L'ordre compte : hors ligne, ou sur une connexion 3G lente, une photo deja
 * vue doit s'afficher immediatement. Un telechargement reussi alimente le cache
 * pour la fois suivante.
 */
export async function getReceipt(associationId: string, key: string): Promise<string | null> {
  const cached = await getLocalReceipt(associationId, key)
  if (cached) return cached
  if (!navigator.onLine) return null

  try {
    const { data, error } = await supabase.storage
      .from('receipts')
      .download(`${receiptPath(associationId, key)}.jpg`)
    if (error || !data) return null
    const dataUrl = await blobToDataUrl(data)
    await cacheReceipt(associationId, key, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function deleteReceipt(associationId: string, key: string): Promise<void> {
  try {
    await idbDelete('receipts', receiptPath(associationId, key))
  } catch {
    /* une photo absente ne doit pas faire echouer la suppression de sa depense */
  }
  await enqueue({ associationId, kind: 'receiptDelete', receiptKey: key })
}

export async function deleteReceipts(associationId: string, keys: string[]): Promise<void> {
  for (const key of keys) await deleteReceipt(associationId, key)
}

/** Cles locales appartenant a une association — nettoyage a la deconnexion. */
export async function localReceiptKeys(associationId: string): Promise<string[]> {
  try {
    const prefix = `${associationId}/`
    const all = await idbKeys('receipts')
    return all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
  } catch {
    return []
  }
}

/** Purge le cache local d'une association sans toucher au serveur. */
export async function forgetLocalReceipts(associationId: string): Promise<void> {
  for (const path of await localReceiptKeys(associationId)) {
    try {
      await idbDelete('receipts', path)
    } catch {
      /* ignore */
    }
  }
}
