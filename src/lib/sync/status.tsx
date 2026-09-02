/**
 * Ordonnancement de la synchronisation, et etat affiche a l'utilisateur.
 *
 * Un tresorier qui saisit des cotisations sans reseau doit voir noir sur blanc
 * que ses ecritures sont en attente et non perdues — d'ou un etat expose
 * jusque dans l'en-tete.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { DB } from '../types'
import { supabase } from '../supabase'
import { commitCursor, sync, type PullResult } from './engine'
import { pendingCount } from './outbox'
import { TABLES } from './mapping'

/** Rythme de fond, tant que l'onglet est visible. */
const INTERVAL_MS = 60_000
/** Regroupement des mutations rapprochees en une seule montee. */
const MUTATION_DEBOUNCE_MS = 2000
/** Laisse le temps a plusieurs evenements temps reel d'arriver ensemble. */
const REALTIME_DEBOUNCE_MS = 800

export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncState {
  phase: SyncPhase
  /** Operations locales pas encore acceptees par le serveur. */
  pending: number
  lastSyncedAt: number | null
  /** Force une montee immediate (bouton « Synchroniser »). */
  syncNow: () => void
  /** Signale une mutation locale : declenche une montee differee. */
  notifyMutation: () => void
}

const SyncContext = createContext<SyncState | null>(null)

export function SyncProvider({ value, children }: { value: SyncState; children: ReactNode }) {
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync doit être utilisé dans un <SyncProvider>')
  return ctx
}

export interface SyncEngineOptions {
  associationId: string | null
  /** Faux tant que le grand livre n'est pas charge : rien a synchroniser. */
  enabled: boolean
  /** Grand livre courant, lu au dernier moment. */
  getDb: () => DB | null
  /**
   * Applique les changements recus. DOIT etre synchrone : la fusion se fait sur
   * le grand livre courant, pas sur un instantane, et tout `await` glisse dans
   * cet intervalle des saisies qui seraient alors ecrasees.
   */
  onMerge: (result: PullResult, skip: Set<string>) => void
  /** Ligne `associations` fraiche — l'abonnement en depend. */
  onAccountRow: (row: Record<string, unknown>) => void
}

export function useSyncEngine(options: SyncEngineOptions): SyncState {
  const [phase, setPhase] = useState<SyncPhase>('idle')
  const [pending, setPending] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  // Les declencheurs (intervalle, evenements, temps reel) sont installes une
  // seule fois ; ils lisent les options a travers cette reference plutot que de
  // se reinstaller a chaque rendu.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const running = useRef(false)
  const queued = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async () => {
    const { associationId, enabled, getDb, onMerge, onAccountRow } = optionsRef.current
    if (!associationId || !enabled || !getDb()) return

    if (running.current) {
      queued.current = true
      return
    }
    running.current = true

    try {
      // Hors ligne, inutile de lancer des requetes vouees a echouer : on se
      // contente de rafraichir le compteur affiche.
      if (!navigator.onLine) {
        setPending(await pendingCount(associationId))
        setPhase('offline')
        return
      }

      setPhase('syncing')
      const outcome = await sync(associationId)

      onMerge(outcome.pull, outcome.skip)
      if (outcome.pull.accountRow) onAccountRow(outcome.pull.accountRow)
      await commitCursor(associationId, outcome.pull)

      setPending(outcome.pending)
      if (outcome.offline) {
        setPhase('offline')
      } else {
        setPhase('synced')
        setLastSyncedAt(Date.now())
      }
    } catch (error) {
      console.error('Synchronisation impossible', error)
      setPhase('error')
    } finally {
      running.current = false
      if (queued.current) {
        queued.current = false
        void run()
      }
    }
  }, [])

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void run()
      }, delay)
    },
    [run],
  )

  const syncNow = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    void run()
  }, [run])

  const notifyMutation = useCallback(() => {
    setPending((n) => n + 1)
    schedule(MUTATION_DEBOUNCE_MS)
  }, [schedule])

  const { associationId, enabled } = options

  // Connexion, changement d'association : on part chercher tout de suite.
  useEffect(() => {
    if (!associationId || !enabled) {
      setPhase('idle')
      setPending(0)
      return
    }
    void run()
  }, [associationId, enabled, run])

  // Retour du reseau, retour sur l'onglet, battement de fond.
  useEffect(() => {
    if (!associationId || !enabled) return

    const onOnline = () => void run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void run()
    }, INTERVAL_MS)

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [associationId, enabled, run])

  // Temps reel : l'appareil d'a cote enregistre une cotisation, celui-ci
  // l'affiche sans attendre le battement de soixante secondes.
  useEffect(() => {
    if (!associationId || !enabled) return

    const channel = supabase.channel(`asso:${associationId}`)
    for (const table of Object.values(TABLES)) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `association_id=eq.${associationId}`,
        },
        () => schedule(REALTIME_DEBOUNCE_MS),
      )
    }
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'associations', filter: `id=eq.${associationId}` },
      () => schedule(REALTIME_DEBOUNCE_MS),
    )
    channel.subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [associationId, enabled, schedule])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { phase, pending, lastSyncedAt, syncNow, notifyMutation }
}
