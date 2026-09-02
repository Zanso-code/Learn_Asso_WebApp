/**
 * Traduction entre le modele du domaine (camelCase, src/lib/types.ts) et les
 * lignes Postgres (snake_case).
 *
 * C'est le SEUL fichier qui connait les colonnes de synchronisation
 * (`association_id`, `updated_at`, `deleted_at`). Les interfaces du domaine
 * restent propres : aucune page, aucun selecteur n'a a savoir que la donnee
 * transite par un serveur.
 */

import type {
  Association,
  Campaign,
  Category,
  Contribution,
  DB,
  DuePayment,
  Expense,
  ExpenseCategory,
  Member,
  PaymentMethod,
} from '../types'

/** Les six collections synchronisees — les cles tableau de `DB`. */
export type EntityName =
  | 'categories'
  | 'members'
  | 'duePayments'
  | 'campaigns'
  | 'contributions'
  | 'expenses'

/**
 * Ordre de dependance : une categorie avant les membres qui la citent, une
 * campagne avant ses contributions. L'outbox preserve deja l'ordre causal sur
 * un appareil donne ; cet ordre-la sert a l'hydratation initiale et au
 * re-televersement complet (restauration Excel).
 */
export const ENTITIES: EntityName[] = [
  'categories',
  'members',
  'duePayments',
  'campaigns',
  'contributions',
  'expenses',
]

export const TABLES: Record<EntityName, string> = {
  categories: 'categories',
  members: 'members',
  duePayments: 'due_payments',
  campaigns: 'campaigns',
  contributions: 'contributions',
  expenses: 'expenses',
}

/** Une ligne telle que PostgREST la renvoie. */
export interface SyncRow {
  id: string
  association_id: string
  updated_at: string
  deleted_at: string | null
  [column: string]: unknown
}

/* ------------------------------------------------------- domaine -> colonne */

const COLUMNS: Record<EntityName, Record<string, string>> = {
  categories: {
    id: 'id',
    name: 'name',
    monthlyAmount: 'monthly_amount',
    color: 'color',
  },
  members: {
    id: 'id',
    fullName: 'full_name',
    dialCode: 'dial_code',
    phone: 'phone',
    categoryId: 'category_id',
    joinDate: 'join_date',
    active: 'active',
    note: 'note',
  },
  duePayments: {
    id: 'id',
    memberId: 'member_id',
    period: 'period',
    amount: 'amount',
    date: 'date',
    method: 'method',
    note: 'note',
  },
  campaigns: {
    id: 'id',
    title: 'title',
    description: 'description',
    targetAmount: 'target_amount',
    deadline: 'deadline',
    status: 'status',
  },
  contributions: {
    id: 'id',
    campaignId: 'campaign_id',
    memberId: 'member_id',
    donorName: 'donor_name',
    amount: 'amount',
    date: 'date',
    method: 'method',
    note: 'note',
  },
  expenses: {
    id: 'id',
    label: 'label',
    beneficiary: 'beneficiary',
    amount: 'amount',
    category: 'category',
    date: 'date',
    receiptKey: 'receipt_key',
    note: 'note',
  },
}

/**
 * Champs adosses a une colonne `date` Postgres. Le domaine represente « pas de
 * date » par une chaine vide, que Postgres refuse — la conversion vers `null`
 * doit donc etre faite ici, une fois pour toutes.
 */
const DATE_FIELDS: Record<EntityName, string[]> = {
  categories: [],
  members: ['joinDate'],
  duePayments: ['date'],
  campaigns: ['deadline'],
  contributions: ['date'],
  expenses: ['date'],
}

function outValue(entity: EntityName, field: string, value: unknown): unknown {
  if (value === undefined) return null
  if (DATE_FIELDS[entity].includes(field) && value === '') return null
  return value
}

/** Objet du domaine complet -> ligne prete pour un `insert`/`upsert`. */
export function toRow(
  entity: EntityName,
  item: object,
  associationId: string,
): Record<string, unknown> {
  const map = COLUMNS[entity]
  const row: Record<string, unknown> = { association_id: associationId }
  for (const [field, column] of Object.entries(map)) {
    row[column] = outValue(entity, field, (item as Record<string, unknown>)[field])
  }
  return row
}

/**
 * `Partial<T>` -> colonnes modifiees uniquement.
 *
 * C'est ce qui donne la fusion champ par champ : deux appareils qui modifient
 * des champs differents du meme membre gardent chacun leur changement, la ou un
 * upsert de ligne complete aurait ecrase le champ de l'autre.
 */
export function toPatchRow(
  entity: EntityName,
  patch: object,
): Record<string, unknown> {
  const map = COLUMNS[entity]
  const row: Record<string, unknown> = {}
  for (const [field, column] of Object.entries(map)) {
    if (field === 'id') continue
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue
    row[column] = outValue(entity, field, (patch as Record<string, unknown>)[field])
  }
  return row
}

/* ------------------------------------------------------- colonne -> domaine */

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const opt = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

function rowToCategory(r: SyncRow): Category {
  return {
    id: str(r.id),
    name: str(r.name),
    monthlyAmount: num(r.monthly_amount),
    color: str(r.color) || 'brand',
  }
}

function rowToMember(r: SyncRow): Member {
  return {
    id: str(r.id),
    fullName: str(r.full_name),
    dialCode: str(r.dial_code) || '226',
    phone: str(r.phone),
    categoryId: str(r.category_id),
    joinDate: str(r.join_date),
    active: r.active !== false,
    note: opt(r.note),
  }
}

function rowToDuePayment(r: SyncRow): DuePayment {
  return {
    id: str(r.id),
    memberId: str(r.member_id),
    period: str(r.period),
    amount: num(r.amount),
    date: str(r.date),
    method: str(r.method) as PaymentMethod,
    note: opt(r.note),
  }
}

function rowToCampaign(r: SyncRow): Campaign {
  return {
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    targetAmount: num(r.target_amount),
    deadline: str(r.deadline),
    status: r.status === 'closed' ? 'closed' : 'open',
  }
}

function rowToContribution(r: SyncRow): Contribution {
  return {
    id: str(r.id),
    campaignId: str(r.campaign_id),
    // Seul champ ou `null` est une valeur metier et non une absence : il
    // signifie « donateur externe ».
    memberId: typeof r.member_id === 'string' && r.member_id !== '' ? r.member_id : null,
    donorName: opt(r.donor_name),
    amount: num(r.amount),
    date: str(r.date),
    method: str(r.method) as PaymentMethod,
    note: opt(r.note),
  }
}

function rowToExpense(r: SyncRow): Expense {
  return {
    id: str(r.id),
    label: str(r.label),
    beneficiary: str(r.beneficiary),
    amount: num(r.amount),
    category: str(r.category) as ExpenseCategory,
    date: str(r.date),
    receiptKey: opt(r.receipt_key),
    note: opt(r.note),
  }
}

type Decoder = (row: SyncRow) => DB[EntityName][number]

const DECODERS: Record<EntityName, Decoder> = {
  categories: rowToCategory as Decoder,
  members: rowToMember as Decoder,
  duePayments: rowToDuePayment as Decoder,
  campaigns: rowToCampaign as Decoder,
  contributions: rowToContribution as Decoder,
  expenses: rowToExpense as Decoder,
}

export function fromRow(entity: EntityName, row: SyncRow): DB[EntityName][number] {
  return DECODERS[entity](row)
}

/* --------------------------------------------------------- l'association */

/**
 * `Association` n'est pas une collection : c'est une poignee de champs portes
 * par la ligne `associations` elle-meme, aux cotes de l'identite du compte et
 * de l'abonnement. La fusion des deux tables supprime la duplication que
 * `syncAccountIdentity` passait son temps a rattraper cote client.
 */
const ASSOCIATION_COLUMNS: Record<string, string> = {
  name: 'nom',
  acronym: 'sigle',
  city: 'ville',
  country: 'pays',
  treasurerName: 'treasurer_name',
  presidentName: 'president_name',
  currency: 'currency',
  fiscalStart: 'fiscal_start',
  logo: 'logo',
}

export function toAssociationPatchRow(patch: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [field, column] of Object.entries(ASSOCIATION_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue
    row[column] = patch[field] === undefined ? null : patch[field]
  }
  return row
}

export function rowToAssociation(r: Record<string, unknown>): Association {
  return {
    name: str(r.nom),
    acronym: str(r.sigle),
    city: str(r.ville),
    country: str(r.pays),
    treasurerName: str(r.treasurer_name),
    presidentName: str(r.president_name),
    currency: str(r.currency) || 'F CFA',
    fiscalStart: str(r.fiscal_start),
    logo: opt(r.logo),
  }
}
