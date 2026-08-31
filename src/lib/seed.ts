import type { DB, Member, DuePayment, Contribution, Expense } from './types'
import { currentPeriod, periodRange } from './format'

/** Deterministic PRNG so the demo looks identical on every device and reload. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function shiftPeriod(period: string, months: number): string {
  let [y, m] = period.split('-').map(Number)
  m += months
  while (m > 12) {
    m -= 12
    y += 1
  }
  while (m < 1) {
    m += 12
    y -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

function dayIn(period: string, day: number): string {
  return `${period}-${String(day).padStart(2, '0')}`
}

const CATEGORIES = [
  { id: 'cat_std', name: 'Standard', monthlyAmount: 5000, color: 'brand' },
  { id: 'cat_cadre', name: 'Cadre / Soutien', monthlyAmount: 10000, color: 'navy' },
  { id: 'cat_etu', name: 'Étudiant', monthlyAmount: 2000, color: 'amber' },
  { id: 'cat_hon', name: "Membre d'Honneur", monthlyAmount: 0, color: 'violet' },
]

/** name, dial code, local number, category */
const PEOPLE: Array<[string, string, string, string]> = [
  ['Amadou Diallo', '226', '70 12 45 89', 'cat_cadre'],
  ['Fatoumata Traoré', '226', '76 33 21 07', 'cat_std'],
  ['Koffi Mensah', '225', '07 58 90 12', 'cat_cadre'],
  ['Aminata Ouédraogo', '226', '78 44 60 31', 'cat_std'],
  ['Cheikh Ndiaye', '221', '77 902 14 66', 'cat_std'],
  ['Awa Ba', '221', '78 315 40 92', 'cat_etu'],
  ['Issa Sawadogo', '226', '71 05 88 24', 'cat_std'],
  ['Mariam Kaboré', '226', '65 27 19 40', 'cat_etu'],
  ['Boubacar Sangaré', '223', '76 18 52 03', 'cat_std'],
  ['Salif Compaoré', '226', '70 61 39 75', 'cat_cadre'],
  ['Rokia Zongo', '226', '74 90 12 58', 'cat_std'],
  ['Ibrahim Nikiéma', '226', '72 36 74 11', 'cat_etu'],
  ['Djénéba Coulibaly', '223', '66 41 03 27', 'cat_std'],
  ['Moussa Bationo', '226', '75 82 46 90', 'cat_hon'],
]

const INACTIVE = new Set(['mbr_11', 'mbr_12'])

const METHODS = ['orange_money', 'wave', 'especes', 'moov_money', 'virement'] as const

/** Split a total across N contributors in tidy 500 FCFA steps. */
function splitTotal(total: number, parts: number, r: () => number): number[] {
  const weights = Array.from({ length: parts }, () => 0.5 + r())
  const sum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((w) => Math.round((total * w) / sum / 500) * 500)
  raw[0] += total - raw.reduce((a, b) => a + b, 0)
  return raw
}

export function buildSeed(): DB {
  const now = currentPeriod()
  const start = shiftPeriod(now, -5) // rolling 6-month window ending this month
  const periods = periodRange(start, now)
  const rand = rng(20260830)

  const members: Member[] = PEOPLE.map(([fullName, dialCode, phone, categoryId], i) => ({
    id: `mbr_${i}`,
    fullName,
    dialCode,
    phone,
    categoryId,
    joinDate: `${2021 + (i % 4)}-${String(((i * 3) % 12) + 1).padStart(2, '0')}-${String(
      ((i * 7) % 27) + 1,
    ).padStart(2, '0')}`,
    active: !INACTIVE.has(`mbr_${i}`),
    note: '',
  }))

  const catAmount = new Map(CATEGORIES.map((c) => [c.id, c.monthlyAmount]))

  const duePayments: DuePayment[] = []
  members.forEach((m, mi) => {
    const due = catAmount.get(m.categoryId) ?? 0
    if (due === 0) return // Membres d'Honneur are exempt from monthly dues
    periods.forEach((period, pi) => {
      // Recent months are less settled than older ones, as in a real treasury.
      const recency = pi >= periods.length - 2 ? 0.35 : 0.08
      const diligence = mi % 5 === 0 ? -0.12 : mi % 7 === 3 ? 0.2 : 0
      if (rand() < recency + diligence) return // left unpaid
      const partial = rand() < 0.1
      duePayments.push({
        id: `due_${m.id}_${period}`,
        memberId: m.id,
        period,
        amount: partial ? Math.round(due / 2 / 500) * 500 : due,
        date: dayIn(period, 3 + Math.floor(rand() * 22)),
        method: METHODS[Math.floor(rand() * METHODS.length)],
        note: partial ? 'Versement partiel' : '',
      })
    })
  })

  const campaigns: DB['campaigns'] = [
    {
      id: 'cmp_urgence',
      title: "Fonds d'Urgence Solidarité",
      description:
        "Soutien aux familles de membres touchées par un sinistre ou un deuil, voté en AG extraordinaire.",
      targetAmount: 500000,
      deadline: `${shiftPeriod(now, 2)}-28`,
      status: 'open',
    },
    {
      id: 'cmp_biblio',
      title: 'Rénovation Bibliothèque Communautaire',
      description:
        'Réfection de la toiture, peinture des salles et acquisition de 200 ouvrages pour la bibliothèque du quartier.',
      targetAmount: 1200000,
      deadline: `${shiftPeriod(now, 5)}-30`,
      status: 'open',
    },
  ]

  const donors = ['Fondation Sahel Avenir', 'M. Ousmane Barry (sympathisant)', 'Entreprise SOTRACOM']
  const contributions: Contribution[] = []

  const plans = [
    { campaignId: 'cmp_urgence', total: 350000, count: 9 },
    { campaignId: 'cmp_biblio', total: 800000, count: 11 },
  ]

  for (const plan of plans) {
    const amounts = splitTotal(plan.total, plan.count, rand)
    amounts.forEach((amount, i) => {
      const external = i >= plan.count - 1
      const member = members[(i * 3 + 1) % members.length]
      const period = periods[1 + Math.floor(rand() * (periods.length - 1))]
      contributions.push({
        id: `ctr_${plan.campaignId}_${i}`,
        campaignId: plan.campaignId,
        memberId: external ? null : member.id,
        donorName: external ? donors[i % donors.length] : undefined,
        amount,
        date: dayIn(period, 2 + Math.floor(rand() * 25)),
        method: METHODS[Math.floor(rand() * METHODS.length)],
        note: '',
      })
    })
  }

  const rawExpenses: Array<[string, string, number, Expense['category'], number, number]> = [
    ['Location bâches et chaises — AG ordinaire', 'Établissement Wend-Kuuni', 75000, 'logistique', 5, 12],
    ['Restauration réunion trimestrielle', 'Restaurant Le Baobab', 48000, 'restauration', 4, 18],
    ['Aide funéraire famille Sangaré', 'Famille Sangaré', 100000, 'solidarite', 4, 3],
    ['Ramettes de papier et registres', 'Librairie Diaspora', 12500, 'fournitures', 3, 22],
    ['Carburant déplacement Bobo-Dioulasso', 'Trésorier (remboursement)', 25000, 'transport', 2, 9],
    ['Honoraires commissaire aux comptes', 'Cabinet ACG Audit', 60000, 'honoraires', 2, 27],
    ['Impression des cartes de membre', 'Imprimerie Sahel Print', 35000, 'fournitures', 1, 14],
    ['Sonorisation journée culturelle', 'Sono Wend-Panga', 55000, 'logistique', 0, 6],
  ]

  const expenses: Expense[] = rawExpenses.map(
    ([label, beneficiary, amount, category, monthsBack, day], i) => ({
      id: `exp_${i}`,
      label,
      beneficiary,
      amount,
      category,
      date: dayIn(shiftPeriod(now, -monthsBack), day),
      note: '',
    }),
  )

  return {
    version: 1,
    association: {
      name: 'Amicale des Anciens & Amis du Sahel',
      acronym: 'AAAS',
      city: 'Ouagadougou',
      country: 'Burkina Faso',
      treasurerName: 'Salif Compaoré',
      presidentName: 'Amadou Diallo',
      currency: 'FCFA',
      fiscalStart: start,
    },
    categories: CATEGORIES,
    members,
    duePayments,
    campaigns,
    contributions,
    expenses,
  }
}

/** A brand-new association: same shape, default categories, no records. */
export function buildEmpty(name: string, acronym: string): DB {
  const now = currentPeriod()
  return {
    version: 1,
    association: {
      name,
      acronym,
      city: '',
      country: 'Burkina Faso',
      treasurerName: '',
      presidentName: '',
      currency: 'FCFA',
      fiscalStart: `${now.slice(0, 4)}-01`,
    },
    categories: CATEGORIES.map((c) => ({ ...c })),
    members: [],
    duePayments: [],
    campaigns: [],
    contributions: [],
    expenses: [],
  }
}
