/**
 * Storage keys, in one place so the platform layer and the tenant store agree
 * on where a given association's ledger lives.
 */

export const PLATFORM_KEY = 'assocaisse:platform:v1'
export const SESSION_KEY = 'assocaisse:session:v1'
export const ADMIN_SESSION_KEY = 'assocaisse:admin-session:v1'

/** Each association's ledger is a separate entry — tenants never share one. */
export function tenantKey(associationId: string): string {
  return `assocaisse:tenant:${associationId}:v1`
}

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
    /* private browsing */
  }
}
