import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { buildBlank, defaultCategories } from './seed'
import { uid } from './format'
import { deleteReceipt, deleteReceipts } from './receipts'
import { usePlatform } from './platform'
import { hasAccess } from './subscription'
import { ENTITIES, type EntityName } from './sync/mapping'
import type { OpBody } from './sync/outbox'
import { enqueue } from './sync/outbox'
import { clearLedger, loadLedger, saveLedger } from './sync/ledger'
import { hydrate, mergeChanges } from './sync/engine'
import { SyncProvider, useSyncEngine } from './sync/status'

/**
 * Etat du chargement du grand livre.
 *
 * `loading` est nouveau : la source de verite est desormais distante, et
 * l'ancienne lecture synchrone de localStorage pendant le rendu n'a plus
 * d'equivalent. Les routes de /app s'appuient sur ce statut via `Layout`.
 */
export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

interface StoreValue {
  db: DB | null
  /** Association chargée — non nulle dès que `db` l'est. */
  associationId: string | null
  status: StoreStatus
  role: Role
  isTreasurer: boolean

  /** Vide le grand livre de cette association — le compte, lui, subsiste. */
  resetLedger: () => void
  /** Remplacement complet, utilise par la restauration Excel des Paramètres. */
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
  status: StoreStatus
}

/** Resultat d'une mutation : le nouveau grand livre et ce qu'il faut envoyer. */
interface Mutation {
  db: DB
  ops: OpBody[]
}

/* ------------------------------------------- fabriques d'operations, lisibles */

const ins = (entity: EntityName, item: object): OpBody => ({
  kind: 'insert',
  entity,
  item: item as Record<string, unknown>,
})

const pat = (entity: EntityName, rowId: string, patch: object): OpBody => ({
  kind: 'patch',
  entity,
  rowId,
  patch: patch as Record<string, unknown>,
})

const del = (entity: EntityName, rowId: string): OpBody => ({ kind: 'delete', entity, rowId })

type Identified = { id: string }

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session, account, role, isTreasurer, applyAccountRow } = usePlatform()
  const associationId = session?.associationId ?? null

  const [state, setStateRaw] = useState<Loaded>({ id: null, db: null, status: 'idle' })

  // Meme motif que dans platform.tsx : les mutations se calculent hors du
  // `setState`, a partir de cette reference, pour que deux mutations dans le
  // meme tour de boucle s'enchainent correctement — et surtout pour que
  // l'ecriture disque et la mise en file ne se produisent pas a l'interieur
  // d'un updater React, ou StrictMode les jouerait deux fois.
  const stateRef = useRef(state)

  const commit = useCallback((next: Loaded) => {
    stateRef.current = next
    setStateRaw(next)
  }, [])

  /**
   * Toutes les ecritures locales passent par cette chaine de promesses.
   *
   * IndexedDB est asynchrone alors que les mutateurs restent synchrones : sans
   * serialisation, deux mutations rapprochees pourraient s'enregistrer dans le
   * desordre et le miroir refleterait un etat qui n'a jamais existe.
   */
  const chain = useRef<Promise<void>>(Promise.resolve())

  const persist = useCallback((id: string, db: DB, ops: OpBody[]) => {
    chain.current = chain.current
      .then(async () => {
        await saveLedger(id, db)
        for (const op of ops) await enqueue({ ...op, associationId: id })
      })
      .catch((error) => {
        console.error('Sauvegarde locale impossible', error)
      })
  }, [])

  const notifyMutation = useRef<() => void>(() => {})

  const apply = useCallback(
    (build: (db: DB, associationId: string) => Mutation | null) => {
      const { id, db } = stateRef.current
      if (!id || !db) return
      const result = build(db, id)
      if (!result || result.db === db) return

      commit({ ...stateRef.current, db: result.db })
      persist(id, result.db, result.ops)
      if (result.ops.length) notifyMutation.current()
    },
    [commit, persist],
  )

  /* ------------------------------------------------------------ hydratation */

  useEffect(() => {
    let cancelled = false

    if (!associationId) {
      commit({ id: null, db: null, status: 'idle' })
      return
    }

    commit({ id: associationId, db: null, status: 'loading' })

    void (async () => {
      try {
        // Miroir local d'abord : l'application s'ouvre instantanement, y
        // compris sans reseau. Le rattrapage se fait ensuite en arriere-plan,
        // declenche par le moteur des que `status` passe a `ready`.
        const mirror = await loadLedger(associationId)
        if (cancelled) return
        if (mirror) {
          commit({ id: associationId, db: mirror, status: 'ready' })
          return
        }

        // Premiere connexion sur cet appareil : tout vient du serveur.
        const { db, accountRow, offline } = await hydrate(associationId, buildBlank())
        if (cancelled) return

        if (offline && !accountRow) {
          // Sans miroir et sans reseau, il n'y a tout simplement rien a montrer.
          commit({ id: associationId, db: null, status: 'error' })
          return
        }

        await saveLedger(associationId, db)
        if (cancelled) return
        if (accountRow) applyAccountRow(accountRow)
        commit({ id: associationId, db, status: 'ready' })
      } catch (error) {
        console.error('Chargement du grand livre impossible', error)
        if (!cancelled) commit({ id: associationId, db: null, status: 'error' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [associationId, commit, applyAccountRow])

  /* ------------------------------------------------------ synchronisation */

  // L'abonnement est désormais appliqué par la RLS : une association bloquée
  // voit ses écritures refusées par Postgres, quoi que fasse le navigateur.
  // Couper le moteur ici évite juste de pousser des opérations vouées au rebut
  // — et d'empiler des erreurs 403 dans la file d'attente.
  const accessOk = account ? hasAccess(account) : false

  const sync = useSyncEngine({
    associationId,
    enabled: state.status === 'ready' && accessOk,
    getDb: () => stateRef.current.db,
    onMerge: (result, skip) => {
      const { id, db } = stateRef.current
      if (!id || !db) return
      const merged = mergeChanges(db, result, skip)
      if (!merged.changed) return
      commit({ ...stateRef.current, db: merged.db })
      persist(id, merged.db, [])
    },
    onAccountRow: applyAccountRow,
  })

  // Le moteur est créé après `apply`, qui doit pourtant le prévenir de chaque
  // mutation : la référence fait le pont, mise à jour hors rendu.
  useEffect(() => {
    notifyMutation.current = sync.notifyMutation
  }, [sync.notifyMutation])

  /* ------------------------------------------------------------- mutateurs */

  const value = useMemo<StoreValue>(() => {
    return {
      db: state.db,
      associationId: state.id,
      status: state.status,
      role,
      isTreasurer,

      resetLedger: () =>
        apply((d, id) => {
          const ops: OpBody[] = []
          for (const entity of ENTITIES) {
            for (const row of d[entity] as Identified[]) ops.push(del(entity, row.id))
          }

          const keys = d.expenses.map((e) => e.receiptKey).filter((k): k is string => Boolean(k))
          if (keys.length) void deleteReceipts(id, keys)

          const categories = defaultCategories()
          for (const c of categories) ops.push(ins('categories', c))

          // Le logo survit a la remise a zero : c'est l'identite visuelle de
          // l'association, pas une donnee comptable.
          const { name, acronym, city, country, logo } = d.association
          const association: Association = {
            ...buildBlank().association,
            name,
            acronym,
            city,
            country,
            logo,
          }
          ops.push({ kind: 'assocPatch', patch: { ...association } })

          return { db: { ...buildBlank(), association, categories }, ops }
        }),

      replaceDB: (next) =>
        apply((d) => {
          // Les suppressions passent en premier, toutes entites confondues,
          // puis les insertions dans l'ordre de dependance : les inserts
          // consecutifs d'une meme table partent alors en un seul upsert.
          const removals: OpBody[] = []
          const inserts: OpBody[] = []

          for (const entity of ENTITIES) {
            const after = next[entity] as Identified[]
            const keep = new Set(after.map((row) => row.id))
            for (const row of d[entity] as Identified[]) {
              if (!keep.has(row.id)) removals.push(del(entity, row.id))
            }
            for (const row of after) inserts.push(ins(entity, row))
          }

          return {
            db: next,
            ops: [...removals, ...inserts, { kind: 'assocPatch', patch: { ...next.association } }],
          }
        }),

      updateAssociation: (p) =>
        apply((d) => ({
          db: { ...d, association: { ...d.association, ...p } },
          ops: [{ kind: 'assocPatch', patch: { ...p } }],
        })),

      addMember: (m) => {
        const member: Member = { ...m, id: uid('mbr') }
        apply((d) => ({
          db: { ...d, members: [...d.members, member] },
          ops: [ins('members', member)],
        }))
        return member
      },

      updateMember: (id, p) =>
        apply((d) => ({
          db: { ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...p } : m)) },
          ops: [pat('members', id, p)],
        })),

      removeMember: (id) =>
        apply((d) => {
          const ops: OpBody[] = [del('members', id)]
          const gone = d.members.find((m) => m.id === id)

          for (const p of d.duePayments) {
            if (p.memberId === id) ops.push(del('duePayments', p.id))
          }

          // Les contributions survivent en dons anonymes : l'argent a bien ete
          // recu et doit rester dans le total de la campagne.
          const contributions = d.contributions.map((c) => {
            if (c.memberId !== id) return c
            const donorName = c.donorName ?? gone?.fullName ?? 'Ancien membre'
            ops.push(pat('contributions', c.id, { memberId: null, donorName }))
            return { ...c, memberId: null, donorName }
          })

          return {
            db: {
              ...d,
              members: d.members.filter((m) => m.id !== id),
              duePayments: d.duePayments.filter((p) => p.memberId !== id),
              contributions,
            },
            ops,
          }
        }),

      addCategory: (c) => {
        const category: Category = { ...c, id: uid('cat') }
        apply((d) => ({
          db: { ...d, categories: [...d.categories, category] },
          ops: [ins('categories', category)],
        }))
      },

      updateCategory: (id, p) =>
        apply((d) => ({
          db: { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...p } : c)) },
          ops: [pat('categories', id, p)],
        })),

      removeCategory: (id) =>
        apply((d) => {
          const fallback = d.categories.find((c) => c.id !== id)
          if (!fallback) return null // jamais zero categorie

          const ops: OpBody[] = [del('categories', id)]
          const members = d.members.map((m) => {
            if (m.categoryId !== id) return m
            ops.push(pat('members', m.id, { categoryId: fallback.id }))
            return { ...m, categoryId: fallback.id }
          })

          return { db: { ...d, categories: d.categories.filter((c) => c.id !== id), members }, ops }
        }),

      recordDue: (p) => {
        const payment: DuePayment = { ...p, id: uid('due') }
        apply((d) => ({
          db: { ...d, duePayments: [...d.duePayments, payment] },
          ops: [ins('duePayments', payment)],
        }))
      },

      removeDue: (id) =>
        apply((d) => ({
          db: { ...d, duePayments: d.duePayments.filter((p) => p.id !== id) },
          ops: [del('duePayments', id)],
        })),

      clearDuesForCell: (memberId, period) =>
        apply((d) => {
          const doomed = d.duePayments.filter((p) => p.memberId === memberId && p.period === period)
          if (!doomed.length) return null
          return {
            db: {
              ...d,
              duePayments: d.duePayments.filter(
                (p) => !(p.memberId === memberId && p.period === period),
              ),
            },
            ops: doomed.map((p) => del('duePayments', p.id)),
          }
        }),

      addCampaign: (c) => {
        const campaign: Campaign = { ...c, id: uid('cmp') }
        apply((d) => ({
          db: { ...d, campaigns: [...d.campaigns, campaign] },
          ops: [ins('campaigns', campaign)],
        }))
      },

      updateCampaign: (id, p) =>
        apply((d) => ({
          db: { ...d, campaigns: d.campaigns.map((c) => (c.id === id ? { ...c, ...p } : c)) },
          ops: [pat('campaigns', id, p)],
        })),

      removeCampaign: (id) =>
        apply((d) => {
          const ops: OpBody[] = [del('campaigns', id)]
          for (const c of d.contributions) {
            if (c.campaignId === id) ops.push(del('contributions', c.id))
          }
          return {
            db: {
              ...d,
              campaigns: d.campaigns.filter((c) => c.id !== id),
              contributions: d.contributions.filter((c) => c.campaignId !== id),
            },
            ops,
          }
        }),

      addContribution: (c) => {
        const contribution: Contribution = { ...c, id: uid('ctr') }
        apply((d) => ({
          db: { ...d, contributions: [...d.contributions, contribution] },
          ops: [ins('contributions', contribution)],
        }))
      },

      removeContribution: (id) =>
        apply((d) => ({
          db: { ...d, contributions: d.contributions.filter((c) => c.id !== id) },
          ops: [del('contributions', id)],
        })),

      addExpense: (e) => {
        const expense: Expense = { ...e, id: uid('exp') }
        apply((d) => ({
          db: { ...d, expenses: [...d.expenses, expense] },
          ops: [ins('expenses', expense)],
        }))
      },

      updateExpense: (id, p) =>
        apply((d) => ({
          db: { ...d, expenses: d.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)) },
          ops: [pat('expenses', id, p)],
        })),

      removeExpense: (id) =>
        apply((d, associationId) => {
          const target = d.expenses.find((e) => e.id === id)
          if (target?.receiptKey) void deleteReceipt(associationId, target.receiptKey)
          return {
            db: { ...d, expenses: d.expenses.filter((e) => e.id !== id) },
            ops: [del('expenses', id)],
          }
        }),
    }
  }, [state.db, state.id, state.status, role, isTreasurer, apply])

  return (
    <StoreContext.Provider value={value}>
      <SyncProvider value={sync}>{children}</SyncProvider>
    </StoreContext.Provider>
  )
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore doit être utilisé dans un <StoreProvider>')
  return ctx
}

/** Même store, mais garantit un grand livre chargé — pour les routes gardées. */
export function useDB(): StoreValue & { db: DB; associationId: string } {
  const ctx = useStore()
  if (!ctx.db || !ctx.associationId) throw new Error('Aucune association chargée')
  return ctx as StoreValue & { db: DB; associationId: string }
}

/** Efface toute trace locale d'une association — appelé à la déconnexion. */
export async function forgetLocalLedger(associationId: string): Promise<void> {
  await clearLedger(associationId)
}
