export type Role = 'treasurer' | 'viewer'

export type PaymentMethod =
  | 'especes'
  | 'orange_money'
  | 'wave'
  | 'moov_money'
  | 'mtn_momo'
  | 'virement'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'especes', label: 'Espèces' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'wave', label: 'Wave' },
  { value: 'moov_money', label: 'Moov Money' },
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'virement', label: 'Virement bancaire' },
]

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
