import type { AssociationAccount, SubscriptionStatus } from './types'
import { SUBSCRIPTION_STATUSES } from './types'
import { todayISO } from './format'

/** Parse YYYY-MM-DD as a *local* midnight — never UTC, or Ouagadougou (UTC+0)
 *  and Abidjan users would see the cut-off shift by a day. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

const DAY_MS = 86_400_000

/**
 * Whole days remaining before access is cut off. Access runs to the *end* of
 * `date_expiration_acces`, so an expiry of today returns 0 and still grants
 * access; yesterday returns -1 and does not.
 */
export function joursRestants(expiry: string): number {
  if (!expiry) return 0
  const today = localDate(todayISO()).getTime()
  return Math.round((localDate(expiry).getTime() - today) / DAY_MS)
}

export function statusGrantsAccess(status: SubscriptionStatus): boolean {
  return SUBSCRIPTION_STATUSES.find((s) => s.value === status)?.grantsAccess ?? false
}

export function statusLabel(status: SubscriptionStatus): string {
  return SUBSCRIPTION_STATUSES.find((s) => s.value === status)?.label ?? status
}

/** null when the association may use the app; otherwise why it may not. */
export function accessBlockReason(
  account: Pick<AssociationAccount, 'statut_abonnement' | 'date_expiration_acces'>,
): 'suspendu' | 'expire' | null {
  if (!statusGrantsAccess(account.statut_abonnement)) {
    return account.statut_abonnement === 'suspendu' ? 'suspendu' : 'expire'
  }
  return joursRestants(account.date_expiration_acces) < 0 ? 'expire' : null
}

export function hasAccess(
  account: Pick<AssociationAccount, 'statut_abonnement' | 'date_expiration_acces'>,
): boolean {
  return accessBlockReason(account) === null
}

/**
 * Effective status for the console list: an association still marked `actif`
 * whose date has passed must read as expired, or the list lies.
 */
export function effectiveStatus(account: AssociationAccount): SubscriptionStatus {
  const reason = accessBlockReason(account)
  if (reason === null) return account.statut_abonnement
  return reason === 'suspendu' ? 'suspendu' : 'expire'
}

/** Extend from today (or from the current expiry, whichever is later). */
export function extendedExpiry(current: string, months: number): string {
  const today = localDate(todayISO())
  const from = current && localDate(current) > today ? localDate(current) : today
  const target = new Date(from.getFullYear(), from.getMonth() + months, from.getDate())
  // Clamp a rolled-over day (31 Jan + 1 month) back to the month's last day.
  if (target.getDate() !== from.getDate()) target.setDate(0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`
}
