import type { Category, DB } from './types'
import { currentPeriod, uid } from './format'

/**
 * Categories offertes a une nouvelle association. Les montants sont un point de
 * depart — le tresorier les ajuste dans Membres → Categories.
 *
 * Les identifiants sont tires a la creation et non ecrits en dur : partages,
 * ils entreraient en collision des la premiere table `categories` commune a
 * toutes les associations.
 */
const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Standard', monthlyAmount: 5000, color: 'brand' },
  { name: 'Cadre / Soutien', monthlyAmount: 10000, color: 'navy' },
  { name: 'Étudiant', monthlyAmount: 2000, color: 'amber' },
  { name: "Membre d'Honneur", monthlyAmount: 0, color: 'violet' },
]

export function defaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c, id: uid('cat') }))
}

/** Une association neuve : categories par defaut, aucun enregistrement. */
export function buildEmpty(
  name: string,
  acronym: string,
  city = '',
  country = 'Burkina Faso',
  logo?: string,
): DB {
  return { ...buildBlank(), ...withIdentity(name, acronym, city, country, logo), categories: defaultCategories() }
}

/**
 * Grand livre strictement vide — la base sur laquelle le premier pull depose ce
 * que le serveur contient. Surtout pas `buildEmpty` : ses quatre categories par
 * defaut deviendraient des fantomes locaux que le serveur ne connait pas.
 */
export function buildBlank(): DB {
  const now = currentPeriod()
  return {
    version: 1,
    association: {
      name: '',
      acronym: '',
      city: '',
      country: 'Burkina Faso',
      treasurerName: '',
      presidentName: '',
      currency: 'F CFA',
      fiscalStart: `${now.slice(0, 4)}-01`,
    },
    categories: [],
    members: [],
    duePayments: [],
    campaigns: [],
    contributions: [],
    expenses: [],
  }
}

function withIdentity(
  name: string,
  acronym: string,
  city: string,
  country: string,
  logo?: string,
): Pick<DB, 'association'> {
  const blank = buildBlank()
  return { association: { ...blank.association, name, acronym, city, country, logo } }
}
