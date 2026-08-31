import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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
import { buildEmpty, buildSeed } from './seed'
import { uid } from './format'
import { clearReceipts, deleteReceipt } from './receipts'

const DB_KEY = 'assocaisse:db:v1'
const ROLE_KEY = 'assocaisse:role:v1'

function readDB(): DB | null {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DB
    if (!parsed || !Array.isArray(parsed.members)) return null
    return parsed
  } catch {
    return null
  }
}

function readRole(): Role {
  try {
    return localStorage.getItem(ROLE_KEY) === 'viewer' ? 'viewer' : 'treasurer'
  } catch {
    return 'treasurer'
  }
}

interface StoreValue {
  db: DB | null
  role: Role
  isTreasurer: boolean
  setRole: (role: Role) => void

  loadDemo: () => void
  createAssociation: (name: string, acronym: string) => void
  resetAll: () => void

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

export function StoreProvider({ children }: { children: ReactNode }) {
  // Hydrated lazily during the first render rather than in an effect: this is a
  // pure client app, so there is no reason to paint an empty frame first.
  const [db, setDb] = useState<DB | null>(readDB)
  const [role, setRoleState] = useState<Role>(readRole)
  const firstRender = useRef(true)

  // Persist on every mutation. The whole ledger is a few hundred KB of JSON at
  // realistic association sizes, so a full rewrite is cheaper than diffing.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return // nothing changed yet; don't rewrite what we just read
    }
    try {
      if (db) localStorage.setItem(DB_KEY, JSON.stringify(db))
      else localStorage.removeItem(DB_KEY)
    } catch (err) {
      console.error('Sauvegarde impossible (quota localStorage ?)', err)
    }
  }, [db])

  const setRole = useCallback((next: Role) => {
    setRoleState(next)
    try {
      localStorage.setItem(ROLE_KEY, next)
    } catch {
      /* private browsing — role simply won't persist */
    }
  }, [])

  const patch = useCallback((fn: (current: DB) => DB) => {
    setDb((current) => (current ? fn(current) : current))
  }, [])

  const value = useMemo<StoreValue>(() => {
    const isTreasurer = role === 'treasurer'

    return {
      db,
      role,
      isTreasurer,
      setRole,

      loadDemo: () => setDb(buildSeed()),
      createAssociation: (name, acronym) => setDb(buildEmpty(name, acronym)),
      resetAll: () => {
        void clearReceipts()
        setDb(null)
      },

      updateAssociation: (p) =>
        patch((d) => ({ ...d, association: { ...d.association, ...p } })),

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
  }, [db, role, setRole, patch])

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
