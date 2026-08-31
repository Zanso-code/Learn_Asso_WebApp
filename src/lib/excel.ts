/**
 * Excel backup / restore for one association.
 *
 * The workbook is meant to be *readable* by a treasurer, not just a machine
 * dump: labels and dates are French, amounts are plain numbers. Every sheet
 * still carries the technical `ID` columns, because those are what let a
 * restore rebuild the links between members, payments and campaigns.
 *
 * Receipt photos live in IndexedDB and cannot travel in a spreadsheet — the
 * key column is exported so a restore on the *same* device relinks them, and
 * the UI warns that a restore elsewhere comes back without the images.
 */

import type { DB, DuePayment, Expense, Member } from './types'
import { EXPENSE_CATEGORIES, paymentMethodFromLabel, paymentMethodLabel } from './types'
import type { ExpenseCategory, PaymentMethod } from './types'
import { formatDate, todayISO } from './format'

type Cell = string | number | Date | null
type Row = Cell[]

const SHEETS = {
  association: 'Association',
  categories: 'Catégories',
  members: 'Membres',
  dues: 'Cotisations',
  campaigns: 'Campagnes',
  contributions: 'Contributions',
  expenses: 'Dépenses',
} as const

/* ------------------------------------------------------------------ helpers */

function methodLabel(value: PaymentMethod): string {
  return paymentMethodLabel(value)
}

function methodValue(label: unknown): PaymentMethod {
  return paymentMethodFromLabel(String(label ?? '')) ?? 'especes'
}

function categoryLabel(value: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

function categoryValue(label: unknown): ExpenseCategory {
  const text = String(label ?? '').trim().toLowerCase()
  return (
    EXPENSE_CATEGORIES.find((c) => c.label.toLowerCase() === text || c.value === text)?.value ??
    'autre'
  )
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Accepts a real Excel date, "DD/MM/YYYY" or an ISO string. */
function parseDate(cell: unknown): string {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return isoFromDate(cell)
  const text = String(cell ?? '').trim()
  if (!text) return ''
  const fr = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (fr) return `${fr[3]}-${pad(Number(fr[2]))}-${pad(Number(fr[1]))}`
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`
  return ''
}

/** A dues period: "MM/YYYY" as written, but ISO and full dates are tolerated. */
function parsePeriod(cell: unknown): string {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}`
  }
  const text = String(cell ?? '').trim()
  const mmYYYY = text.match(/^(\d{1,2})\/(\d{4})$/)
  if (mmYYYY) return `${mmYYYY[2]}-${pad(Number(mmYYYY[1]))}`
  const isoMonth = text.match(/^(\d{4})-(\d{1,2})$/)
  if (isoMonth) return `${isoMonth[1]}-${pad(Number(isoMonth[2]))}`
  const full = parseDate(cell)
  return full ? full.slice(0, 7) : ''
}

function periodCell(period: string): string {
  const [y, m] = period.split('-')
  return y && m ? `${m}/${y}` : period
}

function num(cell: unknown): number {
  if (typeof cell === 'number') return Math.round(cell)
  const cleaned = String(cell ?? '').replace(/[^\d-]/g, '')
  const parsed = parseInt(cleaned, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(cell: unknown): string {
  return cell == null ? '' : String(cell).trim()
}

/* ------------------------------------------------------------------ export */

export async function exportWorkbook(db: DB): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  const a = db.association
  const memberName = new Map(db.members.map((m) => [m.id, m.fullName]))
  const categoryName = new Map(db.categories.map((c) => [c.id, c.name]))
  const campaignName = new Map(db.campaigns.map((c) => [c.id, c.title]))

  const association: Row[] = [
    ['Champ', 'Valeur'],
    ['Nom', a.name],
    ['Sigle', a.acronym],
    ['Ville', a.city],
    ['Pays', a.country],
    ['Trésorier Général', a.treasurerName],
    ['Président', a.presidentName],
    ['Début du suivi (AAAA-MM)', a.fiscalStart],
    ['Date de la sauvegarde', formatDate(todayISO())],
  ]

  const categories: Row[] = [
    ['ID', 'Nom', 'Cotisation mensuelle', 'Couleur'],
    ...db.categories.map((c): Row => [c.id, c.name, c.monthlyAmount, c.color]),
  ]

  const members: Row[] = [
    ['ID', 'Nom complet', 'Indicatif', 'Téléphone', 'ID catégorie', 'Catégorie', 'Date adhésion', 'Statut', 'Note'],
    ...db.members.map((m): Row => [
      m.id,
      m.fullName,
      m.dialCode,
      m.phone,
      m.categoryId,
      categoryName.get(m.categoryId) ?? '',
      formatDate(m.joinDate),
      m.active ? 'Actif' : 'Inactif',
      m.note ?? '',
    ]),
  ]

  const dues: Row[] = [
    ['ID', 'ID membre', 'Membre', 'Période', 'Montant', 'Date', 'Moyen de paiement', 'Note'],
    ...db.duePayments.map((p): Row => [
      p.id,
      p.memberId,
      memberName.get(p.memberId) ?? '',
      periodCell(p.period),
      p.amount,
      formatDate(p.date),
      methodLabel(p.method),
      p.note ?? '',
    ]),
  ]

  const campaigns: Row[] = [
    ['ID', 'Titre', 'Description', 'Objectif', 'Échéance', 'Statut'],
    ...db.campaigns.map((c): Row => [
      c.id,
      c.title,
      c.description,
      c.targetAmount,
      formatDate(c.deadline),
      c.status === 'open' ? 'Ouverte' : 'Clôturée',
    ]),
  ]

  const contributions: Row[] = [
    ['ID', 'ID campagne', 'Campagne', 'ID membre', 'Contributeur', 'Montant', 'Date', 'Moyen de paiement', 'Note'],
    ...db.contributions.map((c): Row => [
      c.id,
      c.campaignId,
      campaignName.get(c.campaignId) ?? '',
      c.memberId ?? '',
      c.memberId ? (memberName.get(c.memberId) ?? '') : (c.donorName ?? 'Donateur externe'),
      c.amount,
      formatDate(c.date),
      methodLabel(c.method),
      c.note ?? '',
    ]),
  ]

  const expenses: Row[] = [
    ['ID', 'Libellé', 'Bénéficiaire', 'Montant', 'Catégorie', 'Date', 'Clé justificatif', 'Note'],
    ...db.expenses.map((e): Row => [
      e.id,
      e.label,
      e.beneficiary,
      e.amount,
      categoryLabel(e.category),
      formatDate(e.date),
      e.receiptKey ?? '',
      e.note ?? '',
    ]),
  ]

  // v4 takes one { sheet, data } object per tab and returns a writer, not a
  // promise — the download happens in `toFile`.
  const sheets = [
    { sheet: SHEETS.association, data: association, columns: [{ width: 26 }, { width: 40 }] },
    { sheet: SHEETS.categories, data: categories, columns: [{ width: 16 }, { width: 24 }] },
    { sheet: SHEETS.members, data: members, columns: [{ width: 16 }, { width: 26 }] },
    { sheet: SHEETS.dues, data: dues, columns: [{ width: 20 }, { width: 16 }, { width: 26 }] },
    { sheet: SHEETS.campaigns, data: campaigns, columns: [{ width: 18 }, { width: 34 }] },
    { sheet: SHEETS.contributions, data: contributions, columns: [{ width: 20 }, { width: 18 }] },
    { sheet: SHEETS.expenses, data: expenses, columns: [{ width: 16 }, { width: 34 }] },
  ]

  await writeXlsxFile(sheets as never).toFile(
    `${a.acronym || 'association'}-sauvegarde-${todayISO()}.xlsx`,
  )
}

/* ------------------------------------------------------------------ import */

export class ExcelImportError extends Error {}

type SheetRows = unknown[][]

function requireSheet(map: Map<string, SheetRows>, name: string): SheetRows {
  const rows = map.get(name)
  if (!rows) {
    throw new ExcelImportError(
      `Feuille « ${name} » introuvable dans le fichier. Utilisez un fichier produit par l'export Excel de l'application.`,
    )
  }
  return rows.slice(1) // drop the header row
}

/**
 * Rebuild a full ledger from a workbook. Returns the DB rather than writing it,
 * so the caller can confirm with the user before overwriting anything.
 */
export async function importWorkbook(file: File, fallback: DB): Promise<DB> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')

  // v9's default export reads every tab in one pass: [{ sheet, data }, …].
  let map: Map<string, SheetRows>
  try {
    const sheets = await readXlsxFile(file)
    map = new Map(sheets.map((s) => [s.sheet, s.data as SheetRows]))
  } catch {
    throw new ExcelImportError('Fichier illisible. Attendu : un classeur Excel (.xlsx).')
  }

  // Association: a two-column "Champ / Valeur" sheet.
  const infoRows = requireSheet(map, SHEETS.association)
  const info = new Map(infoRows.map((r) => [text(r[0]), text(r[1])]))
  const association: DB['association'] = {
    ...fallback.association,
    name: info.get('Nom') || fallback.association.name,
    acronym: info.get('Sigle') || fallback.association.acronym,
    city: info.get('Ville') ?? fallback.association.city,
    country: info.get('Pays') || fallback.association.country,
    treasurerName: info.get('Trésorier Général') ?? '',
    presidentName: info.get('Président') ?? '',
    fiscalStart: info.get('Début du suivi (AAAA-MM)') || fallback.association.fiscalStart,
  }

  const categories: DB['categories'] = requireSheet(map, SHEETS.categories)
    .filter((r) => text(r[0]) || text(r[1]))
    .map((r) => ({
      id: text(r[0]) || `cat_${Math.random().toString(36).slice(2, 8)}`,
      name: text(r[1]),
      monthlyAmount: num(r[2]),
      color: text(r[3]) || 'navy',
    }))

  if (!categories.length) {
    throw new ExcelImportError(
      "La feuille « Catégories » est vide : une association doit garder au moins une catégorie de cotisation.",
    )
  }

  const validCategory = new Set(categories.map((c) => c.id))
  const defaultCategory = categories[0].id

  const members: Member[] = requireSheet(map, SHEETS.members)
    .filter((r) => text(r[1]))
    .map((r) => {
      const categoryId = text(r[4])
      return {
        id: text(r[0]) || `mbr_${Math.random().toString(36).slice(2, 8)}`,
        fullName: text(r[1]),
        dialCode: text(r[2]) || '226',
        phone: text(r[3]),
        categoryId: validCategory.has(categoryId) ? categoryId : defaultCategory,
        joinDate: parseDate(r[6]) || todayISO(),
        active: text(r[7]).toLowerCase() !== 'inactif',
        note: text(r[8]),
      }
    })

  const validMember = new Set(members.map((m) => m.id))

  // Payments whose member no longer exists are dropped: keeping them would
  // inflate the recorded income against a member the app cannot show.
  const duePayments: DuePayment[] = requireSheet(map, SHEETS.dues)
    .filter((r) => validMember.has(text(r[1])) && parsePeriod(r[3]))
    .map((r) => ({
      id: text(r[0]) || `due_${Math.random().toString(36).slice(2, 8)}`,
      memberId: text(r[1]),
      period: parsePeriod(r[3]),
      amount: num(r[4]),
      date: parseDate(r[5]) || todayISO(),
      method: methodValue(r[6]),
      note: text(r[7]),
    }))

  const campaigns: DB['campaigns'] = requireSheet(map, SHEETS.campaigns)
    .filter((r) => text(r[1]))
    .map((r) => ({
      id: text(r[0]) || `cmp_${Math.random().toString(36).slice(2, 8)}`,
      title: text(r[1]),
      description: text(r[2]),
      targetAmount: num(r[3]),
      deadline: parseDate(r[4]) || todayISO(),
      status: text(r[5]).toLowerCase().startsWith('cl') ? 'closed' : 'open',
    }))

  const validCampaign = new Set(campaigns.map((c) => c.id))

  const contributions: DB['contributions'] = requireSheet(map, SHEETS.contributions)
    .filter((r) => validCampaign.has(text(r[1])))
    .map((r) => {
      const memberId = text(r[3])
      const linked = validMember.has(memberId)
      return {
        id: text(r[0]) || `ctr_${Math.random().toString(36).slice(2, 8)}`,
        campaignId: text(r[1]),
        memberId: linked ? memberId : null,
        // An unlinked row keeps its name so the money stays attributable.
        donorName: linked ? undefined : text(r[4]) || 'Donateur externe',
        amount: num(r[5]),
        date: parseDate(r[6]) || todayISO(),
        method: methodValue(r[7]),
        note: text(r[8]),
      }
    })

  const expenses: Expense[] = requireSheet(map, SHEETS.expenses)
    .filter((r) => text(r[1]))
    .map((r) => ({
      id: text(r[0]) || `exp_${Math.random().toString(36).slice(2, 8)}`,
      label: text(r[1]),
      beneficiary: text(r[2]),
      amount: num(r[3]),
      category: categoryValue(r[4]),
      date: parseDate(r[5]) || todayISO(),
      receiptKey: text(r[6]) || undefined,
      note: text(r[7]),
    }))

  return {
    version: fallback.version,
    association,
    categories,
    members,
    duePayments,
    campaigns,
    contributions,
    expenses,
  }
}

/** Short French summary of what a restore will bring in, for the confirm step. */
export function describeImport(db: DB): string {
  return [
    `${db.members.length} membre(s)`,
    `${db.duePayments.length} versement(s)`,
    `${db.campaigns.length} campagne(s)`,
    `${db.contributions.length} contribution(s)`,
    `${db.expenses.length} dépense(s)`,
  ].join(' · ')
}
