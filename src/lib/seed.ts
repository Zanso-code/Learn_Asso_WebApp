import type { DB } from './types'
import { currentPeriod } from './format'

/**
 * Categories every new association starts with. Amounts are a starting point —
 * the treasurer edits them in Membres → Catégories.
 */
const DEFAULT_CATEGORIES = [
  { id: 'cat_std', name: 'Standard', monthlyAmount: 5000, color: 'brand' },
  { id: 'cat_cadre', name: 'Cadre / Soutien', monthlyAmount: 10000, color: 'navy' },
  { id: 'cat_etu', name: 'Étudiant', monthlyAmount: 2000, color: 'amber' },
  { id: 'cat_hon', name: "Membre d'Honneur", monthlyAmount: 0, color: 'violet' },
]

/** A brand-new association: default categories, no members or records. */
export function buildEmpty(
  name: string,
  acronym: string,
  city = '',
  country = 'Burkina Faso',
  logo?: string,
): DB {
  const now = currentPeriod()
  return {
    version: 1,
    association: {
      name,
      acronym,
      city,
      country,
      treasurerName: '',
      presidentName: '',
      currency: 'F CFA',
      logo,
      fiscalStart: `${now.slice(0, 4)}-01`,
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    members: [],
    duePayments: [],
    campaigns: [],
    contributions: [],
    expenses: [],
  }
}
