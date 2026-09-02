import type { Secret } from './auth'

export type Role = 'treasurer' | 'viewer'

export type PaymentMethod =
  | 'especes'
  | 'orange_money'
  | 'moov_money'
  | 'wave'
  | 'telecel_money'
  | 'sank_money'
  /** Retired options: no longer offered, but kept so old records keep a label. */
  | 'mtn_momo'
  | 'virement'

/** The methods a treasurer can pick today. */
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'especes', label: 'Espèces' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'moov_money', label: 'Moov Money' },
  { value: 'wave', label: 'Wave' },
  { value: 'telecel_money', label: 'Télécel Money' },
  { value: 'sank_money', label: 'Sank Money' },
]

/**
 * Methods withdrawn from the picker. Payments recorded before the change must
 * still display their real name rather than a blank cell in the statement, the
 * AG report and the Excel backup.
 */
const RETIRED_METHODS: Record<string, string> = {
  mtn_momo: 'MTN MoMo',
  virement: 'Virement bancaire',
}

export function paymentMethodLabel(value: PaymentMethod | string): string {
  return (
    PAYMENT_METHODS.find((m) => m.value === value)?.label ?? RETIRED_METHODS[value] ?? String(value)
  )
}

/** Reverse lookup for the Excel restore: accepts current and retired labels. */
export function paymentMethodFromLabel(label: string): PaymentMethod | null {
  const text = label.trim().toLowerCase()
  const current = PAYMENT_METHODS.find(
    (m) => m.label.toLowerCase() === text || m.value === text,
  )
  if (current) return current.value
  const retired = Object.entries(RETIRED_METHODS).find(
    ([value, name]) => name.toLowerCase() === text || value === text,
  )
  return retired ? (retired[0] as PaymentMethod) : null
}

export type ExpenseCategory =
  | 'logistique'
  | 'restauration'
  | 'solidarite'
  | 'fournitures'
  | 'transport'
  | 'honoraires'
  | 'autre'

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'logistique', label: 'Logistique' },
  { value: 'restauration', label: 'Restauration' },
  { value: 'solidarite', label: 'Solidarité / Aide' },
  { value: 'fournitures', label: 'Fournitures de bureau' },
  { value: 'transport', label: 'Transport' },
  { value: 'honoraires', label: 'Honoraires' },
  { value: 'autre', label: 'Autre' },
]

export interface Association {
  name: string
  acronym: string
  city: string
  country: string
  treasurerName: string
  presidentName: string
  currency: string
  /** Month (YYYY-MM) from which dues start being counted association-wide. */
  fiscalStart: string
  /** Optional logo as a compressed data URL — shown in the header and AG report. */
  logo?: string
}

export interface Category {
  id: string
  name: string
  monthlyAmount: number
  color: string
}

export interface Member {
  id: string
  fullName: string
  dialCode: string
  phone: string
  categoryId: string
  joinDate: string // YYYY-MM-DD
  active: boolean
  note?: string
}

/** One dues payment for one member for one month. */
export interface DuePayment {
  id: string
  memberId: string
  period: string // YYYY-MM
  amount: number
  date: string // YYYY-MM-DD
  method: PaymentMethod
  note?: string
}

export interface Campaign {
  id: string
  title: string
  description: string
  targetAmount: number
  deadline: string // YYYY-MM-DD
  status: 'open' | 'closed'
}

export interface Contribution {
  id: string
  campaignId: string
  /** null => external donor */
  memberId: string | null
  donorName?: string
  amount: number
  date: string
  method: PaymentMethod
  note?: string
}

export interface Expense {
  id: string
  label: string
  beneficiary: string
  amount: number
  category: ExpenseCategory
  date: string
  /** Key into the IndexedDB receipt store. */
  receiptKey?: string
  note?: string
}

export interface DB {
  version: number
  association: Association
  categories: Category[]
  members: Member[]
  duePayments: DuePayment[]
  campaigns: Campaign[]
  contributions: Contribution[]
  expenses: Expense[]
}

/* ------------------------------------------------------ Plateforme (SaaS) */

/**
 * Subscription state, managed only by the Platform Admin. `essai` behaves like
 * `actif` — it exists so the console can tell a trial apart from a paying
 * association at a glance.
 */
export type SubscriptionStatus = 'actif' | 'essai' | 'suspendu' | 'expire'

export const SUBSCRIPTION_STATUSES: {
  value: SubscriptionStatus
  label: string
  /** Whether the association may reach the app at all, date permitting. */
  grantsAccess: boolean
}[] = [
  { value: 'actif', label: 'Actif', grantsAccess: true },
  { value: 'essai', label: 'Essai', grantsAccess: true },
  { value: 'suspendu', label: 'Suspendu', grantsAccess: false },
  { value: 'expire', label: 'Expiré', grantsAccess: false },
]

/**
 * The tenant record the Platform Admin owns. Ledger data never lives here — it
 * sits in a separate per-tenant store keyed by `id`, so one association can
 * never read another's members or accounts.
 */
export interface AssociationAccount {
  id: string
  nom: string
  sigle: string
  ville: string
  pays: string
  /** Person to call at the association — the treasurer, usually. */
  responsable: string
  dialCode: string
  telephone: string
  email: string
  statut_abonnement: SubscriptionStatus
  /** YYYY-MM-DD — access is cut off at the end of this day. */
  date_expiration_acces: string
  date_creation: string
  /**
   * Secret Trésorier (PBKDF2), lu dans `treasurer_secrets` et mis en cache.
   *
   * Ce n'est plus ce qui *autorise* l'écriture — c'est l'identité Supabase Auth
   * du Trésorier qui la porte, et la RLS qui la vérifie. Il ne sert plus qu'à
   * une chose : reconnaître le mot de passe saisi quand il n'y a pas de réseau,
   * pour qu'un trésorier puisse déverrouiller son rôle en pleine Assemblée
   * Générale. Il vit dans sa propre table, hors de portée de l'Admin
   * Plateforme, qui lisait auparavant le condensat de chaque association.
   */
  secretTresorier: Secret
  /**
   * Compte Supabase Auth du Trésorier, ou null tant qu'il n'a pas été créé
   * (association antérieure à la migration 0002). Écrit uniquement par la
   * fonction `set_treasurer_identity`, jamais par un UPDATE direct.
   */
  treasurerUserId: string | null
  /**
   * Mémo libre de l'Admin Plateforme (référence de paiement, historique).
   *
   * Porté par la table `association_notes`, et non par la ligne `associations` :
   * là, il était lisible par l'association elle-même, alors que la console
   * l'annonce « visible ici seulement ». Vide partout ailleurs que dans la
   * console — le locataire n'a aucune ligne visible dans cette table.
   */
  notes: string
}

/** Who the association should contact when access is cut off. */
export interface PlatformContact {
  nom: string
  dialCode: string
  telephone: string
  email: string
}

/**
 * The signed-in association, plus the role currently unlocked for it.
 *
 * `role` est délibérément absent de ce qui est *persisté* (voir
 * `writeJSON(SESSION_KEY, …)` dans platform.tsx) : il ne vit qu'en mémoire.
 * Tant qu'il était écrit dans localStorage, le passer à `treasurer` à la main
 * suffisait à ouvrir l'écriture. Chaque ouverture de l'application repart donc
 * en lecture seule, et le rôle Trésorier se redemande.
 */
export interface Session {
  associationId: string
  role: Role
}

/** Ce que la session dépose réellement dans localStorage. */
export interface StoredSession {
  associationId: string
}
