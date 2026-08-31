import type { DB, Member, Category, Expense } from './types'
import { currentPeriod, periodRange, periodOf } from './format'

export type CellStatus = 'paid' | 'partial' | 'unpaid' | 'exempt' | 'before-join' | 'future'

export interface MonthCell {
  period: string
  due: number
  paid: number
  status: CellStatus
}

export interface MemberBalance {
  member: Member
  category: Category | undefined
  monthly: number
  expected: number
  paid: number
  balance: number
  /** Periods with nothing or only part of the due paid. */
  unpaidPeriods: string[]
}

/** The first month a member owes dues: the later of their join date and the fiscal start. */
export function firstOwedPeriod(db: DB, member: Member): string {
  const join = member.joinDate.slice(0, 7)
  return join > db.association.fiscalStart ? join : db.association.fiscalStart
}

export function categoryOf(db: DB, member: Member): Category | undefined {
  return db.categories.find((c) => c.id === member.categoryId)
}

/** Total already paid by a member for one month. */
export function paidFor(db: DB, memberId: string, period: string): number {
  let sum = 0
  for (const p of db.duePayments) {
    if (p.memberId === memberId && p.period === period) sum += p.amount
  }
  return sum
}

/**
 * `owed` = the month is already due. `future` = it is after the current month
 * but still within the member's active period, so it may be paid in advance
 * without ever counting as arrears.
 */
export function cellStatus(
  due: number,
  paid: number,
  owed: boolean,
  future = false,
): CellStatus {
  if (!owed && !future) return 'before-join'
  if (due === 0) return 'exempt'
  if (paid <= 0) return future ? 'future' : 'unpaid'
  if (paid + 0.01 < due) return 'partial'
  return 'paid'
}

/** The 12 month cells of `year` for one member. */
export function memberYearRow(db: DB, member: Member, year: number): MonthCell[] {
  const monthly = categoryOf(db, member)?.monthlyAmount ?? 0
  const first = firstOwedPeriod(db, member)
  const now = currentPeriod()
  return Array.from({ length: 12 }, (_, i) => {
    const period = periodOf(year, i)
    const inScope = member.active && period >= first
    const owed = inScope && period <= now
    // Advance payments are allowed, so a later month stays clickable — but it
    // contributes 0 to `due`, or it would show up as arrears the member does
    // not actually owe yet.
    const future = inScope && period > now
    const paid = paidFor(db, member.id, period)
    return {
      period,
      due: owed ? monthly : 0,
      paid,
      status: cellStatus(monthly, paid, owed, future),
    }
  })
}

/** Expected vs paid for a member across the whole tracked history. */
export function memberBalance(db: DB, member: Member): MemberBalance {
  const category = categoryOf(db, member)
  const monthly = category?.monthlyAmount ?? 0
  const now = currentPeriod()
  const first = firstOwedPeriod(db, member)

  const periods = first <= now ? periodRange(first, now) : []
  let expected = 0
  const unpaidPeriods: string[] = []

  if (member.active && monthly > 0) {
    for (const period of periods) {
      expected += monthly
      if (paidFor(db, member.id, period) + 0.01 < monthly) unpaidPeriods.push(period)
    }
  }

  // Every payment counts as income, including those on months not (or no
  // longer) expected — an inactive member's back-payment is still cash in.
  let paid = 0
  for (const p of db.duePayments) if (p.memberId === member.id) paid += p.amount

  const paidOnExpected = member.active && monthly > 0
    ? periods.reduce((sum, period) => sum + Math.min(monthly, paidFor(db, member.id, period)), 0)
    : 0

  return {
    member,
    category,
    monthly,
    expected,
    paid,
    balance: Math.max(0, expected - paidOnExpected),
    unpaidPeriods,
  }
}

export function allBalances(db: DB): MemberBalance[] {
  return db.members.map((m) => memberBalance(db, m))
}

/** Members owing money, heaviest debt first. */
export function arrears(db: DB): MemberBalance[] {
  return allBalances(db)
    .filter((b) => b.balance > 0)
    .sort((a, b) => b.balance - a.balance)
}

export function totalDuesCollected(db: DB): number {
  return db.duePayments.reduce((s, p) => s + p.amount, 0)
}

export function totalContributions(db: DB): number {
  return db.contributions.reduce((s, c) => s + c.amount, 0)
}

export function totalExpenses(db: DB): number {
  return db.expenses.reduce((s, e) => s + e.amount, 0)
}

export function campaignRaised(db: DB, campaignId: string): number {
  return db.contributions
    .filter((c) => c.campaignId === campaignId)
    .reduce((s, c) => s + c.amount, 0)
}

export interface Totals {
  income: number
  dues: number
  contributions: number
  expenses: number
  balance: number
  outstanding: number
  activeMembers: number
  inactiveMembers: number
}

export function totals(db: DB): Totals {
  const dues = totalDuesCollected(db)
  const contributions = totalContributions(db)
  const expenses = totalExpenses(db)
  const outstanding = arrears(db).reduce((s, b) => s + b.balance, 0)
  return {
    dues,
    contributions,
    income: dues + contributions,
    expenses,
    balance: dues + contributions - expenses,
    outstanding,
    activeMembers: db.members.filter((m) => m.active).length,
    inactiveMembers: db.members.filter((m) => !m.active).length,
  }
}

export interface MonthlyPoint {
  period: string
  income: number
  expenses: number
}

/** Income vs expenses per month over the last `months` months. */
export function monthlySeries(db: DB, months = 6): MonthlyPoint[] {
  const now = currentPeriod()
  const [y, m] = now.split('-').map(Number)
  const startMonth = m - (months - 1)
  const startYear = y + Math.floor((startMonth - 1) / 12)
  const normalized = ((startMonth - 1) % 12 + 12) % 12 + 1
  const from = `${startYear}-${String(normalized).padStart(2, '0')}`

  const buckets = new Map<string, MonthlyPoint>()
  for (const period of periodRange(from, now)) {
    buckets.set(period, { period, income: 0, expenses: 0 })
  }

  for (const p of db.duePayments) {
    const b = buckets.get(p.date.slice(0, 7))
    if (b) b.income += p.amount
  }
  for (const c of db.contributions) {
    const b = buckets.get(c.date.slice(0, 7))
    if (b) b.income += c.amount
  }
  for (const e of db.expenses) {
    const b = buckets.get(e.date.slice(0, 7))
    if (b) b.expenses += e.amount
  }

  return [...buckets.values()]
}

export interface CategoryTotal {
  category: Expense['category']
  amount: number
  share: number
}

export function expensesByCategory(db: DB): CategoryTotal[] {
  const map = new Map<Expense['category'], number>()
  for (const e of db.expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
  const total = totalExpenses(db) || 1
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount, share: amount / total }))
    .sort((a, b) => b.amount - a.amount)
}

/** Every movement on a member's account, newest first. */
export interface StatementLine {
  id: string
  date: string
  label: string
  detail: string
  amount: number
  kind: 'due' | 'contribution'
}

export function memberStatement(db: DB, memberId: string): StatementLine[] {
  const lines: StatementLine[] = []

  for (const p of db.duePayments) {
    if (p.memberId !== memberId) continue
    lines.push({
      id: p.id,
      date: p.date,
      label: 'Cotisation mensuelle',
      detail: p.period,
      amount: p.amount,
      kind: 'due',
    })
  }

  for (const c of db.contributions) {
    if (c.memberId !== memberId) continue
    const campaign = db.campaigns.find((x) => x.id === c.campaignId)
    lines.push({
      id: c.id,
      date: c.date,
      label: 'Cotisation extraordinaire',
      detail: campaign?.title ?? '—',
      amount: c.amount,
      kind: 'contribution',
    })
  }

  return lines.sort((a, b) => b.date.localeCompare(a.date))
}

/** Years that hold any dues activity, plus the current one. */
export function activeYears(db: DB): number[] {
  const years = new Set<number>([new Date().getFullYear()])
  for (const p of db.duePayments) years.add(Number(p.period.slice(0, 4)))
  years.add(Number(db.association.fiscalStart.slice(0, 4)))
  return [...years].sort((a, b) => b - a)
}
