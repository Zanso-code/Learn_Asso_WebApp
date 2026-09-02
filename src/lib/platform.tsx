/**
 * Identite, session et abonnement — adosses a Supabase.
 *
 * Ce qui a change par rapport au modele « tout dans le navigateur » :
 *
 *   Mot de passe du compte  -> Supabase Auth (email + mot de passe). Verifie
 *                              par le serveur, limite en frequence, hache par
 *                              bcrypt.
 *   Role Tresorier          -> une SECONDE identite Supabase Auth, portee par
 *                              son propre client (`supabaseTresorier`). C'est
 *                              elle, et elle seule, que la RLS autorise a
 *                              ecrire.
 *   Admin Plateforme        -> un utilisateur Supabase inscrit dans la table
 *                              `platform_admins`. Il ne peut pas s'auto-
 *                              proclamer depuis le navigateur : cela se fait en
 *                              SQL, sinon le premier visiteur de /admin
 *                              prendrait la main sur toute la plateforme.
 *
 * Le role Tresorier n'est plus une barriere applicative. Il l'a ete : le role
 * etait un champ de localStorage, et le passer a `treasurer` a la main ouvrait
 * l'ecriture sur toute la comptabilite. Desormais, le deverrouillage ouvre une
 * vraie session Auth ; basculer un drapeau local ne fait plus qu'afficher des
 * boutons dont les requetes seront refusees par Postgres.
 *
 * Le deverrouillage hors ligne, lui, est preserve : la session Tresorier est
 * persistee sur l'appareil et se rafraichit seule, et le condensat PBKDF2 mis
 * en cache sert a reconnaitre le mot de passe saisi sans reseau. Seul le tout
 * premier deverrouillage sur un appareil donne exige une connexion.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AssociationAccount,
  PlatformContact,
  Role,
  Session,
  StoredSession,
  SubscriptionStatus,
} from './types'
import { hashPassword, verifyPassword, type Secret } from './auth'
import { SESSION_KEY, UNLOCK_ATTEMPTS_KEY, readJSON, removeKey, writeJSON } from './storage'
import { isOfflineError, setTresorierArme, supabase, supabaseTresorier } from './supabase'
import { idbGet, idbPut } from './idb'
import { defaultCategories } from './seed'
import { toRow } from './sync/mapping'
import { currentPeriod } from './format'
import { clearFor, pendingCount } from './sync/outbox'
import { clearLedger } from './sync/ledger'
import { forgetLocalReceipts } from './receipts'

const DEFAULT_CONTACT: PlatformContact = {
  nom: 'AssoCaisse',
  dialCode: '226',
  telephone: '',
  email: '',
}

const EMPTY_SECRET: Secret = { salt: '', hash: '' }

/**
 * Colonnes de `associations` — jamais `select('*')`, pour ne rien ramener par
 * accident. Écrit en une seule chaîne littérale : supabase-js analyse la liste
 * au niveau du type, et une concaténation lui ferait perdre ce littéral.
 */
const ACCOUNT_COLUMNS =
  'id, nom, sigle, ville, pays, responsable, dial_code, telephone, email, statut_abonnement, date_expiration_acces, date_creation, treasurer_user_id' as const

function accountCacheKey(id: string): string {
  return `account:${id}`
}

/**
 * Adresse du compte Tresorier, derivee de celle du compte de l'association.
 *
 * Le formulaire ne demande qu'un e-mail, et il en faut deux : le sous-adressage
 * `+tresorier` en fabrique un second, unique par compte (les adresses de
 * `auth.users` le sont deja) et delivre a la meme boite.
 */
export function treasurerEmail(accountEmail: string): string {
  // Minuscules : GoTrue normalise les adresses qu'il stocke, et cette fonction
  // sert aussi à comparer une session existante à celle attendue.
  const normalised = accountEmail.trim().toLowerCase()
  const at = normalised.lastIndexOf('@')
  if (at <= 0) return `tresorier.${normalised}`
  return `${normalised.slice(0, at)}+tresorier${normalised.slice(at)}`
}

/* ------------------------------------------------------- lignes -> domaine */

/**
 * `notes` ne vient plus de la ligne `associations` : c'est le mémo de l'Admin
 * Plateforme, désormais dans `association_notes`, invisible au locataire. Il
 * arrive donc par un paramètre séparé, vide partout sauf dans la console.
 */
function rowToAccount(
  row: Record<string, unknown>,
  secret: Secret,
  notes = '',
): AssociationAccount {
  const s = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
  return {
    id: s(row.id),
    nom: s(row.nom),
    sigle: s(row.sigle),
    ville: s(row.ville),
    pays: s(row.pays),
    responsable: s(row.responsable),
    dialCode: s(row.dial_code) || '226',
    telephone: s(row.telephone),
    email: s(row.email),
    statut_abonnement: (s(row.statut_abonnement) || 'essai') as SubscriptionStatus,
    date_expiration_acces: s(row.date_expiration_acces),
    date_creation: s(row.date_creation),
    secretTresorier: secret,
    treasurerUserId: typeof row.treasurer_user_id === 'string' ? row.treasurer_user_id : null,
    notes,
  }
}

function rowToContact(row: Record<string, unknown> | null): PlatformContact {
  if (!row) return DEFAULT_CONTACT
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  return {
    nom: s(row.nom) || DEFAULT_CONTACT.nom,
    dialCode: s(row.dial_code) || '226',
    telephone: s(row.telephone),
    email: s(row.email),
  }
}

/** Ce que `authMessage` sait lire : une erreur Supabase, ou son seul message. */
interface SupabaseErrorLike {
  message: string
  /** SQLSTATE Postgres (`42501`…) ou code PostgREST (`PGRST202`…), selon la couche. */
  code?: string
  details?: string | null
  hint?: string | null
}

const DROITS_MESSAGE = "Vous n'avez pas les droits nécessaires pour cette opération."
const SCHEMA_MESSAGE =
  "Base de données non à jour : une migration SQL n'a pas été appliquée. Contactez le support."
const GENERIC_MESSAGE =
  'Opération impossible pour le moment. Réessayez, puis contactez le support si cela persiste.'

/**
 * Messages Supabase traduits — l'utilisateur ne lit pas l'anglais.
 *
 * Le toast ne montre plus le message brut du serveur : il y remontait des noms
 * de tables, de contraintes et de politiques RLS. Mais le brut ne doit pas
 * disparaitre pour autant — il est journalise SYSTEMATIQUEMENT, y compris pour
 * les cas traduits. C'est ce qui manquait : un « droits insuffisants » ne disait
 * pas quelle table refusait, et les deux causes possibles (privilege de colonne
 * sur `associations`, RLS sur `association_notes`) etaient indiscernables.
 *
 * Le SQLSTATE prime sur le texte quand PostgREST le fournit ; GoTrue, lui,
 * n'envoie pas de code, d'ou le repli par sous-chaines.
 */
function authMessage(error: SupabaseErrorLike | string): string {
  const raw = typeof error === 'string' ? { message: error } : error
  console.error('Supabase :', {
    message: raw.message,
    code: raw.code,
    details: raw.details,
    hint: raw.hint,
  })

  // --- SQLSTATE / code PostgREST : la source la plus sure quand elle existe.
  switch (raw.code) {
    // Privilege de table ou de colonne refuse, RLS refusee, ou garde
    // `is_platform_admin()` de admin_set_subscription — dont le message est en
    // francais et echappait donc a la reconnaissance par sous-chaine.
    case '42501':
      return DROITS_MESSAGE
    // Colonne, table ou fonction absente : une migration n'a pas ete jouee.
    case '42703':
    case '42P01':
    case '42883':
    case 'PGRST202':
    case 'PGRST204':
      return SCHEMA_MESSAGE
    case '23514':
      return 'Une des valeurs saisies dépasse la taille autorisée.'
  }

  const text = raw.message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'Cet e-mail est déjà utilisé par une autre association.'
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.'
  }
  if (text.includes('email') && text.includes('invalid')) return "L'adresse e-mail n'est pas valide."
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'Connexion au serveur impossible. Vérifiez votre réseau.'
  }
  if (text.includes('permission denied') || text.includes('row-level security')) {
    return DROITS_MESSAGE
  }
  if (text.includes('violates check constraint')) {
    return 'Une des valeurs saisies dépasse la taille autorisée.'
  }
  if (text.includes('does not exist') || text.includes('schema cache')) return SCHEMA_MESSAGE
  return GENERIC_MESSAGE
}

function readStoredSession(): StoredSession | null {
  const stored = readJSON<StoredSession>(SESSION_KEY)
  return stored?.associationId ? { associationId: stored.associationId } : null
}

export interface NewAccountInput {
  nom: string
  sigle: string
  ville: string
  pays: string
  responsable: string
  dialCode: string
  telephone: string
  email: string
  motDePasseCompte: string
  motDePasseTresorier: string
  /** Optional, compressed data URL. */
  logo?: string
}

interface PlatformValue {
  contact: PlatformContact

  /** L'association connectée, ou null. */
  session: Session | null
  account: AssociationAccount | null
  role: Role
  isTreasurer: boolean
  /** Faux tant que la session n'a pas été restaurée au démarrage. */
  ready: boolean

  createAccount: (input: NewAccountInput) => Promise<AssociationAccount>
  /** Renvoie un message d'erreur en français, ou null si la connexion a réussi. */
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>

  /** Renvoie un message d'erreur en français, ou null si le rôle est ouvert. */
  unlockTreasurer: (password: string) => Promise<string | null>
  lockTreasurer: () => void
  changeTreasurerPassword: (current: string, next: string) => Promise<string | null>
  changeAccountPassword: (current: string, next: string) => Promise<string | null>

  /** Ligne `associations` fraîche, poussée par le moteur de synchronisation. */
  applyAccountRow: (row: Record<string, unknown>) => void

  /* --- Console plateforme --- */
  comptes: AssociationAccount[]
  isAdmin: boolean
  adminLogin: (email: string, password: string) => Promise<string | null>
  adminLogout: () => Promise<void>
  changeAdminPassword: (current: string, next: string) => Promise<string | null>
  refreshComptes: () => Promise<void>
  updateAccount: (id: string, patch: Partial<AssociationAccount>) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  updateContact: (patch: Partial<PlatformContact>) => Promise<void>
}

const PlatformContext = createContext<PlatformValue | null>(null)

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<AssociationAccount | null>(null)
  const [contact, setContact] = useState<PlatformContact>(DEFAULT_CONTACT)
  const [isAdmin, setIsAdmin] = useState(false)
  const [comptes, setComptes] = useState<AssociationAccount[]>([])
  const [ready, setReady] = useState(false)

  // Les actions asynchrones (login puis lecture de la fiche) peuvent s'enchainer
  // dans le meme tour de boucle ; cette reference leur evite de lire un `account`
  // fige par la fermeture du memo.
  const accountRef = useRef<AssociationAccount | null>(null)
  accountRef.current = account

  const contactRef = useRef<PlatformContact>(DEFAULT_CONTACT)
  contactRef.current = contact

  // La console lit la liste depuis un effet ; `updateAccount` a besoin de la
  // valeur courante sans pour autant dependre de l'etat, ce qui reinstallerait
  // l'effet a chaque rafraichissement.
  const comptesRef = useRef<AssociationAccount[]>([])
  comptesRef.current = comptes

  /**
   * Ouvre ou ferme le role Tresorier.
   *
   * Le drapeau de module cote `supabase.ts` decide quel client porte les
   * ecritures ; l'etat React n'est la que pour declencher le rendu. Ni l'un ni
   * l'autre n'est persiste : chaque ouverture de l'application repart en
   * lecture seule.
   */
  const armTresorier = useCallback((open: boolean) => {
    setTresorierArme(open)
    setSession((prev) => (prev ? { ...prev, role: open ? 'treasurer' : 'viewer' } : prev))
  }, [])

  const persistSession = useCallback((next: Session | null) => {
    setSession(next)
    // Seul l'identifiant est ecrit : le role reste en memoire (voir `Session`).
    if (next) writeJSON(SESSION_KEY, { associationId: next.associationId } satisfies StoredSession)
    else removeKey(SESSION_KEY)
  }, [])

  const cacheAccount = useCallback((next: AssociationAccount) => {
    setAccount(next)
    accountRef.current = next
    // Copie locale : c'est elle qui porte le statut d'abonnement et le secret
    // Tresorier quand l'application demarre sans reseau.
    void idbPut('meta', next, accountCacheKey(next.id)).catch(() => {})
  }, [])

  const applyAccountRow = useCallback(
    (row: Record<string, unknown>) => {
      // Le secret Tresorier ne voyage plus avec la ligne `associations` : il
      // vit dans sa propre table. On conserve donc celui deja en cache.
      const next = rowToAccount(row, accountRef.current?.secretTresorier ?? EMPTY_SECRET)
      if (JSON.stringify(next) === JSON.stringify(accountRef.current)) return
      cacheAccount(next)
    },
    [cacheAccount],
  )

  /** Fiche de l'association connectée, secret Trésorier compris. */
  const fetchOwnAccount = useCallback(async (): Promise<AssociationAccount | null> => {
    const { data, error } = await supabase
      .from('associations')
      .select(ACCOUNT_COLUMNS)
      .maybeSingle()
    if (error || !data) return null

    // Table séparée : l'Admin Plateforme lisait auparavant le condensat
    // Trésorier de chaque association en même temps que sa fiche.
    const { data: secretRow } = await supabase
      .from('treasurer_secrets')
      .select('secret')
      .maybeSingle()

    const secret = (secretRow?.secret ?? EMPTY_SECRET) as Secret
    return rowToAccount(data as Record<string, unknown>, secret)
  }, [])

  /* -------------------------------------------------------------- console
   *
   * Ces quatre actions sont définies hors du `useMemo` et sans dépendance : la
   * console les appelle depuis un effet, et une identité qui changerait à
   * chaque rendu ferait tourner cet effet en boucle — `refreshComptes` écrit
   * `comptes`, qui provoquerait le rendu suivant, qui rappellerait
   * `refreshComptes`. D'où les mises à jour fonctionnelles ci-dessous.
   */

  const refreshComptes = useCallback(async () => {
    const { data, error } = await supabase
      .from('associations')
      .select(ACCOUNT_COLUMNS)
      .order('date_creation', { ascending: false })
    if (error || !data) return

    // Les notes internes vivent à part et ne sont lisibles que par l'Admin
    // Plateforme. Une requête séparée plutôt qu'une jointure : côté locataire,
    // elle ne ramène simplement rien, ce qui est exactement l'effet recherché.
    const { data: noteRows } = await supabase
      .from('association_notes')
      .select('association_id, notes')
    const notesById = new Map(
      (noteRows ?? []).map((n) => [String(n.association_id), String(n.notes ?? '')]),
    )

    // Aucun secret ici : la console n'a pas à connaître les mots de passe
    // Trésorier, et la RLS de `treasurer_secrets` ne lui en donnerait aucun.
    setComptes(
      (data as Record<string, unknown>[]).map((r) =>
        rowToAccount(r, EMPTY_SECRET, notesById.get(String(r.id)) ?? ''),
      ),
    )
  }, [])

  /**
   * Enregistre une fiche depuis la console.
   *
   * Deux chemins d'ecriture distincts, et cet ordre precis :
   *
   *   1. L'ABONNEMENT d'abord, par `admin_set_subscription`. C'est l'operation
   *      critique — une association bloquee qui a paye attend son acces. Elle
   *      passait auparavant en second, derriere l'identite : le moindre refus
   *      sur `responsable`/`telephone` la faisait sauter en silence, l'admin
   *      voyant une erreur de droits sans savoir que le renouvellement n'avait
   *      meme pas ete tente.
   *   2. L'IDENTITE ensuite, par UPDATE direct — le seul chemin que les
   *      privileges de colonnes autorisent pour ces champs-la.
   *
   * Et surtout : on n'envoie QUE ce qui a change. Le modal transmet toujours
   * l'integralite de ses champs, y compris ceux auxquels l'admin n'a pas
   * touche ; sans ce filtrage, prolonger un abonnement declenchait une ecriture
   * inutile sur `associations` et ecrasait la note interne par une chaine vide.
   */
  const updateAccount = useCallback(async (id: string, patch: Partial<AssociationAccount>) => {
    const current = comptesRef.current.find((c) => c.id === id)

    /** Vrai quand le champ est present dans le patch ET reellement different. */
    const changed = <K extends keyof AssociationAccount>(key: K): boolean =>
      patch[key] !== undefined && (!current || patch[key] !== current[key])

    // --- 1. Abonnement : les colonnes qui portent le paywall ne sont accordées
    // à personne. Cette fonction `security definer` est le seul chemin, et elle
    // vérifie elle-même que l'appelant est bien l'Admin Plateforme. Les élargir
    // par un GRANT offrirait à chaque association un abonnement illimité.
    const touchesSubscription =
      changed('statut_abonnement') || changed('date_expiration_acces') || changed('notes')

    if (touchesSubscription) {
      // Une chaîne vide n'est pas une date : Postgres refuserait le cast. Mieux
      // vaut refuser ici, avec un message lisible.
      const expiry = patch.date_expiration_acces ?? current?.date_expiration_acces ?? ''
      if (!expiry) throw new Error("Date d'expiration manquante pour cette association.")

      const { error } = await supabase.rpc('admin_set_subscription', {
        target_id: id,
        new_statut: patch.statut_abonnement ?? current?.statut_abonnement ?? 'essai',
        new_expiry: expiry,
        // `null` = « ne touche pas à la note ». N'envoyer la note que si elle a
        // changé évite de l'effacer à chaque simple prolongation.
        new_notes: changed('notes') ? (patch.notes ?? '') : null,
      })
      if (error) throw new Error(authMessage(error))
    }

    // --- 2. Identité : UPDATE direct, couvert par les privilèges de colonnes.
    const row: Record<string, unknown> = {}
    if (changed('nom')) row.nom = patch.nom
    if (changed('sigle')) row.sigle = patch.sigle
    if (changed('ville')) row.ville = patch.ville
    if (changed('pays')) row.pays = patch.pays
    if (changed('responsable')) row.responsable = patch.responsable
    if (changed('dialCode')) row.dial_code = patch.dialCode
    if (changed('telephone')) row.telephone = patch.telephone
    if (changed('email')) row.email = patch.email

    if (Object.keys(row).length) {
      const { error } = await supabase.from('associations').update(row).eq('id', id)
      if (error) {
        // L'abonnement, lui, est déjà passé : le dire, sinon l'admin refait
        // l'opération en croyant que rien n'a été enregistré.
        const detail = authMessage(error)
        throw new Error(
          touchesSubscription
            ? `Abonnement enregistré, mais les coordonnées n'ont pas pu être modifiées. ${detail}`
            : detail,
        )
      }
    }

    setComptes((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const deleteAccount = useCallback(async (id: string) => {
    // Aucun `grant delete on associations` n'existe — volontairement. La
    // suppression passe par la fonction, qui contrôle l'appelant.
    // Les utilisateurs Supabase Auth survivent : les supprimer exige la clé de
    // service, qui n'a rien à faire dans un navigateur.
    const { error } = await supabase.rpc('admin_delete_association', { target_id: id })
    if (error) throw new Error(authMessage(error))
    await clearLedger(id).catch(() => {})
    await clearFor(id).catch(() => {})
    setComptes((list) => list.filter((c) => c.id !== id))
  }, [])

  const updateContact = useCallback(async (patch: Partial<PlatformContact>) => {
    const next = { ...contactRef.current, ...patch }
    setContact(next)
    contactRef.current = next
    const { error } = await supabase
      .from('platform_settings')
      .update({
        nom: next.nom,
        dial_code: next.dialCode,
        telephone: next.telephone,
        email: next.email,
      })
      .eq('id', true)
    if (error) throw new Error(authMessage(error))
  }, [])

  /* ------------------------------------------------------------ démarrage */

  useEffect(() => {
    let cancelled = false

    void (async () => {
      // Coordonnées publiques : /contact et /accès-expiré s'affichent sans
      // session. Hors ligne, la valeur par défaut suffit — d'où le silence en
      // cas d'échec plutôt qu'un rejet non traité au démarrage.
      void (async () => {
        try {
          const { data } = await supabase.from('platform_settings').select('*').maybeSingle()
          if (!cancelled && data) setContact(rowToContact(data as Record<string, unknown>))
        } catch {
          /* coordonnées par défaut */
        }
      })()

      // Toute ouverture repart en lecture seule, même si une session Trésorier
      // dort encore sur l'appareil : c'est elle qui rend le déverrouillage
      // possible hors ligne, mais elle ne s'arme jamais toute seule.
      setTresorierArme(false)

      const { data: auth } = await supabase.auth.getSession()
      if (cancelled) return

      if (!auth.session) {
        removeKey(SESSION_KEY)
        setReady(true)
        return
      }

      const { data: adminRow } = await supabase
        .from('platform_admins')
        .select('user_id')
        .maybeSingle()
      if (cancelled) return

      if (adminRow) {
        setIsAdmin(true)
        setReady(true)
        return
      }

      // La session locale donne l'identifiant sans réseau ; la fiche à jour
      // arrive derrière, si elle peut.
      const local = readStoredSession()
      if (local) setSession({ associationId: local.associationId, role: 'viewer' })

      const fresh = await fetchOwnAccount()
      if (cancelled) return

      if (fresh) {
        cacheAccount(fresh)
        persistSession({ associationId: fresh.id, role: 'viewer' })
      } else if (local) {
        // Hors ligne : on repart de la fiche mise en cache au dernier passage.
        const cached = await idbGet<AssociationAccount>('meta', accountCacheKey(local.associationId))
        if (cancelled) return
        if (cached) cacheAccount(cached)
        else {
          // Ni réseau ni cache, ou association supprimée côté serveur.
          removeKey(SESSION_KEY)
          setSession(null)
        }
      }

      setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [cacheAccount, persistSession, fetchOwnAccount])

  /* -------------------------------------------------------------- actions */

  const value = useMemo<PlatformValue>(() => {
    const role: Role = account && session?.role === 'treasurer' ? 'treasurer' : 'viewer'

    /**
     * Ouvre une session Auth Trésorier, en la créant si elle n'existe pas
     * encore (association antérieure à la migration, ou création interrompue).
     * Renvoie un message d'erreur, ou null.
     */
    async function openTreasurerSession(
      target: AssociationAccount,
      password: string,
    ): Promise<string | null> {
      // Session déjà persistée sur cet appareil : c'est ce qui rend le
      // déverrouillage possible en réunion, sans réseau.
      const { data: existing } = await supabaseTresorier.auth.getSession()
      if (existing.session) return null

      if (!navigator.onLine) {
        return "Premier déverrouillage sur cet appareil : connectez-vous à Internet une fois, puis réessayez."
      }

      const email = treasurerEmail(target.email)

      const { data: signIn, error: signInError } =
        await supabaseTresorier.auth.signInWithPassword({ email, password })

      if (!signInError && signIn.session && signIn.user) {
        // Fiche antérieure à la migration : le compte existe, le lien manque.
        if (!target.treasurerUserId) {
          const { error } = await supabase.rpc('set_treasurer_identity', {
            treasurer_uid: signIn.user.id,
          })
          if (error) return authMessage(error)
        }
        return null
      }

      if (signInError && isOfflineError(signInError)) {
        return 'Connexion au serveur impossible. Vérifiez votre réseau.'
      }

      // Le compte Trésorier existe côté serveur : l'échec ne peut venir que du
      // mot de passe.
      if (target.treasurerUserId) return 'Mot de passe Trésorier incorrect.'

      // Aucune identité Trésorier : on la crée avec le mot de passe qui vient
      // d'être validé contre le secret local.
      const { data: signUp, error: signUpError } = await supabaseTresorier.auth.signUp({
        email,
        password,
      })
      if (signUpError || !signUp.user) {
        return authMessage(signUpError ?? 'Création du rôle Trésorier impossible')
      }
      if (!signUp.session) {
        return "Le compte Trésorier attend une confirmation par e-mail. Désactivez « Confirm email » dans Supabase (Authentication → Providers → Email)."
      }

      const { error: linkError } = await supabase.rpc('set_treasurer_identity', {
        treasurer_uid: signUp.user.id,
      })
      if (linkError) return authMessage(linkError)

      return null
    }

    return {
      contact,
      // Une session qui pointe vers une association disparue vaut déconnexion.
      session: account ? session : null,
      account,
      role,
      isTreasurer: role === 'treasurer',
      ready,
      comptes,
      isAdmin,
      applyAccountRow,

      createAccount: async (input) => {
        const { data: signUp, error: signUpError } = await supabase.auth.signUp({
          email: input.email,
          password: input.motDePasseCompte,
        })
        if (signUpError || !signUp.user) {
          throw new Error(authMessage(signUpError ?? 'Inscription impossible'))
        }

        const { data: row, error } = await supabase
          .from('associations')
          .insert({
            auth_user_id: signUp.user.id,
            nom: input.nom,
            sigle: input.sigle,
            ville: input.ville,
            pays: input.pays,
            responsable: input.responsable,
            dial_code: input.dialCode,
            telephone: input.telephone,
            email: input.email,
            logo: input.logo ?? null,
            fiscal_start: `${currentPeriod().slice(0, 4)}-01`,
            // statut_abonnement et date_expiration_acces ne sont pas envoyés :
            // aucun GRANT ne les accorde, et la base applique d'elle-même
            // l'essai de 30 jours.
          })
          .select(ACCOUNT_COLUMNS)
          .single()

        if (error || !row) throw new Error(authMessage(error ?? 'Création impossible'))

        const associationId = String((row as Record<string, unknown>).id)

        // Secret Trésorier : sa table à part, écrite ici par le titulaire du
        // compte — c'est le seul moment où aucune identité Trésorier n'existe
        // encore, d'où une policy d'INSERT plus souple que celle d'UPDATE.
        const tresorier = await hashPassword(input.motDePasseTresorier)
        const { error: secretError } = await supabase
          .from('treasurer_secrets')
          .insert({ association_id: associationId, secret: tresorier })
        if (secretError) throw new Error(authMessage(secretError))

        // Identité Trésorier : le compte qui portera toutes les écritures.
        const email = treasurerEmail(input.email)
        const { data: tresoSignUp, error: tresoError } = await supabaseTresorier.auth.signUp({
          email,
          password: input.motDePasseTresorier,
        })
        if (tresoError || !tresoSignUp.user) {
          throw new Error(authMessage(tresoError ?? 'Création du rôle Trésorier impossible'))
        }
        if (!tresoSignUp.session) {
          throw new Error(
            "Le compte Trésorier attend une confirmation par e-mail. Désactivez « Confirm email » dans Supabase (Authentication → Providers → Email).",
          )
        }

        const { error: linkError } = await supabase.rpc('set_treasurer_identity', {
          treasurer_uid: tresoSignUp.user.id,
        })
        if (linkError) throw new Error(authMessage(linkError))

        // Catégories de départ. Elles passent par le client Trésorier : depuis
        // la migration 0002, la RLS refuse toute écriture au compte du bureau.
        const categories = defaultCategories()
        const { error: catError } = await supabaseTresorier
          .from('categories')
          .insert(categories.map((c) => toRow('categories', c, associationId)))
        if (catError) throw new Error(authMessage(catError))

        const created = rowToAccount(row as Record<string, unknown>, tresorier)
        cacheAccount(created)
        // On entre en lecture seule, comme à toute connexion : la session
        // Trésorier reste ouverte sur l'appareil, mais désarmée.
        setTresorierArme(false)
        persistSession({ associationId: created.id, role: 'viewer' })
        return created
      },

      login: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) return authMessage(error)

        const fresh = await fetchOwnAccount()
        if (!fresh) {
          await supabase.auth.signOut()
          return "Ce compte n'est rattaché à aucune association."
        }

        // Une session Trésorier laissée par une AUTRE association sur cet
        // appareil doit partir : la RLS refuserait de toute façon ses
        // écritures, mais mieux vaut ne pas la laisser traîner.
        const { data: leftover } = await supabaseTresorier.auth.getSession()
        const expected = treasurerEmail(fresh.email)
        if ((leftover.session?.user.email ?? '').toLowerCase() !== expected) {
          await supabaseTresorier.auth.signOut().catch(() => {})
        }

        cacheAccount(fresh)
        setTresorierArme(false)
        // Toujours en lecture seule : le rôle Trésorier a son propre mot de passe.
        persistSession({ associationId: fresh.id, role: 'viewer' })
        return null
      },

      logout: async () => {
        const id = session?.associationId
        if (id) {
          // Ne jamais jeter du travail non synchronisé : s'il reste des
          // opérations en attente, le miroir local est conservé pour que la
          // prochaine connexion du même compte les retrouve et les envoie.
          const remaining = await pendingCount(id).catch(() => 0)
          if (remaining === 0) {
            await clearLedger(id).catch(() => {})
            await forgetLocalReceipts(id).catch(() => {})
          }
        }
        // Les deux sessions partent : en laisser une derrière soi sur un
        // appareil partagé rendrait le prochain déverrouillage possible sans
        // réseau, donc sans le moindre contrôle serveur.
        setTresorierArme(false)
        await supabaseTresorier.auth.signOut().catch(() => {})
        await supabase.auth.signOut()
        persistSession(null)
        setAccount(null)
        accountRef.current = null
      },

      unlockTreasurer: async (password) => {
        const current = accountRef.current
        if (!current || !session) return 'Aucune association connectée.'

        // Freinage progressif. La vérification hors ligne se fait sans le
        // serveur, donc sans sa limitation de fréquence : au-delà de trois
        // échecs, chaque tentative coûte deux fois plus de temps que la
        // précédente, plafonnée à trente secondes. Sans effet pour un trésorier
        // qui se trompe, rédhibitoire pour un script.
        //
        // Ce compteur vit dans localStorage et reste donc effaçable : c'est un
        // ralentisseur, pas une barrière. La barrière, c'est la session Auth
        // exigée juste en dessous.
        const failed = readJSON<number>(UNLOCK_ATTEMPTS_KEY) ?? 0
        if (failed > 3) {
          await new Promise((r) => setTimeout(r, Math.min(30_000, 2 ** (failed - 3) * 1000)))
        }

        // 1. Garde locale : reconnaît le mot de passe sans réseau. Elle ne
        //    donne aucun droit à elle seule — elle évite juste un aller-retour
        //    serveur inutile et permet le cas hors ligne.
        if (!(await verifyPassword(password, current.secretTresorier))) {
          writeJSON(UNLOCK_ATTEMPTS_KEY, failed + 1)
          return 'Mot de passe Trésorier incorrect.'
        }

        // 2. Autorité réelle : une session Auth que la RLS reconnaît.
        const problem = await openTreasurerSession(current, password)
        if (problem) {
          // Un échec réseau n'est pas une tentative d'intrusion : seul un refus
          // du mot de passe incrémente le compteur.
          if (problem === 'Mot de passe Trésorier incorrect.') {
            writeJSON(UNLOCK_ATTEMPTS_KEY, failed + 1)
          }
          return problem
        }

        removeKey(UNLOCK_ATTEMPTS_KEY)
        armTresorier(true)
        return null
      },

      lockTreasurer: () => {
        // La session Trésorier reste persistée — c'est elle qui autorisera le
        // prochain déverrouillage hors ligne — mais elle est désarmée : le mot
        // de passe sera redemandé, et `writeClient()` repasse au compte du
        // bureau, à qui Postgres refuse toute écriture.
        armTresorier(false)
      },

      changeTreasurerPassword: async (current, next) => {
        const target = accountRef.current
        if (!target) return 'Aucune association connectée.'
        if (!(await verifyPassword(current, target.secretTresorier))) {
          return 'Mot de passe Trésorier actuel incorrect.'
        }
        if (!navigator.onLine) {
          return 'Changement de mot de passe impossible hors ligne.'
        }

        const { data: open } = await supabaseTresorier.auth.getSession()
        if (!open.session) return 'Rôle Trésorier verrouillé — déverrouillez-le puis réessayez.'

        // Le condensat d'abord : c'est la moitié réversible. Si la mise à jour
        // du mot de passe Auth échoue ensuite, on le remet en place, plutôt que
        // de laisser l'application reconnaître hors ligne un mot de passe que
        // le serveur, lui, ne reconnaît plus.
        const hashed = await hashPassword(next)
        const { error: secretError } = await supabaseTresorier
          .from('treasurer_secrets')
          .update({ secret: hashed })
          .eq('association_id', target.id)
        if (secretError) return authMessage(secretError)

        const { error } = await supabaseTresorier.auth.updateUser({ password: next })
        if (error) {
          await supabaseTresorier
            .from('treasurer_secrets')
            .update({ secret: target.secretTresorier })
            .eq('association_id', target.id)
          return authMessage(error)
        }

        cacheAccount({ ...target, secretTresorier: hashed })
        return null
      },

      changeAccountPassword: async (current, next) => {
        const target = accountRef.current
        if (!target) return 'Aucune association connectée.'
        if (!navigator.onLine) {
          return 'Changement de mot de passe impossible hors ligne.'
        }

        // Le mot de passe actuel est vérifié par le serveur, pas ici : une
        // reconnexion est la seule preuve qui vaille.
        const { error: check } = await supabase.auth.signInWithPassword({
          email: target.email,
          password: current,
        })
        if (check) return 'Mot de passe du compte actuel incorrect.'

        const { error } = await supabase.auth.updateUser({ password: next })
        if (error) return authMessage(error)
        return null
      },

      /* --------------------------------------------------------- console */

      adminLogin: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) return authMessage(error)

        const { data } = await supabase.from('platform_admins').select('user_id').maybeSingle()
        if (!data) {
          await supabase.auth.signOut()
          return "Ce compte n'a pas accès à la console plateforme."
        }
        setIsAdmin(true)
        return null
      },

      adminLogout: async () => {
        await supabase.auth.signOut()
        setIsAdmin(false)
        setComptes([])
      },

      changeAdminPassword: async (current, next) => {
        // Le mot de passe actuel est désormais exigé : sans lui, une console
        // laissée ouverte sur un poste partagé suffisait à prendre la main sur
        // toute la plateforme. Le chemin équivalent côté association le
        // demandait déjà.
        const { data: auth } = await supabase.auth.getUser()
        const email = auth.user?.email
        if (!email) return 'Session administrateur introuvable. Reconnectez-vous.'

        const { error: check } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        })
        if (check) return 'Mot de passe administrateur actuel incorrect.'

        const { error } = await supabase.auth.updateUser({ password: next })
        return error ? authMessage(error) : null
      },

      refreshComptes,
      updateAccount,
      deleteAccount,
      updateContact,
    }
  }, [
    account,
    session,
    contact,
    comptes,
    isAdmin,
    ready,
    applyAccountRow,
    armTresorier,
    cacheAccount,
    persistSession,
    fetchOwnAccount,
    refreshComptes,
    updateAccount,
    deleteAccount,
    updateContact,
  ])

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform(): PlatformValue {
  const ctx = useContext(PlatformContext)
  if (!ctx) throw new Error('usePlatform doit être utilisé dans un <PlatformProvider>')
  return ctx
}
