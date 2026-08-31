/** Money is stored as whole FCFA integers — no sub-units in XOF. */
export function formatXOF(amount: number): string {
  const rounded = Math.round(amount || 0)
  const sign = rounded < 0 ? '-' : ''
  const digits = Math.abs(rounded).toString()
  // Narrow no-break space keeps "50 000 FCFA" from wrapping mid-number.
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
  return `${sign}${grouped}\u00a0FCFA`
}

/** Grouped amount with ordinary spaces — for clipboard text, WhatsApp and toasts. */
export function plainXOF(amount: number): string {
  return formatXOF(amount).replace(/[\u202f\u00a0]/g, ' ')
}

/** Same grouping, no currency suffix — for inputs and tight table cells. */
export function formatNumber(amount: number): string {
  return Math.round(amount || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
}

/** Accepts "50 000", "50.000", "50000 FCFA" -> 50000 */
export function parseAmount(raw: string): number {
  const cleaned = String(raw).replace(/[^\d-]/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : 0
}

export const MONTHS_SHORT = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc',
]

export const MONTHS_LONG = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** "2025-03" -> "mars 2025" */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-')
  return `${MONTHS_LONG[parseInt(m, 10) - 1]} ${y}`
}

/** "2025-03-14" -> "14/03/2025" */
export function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatDateLong(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${parseInt(d, 10)} ${MONTHS_LONG[parseInt(m, 10) - 1]} ${y}`
}

export function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function currentPeriod(): string {
  return todayISO().slice(0, 7)
}

export function periodOf(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** Chronological list of periods from `from` up to and including `to`. */
export function periodRange(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  let guard = 0
  while ((y < ty || (y === ty && m <= tm)) && guard++ < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/** Digits only, E.164-ish, for wa.me links. */
export function waNumber(dialCode: string, phone: string): string {
  return `${dialCode}${phone}`.replace(/\D/g, '')
}

export function waLink(dialCode: string, phone: string, message: string): string {
  return `https://wa.me/${waNumber(dialCode, phone)}?text=${encodeURIComponent(message)}`
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
