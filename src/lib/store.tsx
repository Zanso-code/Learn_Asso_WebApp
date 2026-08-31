import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type {
  Association,
  Campaign,
  Category,
  Contribution,
  DB,
  DuePayment,
  Expense,
  Member,
  Role,
} from './types'
import { buildEmpty } from './seed'
import { uid } from './format'
import { deleteReceipt, deleteReceipts } from './receipts'
import { readJSON, tenantKey, writeJSON } from './storage'
import { usePlatform } from './platform'

interface StoreValue {
  db: DB | null
  role: Role
  isTreasurer: boolean

  /** Wipes this association's ledger back to empty — the account itself stays. */
  resetLedger: () => void
  /** Wholesale replacement, used by the Excel restore in Paramètres. */
  replaceDB: (next: DB) => void

  updateAssociation: (patch: Partial<Association>) => void

  addMember: (m: Omit<Member, 'id'>) => Member
  updateMember: (id: string, patch: Partial<Member>) => void
  removeMember: (id: string) => void

  addCategory: (c: Omit<Category, 'id'>) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  removeCategory: (id: string) => void

  recordDue: (p: Omit<DuePayment, 'id'>) => void
  removeDue: (id: string) => void
  clearDuesForCell: (memberId: string, period: string) => void

  addCampaign: (c: Omit<Campaign, 'id'>) => void
  updateCampaign: (id: string, patch: Partial<Campaign>) => void
  removeCampaign: (id: string) => void

  addContribution: (c: Omit<Contribution, 'id'>) => void
  removeContribution: (id: string) => void

  addExpense: (e: Omit<Expense, 'id'>) => void
  updateExpense: (id: string, patch: Partial<Expense>) => void
  removeExpense: (id: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

interface Loaded {
  id: string | null
  db: DB | null
}

function loadTenant(id: string | null): Loaded {
  return { id, db: id ? readJSON<DB>(tenantKey(id)) : null }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session, role, isTreasurer, syncAccountIdentity } = usePlatform()
  const associationId = session?.associationId ?? null

  const [loaded, setLoaded] = useState<Loaded>(() => loadTenant(associationId))

  // Signing in or out swaps the whole ledger. Adjusting state during render is
  // the supported way to react to a changed input without painting a frame of
  // the *previous* tenant's data — which here would be a cross-tenant leak.
  if (loaded.id !== associationId) setLoaded(loadTenant(associationId))
  const current = loaded.id === associationId ? loaded : loadTenant(associationId)

  // Every mutation writes through to this tenant's own key. The whole ledger is
  // a few hundred KB of JSON at realistic association sizes, so a full rewrite
  // is cheaper than diffing.
  const patch = useCallback((fn: (db: DB) => DB) => {
    setLoaded((prev) => {
      if (!prev.id || !prev.db) return prev
      const next = fn(prev.db)
      writeJSON(tenantKey(prev.id), next)
      return { ...prev, db: next }
    })
  }, [])

  const value = useMemo<StoreValue>(() => {
    const db = current.db

    return {
      db,
      role,
      isTreasurer,

      resetLedger: () =>
        patch((d) => {
          const keys = d.expenses.map((e) => e.receiptKey).filter((k): k is string => Boolean(k))
          if (keys.length) void deleteReceipts(keys)
          const { name, acronym, city, country } = d.association
          return buildEmpty(name, acronym, city, country)
        }),

      replaceDB: (next) => patch(() => next),

      updateAssociation: (p) =>
        patch((d) => {
          const association = { ...d.association, ...p }
          // The Platform Admin console lists associations by name and sigle, so
          // a rename here has to reach the account record too.
          if (p.name !== undefined || p.acronym !== undefined) {
            syncAccountIdentity(association.name, association.acronym)
          }
          return { ...d, association }
        }),

      addMember: (m) => {
        const member: Member = { ...m, id: uid('mbr') }
        patch((d) => ({ ...d, members: [...d.members, member] }))
        return member
      },
      updateMember: (id, p) =>
        patch((d) => ({
          ...d,
          members: d.members.map((m) => (m.id === id ? { ...m, ...p } : m)),
        })),
      removeMember: (id) =>
        patch((d) => ({
          ...d,
          members: d.members.filter((m) => m.id !== id),
          duePayments: d.duePayments.filter((p) => p.memberId !== id),
          // Contributions survive as anonymous donations: the money was
          // really received and must stay in the campaign total.
          contributions: d.contributions.map((c) =>
            c.memberId === id
              ? {
                  ...c,
                  memberId: null,
                  donorName:
                    c.donorName ?? d.members.find((m) => m.id === id)?.fullName ?? 'Ancien membre',
                }
              : c,
          ),
        })),

      addCategory: (c) =>
        patch((d) => ({ ...d, categories: [...d.categories, { ...c, id: uid('cat') }] })),
      updateCategory: (id, p) =>
        patch((d) => ({
          ...d,
          categories: d.categories.map((c) => (c.id === id ? { ...c, ...p } : c)),
        })),
      removeCategory: (id) =>
        patch((d) => {
          const fallback = d.categories.find((c) => c.id !== id)
          if (!fallback) return d // never leave the association with zero categories
          return {
            ...d,
            categories: d.categories.filter((c) => c.id !== id),
            members: d.members.map((m) =>
              m.categoryId === id ? { ...m, categoryId: fallback.id } : m,
            ),
          }
        }),

      recordDue: (p) =>
        patch((d) => ({ ...d, duePayments: [...d.duePayments, { ...p, id: uid('due') }] })),
      removeDue: (id) =>
        patch((d) => ({ ...d, duePayments: d.duePayments.filter((p) => p.id !== id) })),
      clearDuesForCell: (memberId, period) =>
        patch((d) => ({
          ...d,
          duePayments: d.duePayments.filter(
            (p) => !(p.memberId === memberId && p.period === period),
          ),
        })),

      addCampaign: (c) =>
        patch((d) => ({ ...d, campaigns: [...d.campaigns, { ...c, id: uid('cmp') }] })),
      updateCampaign: (id, p) =>
        patch((d) => ({
          ...d,
          campaigns: d.campaigns.map((c) => (c.id === id ? { ...c, ...p } : c)),
        })),
      removeCampaign: (id) =>
        patch((d) => ({
          ...d,
          campaigns: d.campaigns.filter((c) => c.id !== id),
          contributions: d.contributions.filter((c) => c.campaignId !== id),
        })),

      addContribution: (c) =>
        patch((d) => ({ ...d, contributions: [...d.contributions, { ...c, id: uid('ctr') }] })),
      removeContribution: (id) =>
        patch((d) => ({ ...d, contributions: d.contributions.filter((c) => c.id !== id) })),

      addExpense: (e) =>
        patch((d) => ({ ...d, expenses: [...d.expenses, { ...e, id: uid('exp') }] })),
      updateExpense: (id, p) =>
        patch((d) => ({
          ...d,
          expenses: d.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)),
        })),
      removeExpense: (id) =>
        patch((d) => {
          const target = d.expenses.find((e) => e.id === id)
          if (target?.receiptKey) void deleteReceipt(target.receiptKey)
          return { ...d, expenses: d.expenses.filter((e) => e.id !== id) }
        }),
    }
  }, [current.db, role, isTreasurer, patch, syncAccountIdentity])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore doit être utilisé dans un <StoreProvider>')
  return ctx
}

/** Same store, but guarantees a loaded association — for routes behind the guard. */
export function useDB(): StoreValue & { db: DB } {
  const ctx = useStore()
  if (!ctx.db) throw new Error('Aucune association chargée')
  return ctx as StoreValue & { db: DB }
}
