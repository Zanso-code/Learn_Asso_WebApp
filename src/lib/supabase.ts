/**
 * Clients Supabase — la seule porte de sortie reseau de l'application.
 *
 * Rien dans `src/` ne fait de `fetch` direct : tout passe par ici, pour que la
 * session (et donc l'isolation RLS) soit toujours attachee.
 *
 * Il y a DEUX clients, parce qu'une association porte desormais deux identites
 * Supabase Auth :
 *
 *   supabase           le bureau. Mot de passe du compte, lecture seule.
 *                      Porte aussi la session de l'Admin Plateforme sur /admin.
 *   supabaseTresorier  le Tresorier. Mot de passe distinct, seul a pouvoir
 *                      ecrire — c'est la RLS qui le dit, plus le navigateur.
 *
 * Deux clients plutot qu'une bascule de session sur un seul : chacun persiste
 * son jeton sous sa propre cle, donc deverrouiller le role Tresorier ne detruit
 * pas la session du bureau, et le reverrouiller ne redemande pas le mot de
 * passe du compte. C'est aussi ce qui rend le deverrouillage hors ligne
 * possible — la session Tresorier survit sur l'appareil et se rafraichit seule.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Variables requises manquantes — vide quand tout est en place.
 *
 * Ce sont des constantes de BUILD : Vite remplace `import.meta.env.VITE_*` par
 * leur valeur au moment de la compilation. Une liste non vide signale donc un
 * paquet construit sans `.env.local`, jamais une panne de reseau — c'est ce qui
 * autorise `App.tsx` a en faire un ecran bloquant sans risquer de l'afficher a
 * un utilisateur simplement hors ligne.
 */
export const missingSupabaseEnv: string[] = [
  ...(url ? [] : ['VITE_SUPABASE_URL']),
  ...(publishableKey ? [] : ['VITE_SUPABASE_PUBLISHABLE_KEY']),
]

/**
 * Sans configuration, l'application doit encore se charger et afficher un
 * message clair plutot que planter au premier import — un `.env.local` oublie
 * est l'erreur de deploiement la plus courante.
 */
export const isSupabaseConfigured = missingSupabaseEnv.length === 0

if (!isSupabaseConfigured) {
  console.error(
    `Supabase non configure : ${missingSupabaseEnv.join(' et ')} manque(nt) dans .env.local`,
  )
}

// Valeurs de repli volontairement inertes : sans configuration, les clients se
// construisent quand meme pour que l'application affiche son message d'erreur
// au lieu de planter a l'import.
const effectiveUrl = url ?? 'http://localhost:54321'
const effectiveKey = publishableKey ?? 'sb_publishable_absent'

function build(storageKey: string): SupabaseClient {
  return createClient(effectiveUrl, effectiveKey, {
    auth: {
      // Cle de stockage explicite : c'est elle qui isole les deux sessions
      // l'une de l'autre dans localStorage.
      storageKey,
      // La session survit a la fermeture du navigateur : un tresorier qui
      // rouvre l'application hors ligne doit retomber directement sur son
      // grand livre.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    // Reseau 3G : inutile de saturer le canal temps reel.
    realtime: { params: { eventsPerSecond: 2 } },
  })
}

/** Session du bureau : lecture, identite du compte, console plateforme. */
export const supabase = build('assocaisse.auth.compte')

/** Session du Tresorier : la seule que la RLS autorise a ecrire. */
export const supabaseTresorier = build('assocaisse.auth.tresorier')

/**
 * Vrai quand une session Tresorier est reellement ouverte sur cet appareil.
 *
 * Maintenu par `platform.tsx` a chaque deverrouillage, verrouillage et
 * demarrage. Le moteur de synchronisation le lit de facon synchrone, au moment
 * de choisir le client d'ecriture — d'ou un drapeau de module plutot qu'un
 * `await getSession()`.
 */
let tresorierArme = false

export function setTresorierArme(value: boolean): void {
  tresorierArme = value
}

export function isTresorierArme(): boolean {
  return tresorierArme
}

/**
 * Le client a utiliser pour ECRIRE.
 *
 * Sans session Tresorier, renvoie volontairement le client du bureau : la
 * requete part, et la RLS la refuse en 403. C'est le bon comportement — l'ecart
 * devient visible (l'operation part en rebut) au lieu d'etre avale en silence,
 * et surtout l'autorisation reste une decision de Postgres, jamais du client.
 */
export function writeClient(): SupabaseClient {
  return tresorierArme ? supabaseTresorier : supabase
}

/**
 * Vrai quand l'echec vient du reseau et non du serveur. Un echec reseau doit
 * laisser les operations dans la file d'attente ; une erreur 4xx doit au
 * contraire les en sortir, sinon la file se bloque pour toujours sur une
 * operation que le serveur refusera systematiquement.
 */
export function isOfflineError(error: unknown): boolean {
  if (!navigator.onLine) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /fetch|network|timeout|abort|failed to fetch/i.test(message)
}
