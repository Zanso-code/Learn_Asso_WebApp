/**
 * Password hashing for the local (browser-only) account model.
 *
 * PBKDF2-SHA256 with a per-secret random salt. This protects the stored
 * passwords from being read straight out of localStorage by someone borrowing
 * the phone — it is deliberately *not* a claim of server-grade security: an
 * app that runs entirely in the browser can always be bypassed by editing its
 * own storage. When this MVP grows a backend, move verification server-side
 * and keep this module only for the offline fallback.
 */

const ITERATIONS = 100_000
const encoder = new TextEncoder()

export interface Secret {
  salt: string
  hash: string
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes.buffer)
}

async function derive(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return toHex(bits)
}

export async function hashPassword(password: string): Promise<Secret> {
  const salt = randomSalt()
  return { salt, hash: await derive(password, salt) }
}

export async function verifyPassword(
  password: string,
  secret: Secret | null | undefined,
): Promise<boolean> {
  if (!secret?.salt || !secret.hash) return false
  const candidate = await derive(password, secret.salt)
  // Length-constant comparison; both operands are fixed-width hex digests.
  if (candidate.length !== secret.hash.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ secret.hash.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Shared rule for both passwords, surfaced in French next to the field.
 *
 * Huit caractères mêlant lettres et chiffres, et non plus six quelconques : le
 * mot de passe Trésorier est vérifié hors ligne contre le condensat mis en
 * cache, donc sans la limitation de fréquence du serveur. Six chiffres — le
 * réflexe naturel sur un téléphone — laissaient un espace de 10⁶, parcourable
 * par script sur un appareil emprunté.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.'
  if (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) {
    return 'Le mot de passe doit mêler des lettres et des chiffres.'
  }
  return null
}
