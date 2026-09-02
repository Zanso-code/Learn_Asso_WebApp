/**
 * Le peu qui reste dans localStorage.
 *
 * Le grand livre, la file d'attente et les photos vivent desormais dans
 * IndexedDB (voir src/lib/idb.ts), et les comptes sur le serveur. Ne subsiste
 * ici que la session : elle doit etre lisible de facon SYNCHRONE au tout
 * premier rendu, avant meme qu'IndexedDB ne soit ouverte, pour savoir quelle
 * association charger sans faire clignoter l'ecran de connexion.
 */

export const SESSION_KEY = 'assocaisse:session:v1'

/**
 * Compteur d'echecs du deverrouillage Tresorier.
 *
 * Il ralentit les tentatives repetees, sans pretendre les empecher : il vit du
 * cote de l'attaquant et reste effacable. Ce qui refuse reellement l'ecriture,
 * c'est la session Supabase Auth exigee par la RLS (voir platform.tsx).
 */
export const UNLOCK_ATTEMPTS_KEY = 'assocaisse:unlock-attempts:v1'

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.error('Sauvegarde impossible (quota du navigateur ?)', err)
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* navigation privee */
  }
}
