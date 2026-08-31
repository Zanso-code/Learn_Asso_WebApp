import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AssociationAccount,
  DB,
  PlatformContact,
  PlatformState,
  Role,
  Session,
} from './types'
import { hashPassword, verifyPassword } from './auth'
import {
  ADMIN_SESSION_KEY,
  PLATFORM_KEY,
  SESSION_KEY,
  readJSON,
  removeKey,
  tenantKey,
  writeJSON,
} from './storage'
import { buildEmpty } from './seed'
import { todayISO, uid } from './format'
import { deleteReceipts } from './receipts'

/** New sign-ups start on a trial; the Platform Admin converts them once paid. */
const TRIAL_DAYS = 30

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

function defaultPlatform(): PlatformState {
  return {
    version: 1,
    admin: null,
    contact: { nom: 'AssoCaisse', dialCode: '226', telephone: '', email: '' },
    comptes: [],
  }
}

function readPlatform(): PlatformState {
  const stored = readJSON<PlatformState>(PLATFORM_KEY)
  if (!stored || !Array.isArray(stored.comptes)) return defaultPlatform()
  const base = defaultPlatform()
  // `contact` is merged explicitly: a record written by an earlier version
  // predates fields such as contact.email, and a shallow spread would hand the
  // UI an object missing them — enough to crash the pages that read them.
  return { ...base, ...stored, contact: { ...base.contact, ...stored.contact } }
}

function readSession(): Session | null {
  const stored = readJSON<Session>(SESSION_KEY)
  if (!stored?.associationId) return null
  return {
    associationId: stored.associationId,
    role: stored.role === 'treasurer' ? 'treasurer' : 'viewer',
  }
}

function readAdminSession(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export interface NewAccountInput {
  nom: string
  sigle: string
  ville: string
  pays: string
  responsable: string
  dialCode: string
  telephone: string
  email: string
  motDePasseCompte: string
  motDePasseTresorier: string
  /** Optional, compressed data URL. */
  logo?: string
}

interface PlatformValue {
  comptes: AssociationAccount[]
  contact: PlatformContact

  /** The signed-in association, or null when nobody is signed in. */
  session: Session | null
  account: AssociationAccount | null
  role: Role
  isTreasurer: boolean

  createAccount: (input: NewAccountInput) => Promise<AssociationAccount>
  login: (associationId: string, password: string) => Promise<boolean>
  logout: () => void

  unlockTreasurer: (password: string) => Promise<boolean>
  lockTreasurer: () => void
  changeTreasurerPassword: (current: string, next: string) => Promise<boolean>
  changeAccountPassword: (current: string, next: string) => Promise<boolean>

  /** Kept in sync when the treasurer renames the association in Paramètres. */
  syncAccountIdentity: (nom: string, sigle: string) => void

  adminExists: boolean
  isAdmin: boolean
  adminSetup: (password: string) => Promise<void>
  adminLogin: (password: string) => Promise<boolean>
  adminLogout: () => void
  updateAccount: (id: string, patch: Partial<AssociationAccount>) => void
  deleteAccount: (id: string) => void
  updateContact: (patch: Partial<PlatformContact>) => void
}

const PlatformContext = createContext<PlatformValue | null>(null)

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlatformState>(readPlatform)
  const [session, setSession] = useState<Session | null>(readSession)
  const [isAdmin, setIsAdmin] = useState<boolean>(readAdminSession)

  // The async actions below (login, adminLogin) await a PBKDF2 hash before they
  // read the account list, and may run in the same tick as the mutation that
  // created it — `createAccount` then `login`. Reading through this ref instead
  // of the memo's captured `state` keeps them from seeing a stale list.
  // Seeded once here and advanced inside `patchState`, the only writer of
  // `state`, so it never has to be touched during render.
  const stateRef = useRef(state)

  // Platform state is small (one row per customer) and changes rarely, so it is
  // written through on every mutation rather than batched in an effect: that
  // keeps deleteAccount's cascade and its write atomic from the caller's view.
  const patchState = useCallback((fn: (current: PlatformState) => PlatformState) => {
    setState((current) => {
      const next = fn(current)
      stateRef.current = next
      writeJSON(PLATFORM_KEY, next)
      return next
    })
  }, [])

  const persistSession = useCallback((next: Session | null) => {
    setSession(next)
    if (next) writeJSON(SESSION_KEY, next)
    else removeKey(SESSION_KEY)
  }, [])

  const setAdminSession = useCallback((on: boolean) => {
    setIsAdmin(on)
    try {
      if (on) sessionStorage.setItem(ADMIN_SESSION_KEY, '1')
      else sessionStorage.removeItem(ADMIN_SESSION_KEY)
    } catch {
      /* private browsing — the console just won't survive a reload */
    }
  }, [])

  const value = useMemo<PlatformValue>(() => {
    const account = session
      ? (state.comptes.find((c) => c.id === session.associationId) ?? null)
      : null
    // A session pointing at a deleted association counts as signed out.
    const role: Role = account && session?.role === 'treasurer' ? 'treasurer' : 'viewer'

    return {
      comptes: state.comptes,
      contact: state.contact,
      session: account ? session : null,
      account,
      role,
      isTreasurer: role === 'treasurer',

      createAccount: async (input) => {
        const [compte, tresorier] = await Promise.all([
          hashPassword(input.motDePasseCompte),
          hashPassword(input.motDePasseTresorier),
        ])
        const today = todayISO()
        const created: AssociationAccount = {
          id: uid('asso'),
          nom: input.nom,
          sigle: input.sigle,
          ville: input.ville,
          pays: input.pays,
          responsable: input.responsable,
          dialCode: input.dialCode,
          telephone: input.telephone,
          email: input.email,
          statut_abonnement: 'essai',
          date_expiration_acces: addDays(today, TRIAL_DAYS),
          date_creation: today,
          motDePasseCompte: compte,
          motDePasseTresorier: tresorier,
          notes: '',
        }
        // Seed the tenant's own ledger before anyone can sign in to it.
        writeJSON(
          tenantKey(created.id),
          buildEmpty(created.nom, created.sigle, created.ville, created.pays, input.logo),
        )
        patchState((current) => ({ ...current, comptes: [...current.comptes, created] }))
        // Sign the founder straight in — in read-only, like any other sign-in.
        persistSession({ associationId: created.id, role: 'viewer' })
        return created
      },

      login: async (associationId, password) => {
        const target = stateRef.current.comptes.find((c) => c.id === associationId)
        if (!target) return false
        if (!(await verifyPassword(password, target.motDePasseCompte))) return false
        // Always land in read-only: the Trésorier role needs its own password.
        persistSession({ associationId, role: 'viewer' })
        return true
      },

      logout: () => persistSession(null),

      unlockTreasurer: async (password) => {
        if (!account || !session) return false
        if (!(await verifyPassword(password, account.motDePasseTresorier))) return false
        persistSession({ ...session, role: 'treasurer' })
        return true
      },

      lockTreasurer: () => {
        if (session) persistSession({ ...session, role: 'viewer' })
      },

      changeTreasurerPassword: async (current, next) => {
        if (!account) return false
        if (!(await verifyPassword(current, account.motDePasseTresorier))) return false
        const hashed = await hashPassword(next)
        patchState((s) => ({
          ...s,
          comptes: s.comptes.map((c) =>
            c.id === account.id ? { ...c, motDePasseTresorier: hashed } : c,
          ),
        }))
        return true
      },

      changeAccountPassword: async (current, next) => {
        if (!account) return false
        if (!(await verifyPassword(current, account.motDePasseCompte))) return false
        const hashed = await hashPassword(next)
        patchState((s) => ({
          ...s,
          comptes: s.comptes.map((c) =>
            c.id === account.id ? { ...c, motDePasseCompte: hashed } : c,
          ),
        }))
        return true
      },

      syncAccountIdentity: (nom, sigle) => {
        if (!account || (account.nom === nom && account.sigle === sigle)) return
        patchState((s) => ({
          ...s,
          comptes: s.comptes.map((c) => (c.id === account.id ? { ...c, nom, sigle } : c)),
        }))
      },

      adminExists: Boolean(state.admin?.hash),
      isAdmin,

      adminSetup: async (password) => {
        const hashed = await hashPassword(password)
        patchState((s) => ({ ...s, admin: hashed }))
        setAdminSession(true)
      },

      adminLogin: async (password) => {
        if (!(await verifyPassword(password, stateRef.current.admin))) return false
        setAdminSession(true)
        return true
      },

      adminLogout: () => setAdminSession(false),

      updateAccount: (id, patch) =>
        patchState((s) => ({
          ...s,
          comptes: s.comptes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      deleteAccount: (id) => {
        // Cascade: the ledger and its receipt photos go with the tenant, or a
        // future association inherits orphaned blobs in shared IndexedDB.
        const ledger = readJSON<DB>(tenantKey(id))
        const keys = (ledger?.expenses ?? [])
          .map((e) => e.receiptKey)
          .filter((k): k is string => Boolean(k))
        if (keys.length) void deleteReceipts(keys)
        removeKey(tenantKey(id))
        if (session?.associationId === id) persistSession(null)
        patchState((s) => ({ ...s, comptes: s.comptes.filter((c) => c.id !== id) }))
      },

      updateContact: (patch) => patchState((s) => ({ ...s, contact: { ...s.contact, ...patch } })),
    }
  }, [state, session, isAdmin, patchState, persistSession, setAdminSession])

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform(): PlatformValue {
  const ctx = useContext(PlatformContext)
  if (!ctx) throw new Error('usePlatform doit être utilisé dans un <PlatformProvider>')
  return ctx
}
