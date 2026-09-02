import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarClock,
  CloudOff,
  Eye,
  FileText,
  HandCoins,
  LayoutGrid,
  LifeBuoy,
  Loader2,
  LogOut,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { usePlatform } from '@/lib/platform'
import { hasAccess, joursRestants } from '@/lib/subscription'
import { Modal, cx } from './ui'
import { useToast } from './Toast'
import { TreasurerUnlockModal } from './TreasurerUnlock'
import { SyncBadge } from './SyncBadge'

interface NavItem {
  to: string
  label: string
  short: string
  icon: typeof LayoutGrid
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/app', label: 'Tableau de bord', short: 'Bord', icon: LayoutGrid, end: true },
  { to: '/app/membres', label: 'Membres', short: 'Membres', icon: Users },
  { to: '/app/cotisations', label: 'Cotisations', short: 'Cotis.', icon: Wallet },
  { to: '/app/campagnes', label: 'Campagnes', short: 'Campagnes', icon: HandCoins },
  { to: '/app/depenses', label: 'Dépenses', short: 'Dépenses', icon: Receipt },
  { to: '/app/rapport', label: 'Rapport AG', short: 'Rapport', icon: FileText },
]

const MOBILE_NAV = NAV.filter((n) => n.to !== '/app/campagnes' && n.to !== '/app/rapport')

/** Show the renewal warning this many days before the cut-off. */
const WARN_DAYS = 7

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-navy-50 px-4">
      <Loader2 className="size-7 animate-spin text-brand-600" />
      <p className="text-sm font-semibold text-navy-600">{label}</p>
    </div>
  )
}

/**
 * Premier accès sur un appareil, sans réseau : il n'existe ni miroir local ni
 * moyen d'en constituer un. C'est le seul cas où l'application ne peut vraiment
 * rien afficher.
 */
function LedgerError() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-navy-50 px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
        <CloudOff className="size-6" />
      </span>
      <div>
        <h1 className="text-lg font-extrabold text-navy-900">Données indisponibles</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-navy-600">
          Vos données n'ont pas encore été téléchargées sur cet appareil. Connectez-vous à Internet
          une première fois, puis rouvrez l'application — elle fonctionnera ensuite hors ligne.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        Réessayer
      </button>
    </div>
  )
}

export function Layout() {
  const { db, role, status } = useStore()
  const { account, session, lockTreasurer, ready } = usePlatform()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const toast = useToast()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // ---- Guards. Order matters: identify, then check the subscription, then data.
  if (!ready) return <FullPageSpinner label="Ouverture de votre espace…" />
  if (!session || !account) return <Navigate to="/connexion" replace />
  if (!hasAccess(account)) return <Navigate to="/acces-expire" replace />

  // Le grand livre vient désormais d'IndexedDB puis du serveur : il faut un
  // état d'attente là où la lecture de localStorage était instantanée.
  if (status === 'loading') return <FullPageSpinner label="Chargement des données…" />
  if (status === 'error') return <LedgerError />
  if (!db) return <Navigate to="/connexion" replace />

  const isViewer = role === 'viewer'
  const daysLeft = joursRestants(account.date_expiration_acces)

  function handleRoleButton() {
    if (isViewer) {
      setUnlockOpen(true)
      return
    }
    lockTreasurer()
    toast.toast('Mode Président / Secrétaire — lecture seule', 'info')
  }

  // The sign-out itself happens on /deconnexion: see that route for why the
  // session must not be cleared while this Layout is still mounted.
  function handleLogout() {
    navigate('/deconnexion', { replace: true })
  }

  return (
    <div className="min-h-dvh">
      {/* ---------------------------------------------------------- Top bar */}
      <header className="no-print sticky top-0 z-40 border-b border-navy-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <NavLink to="/app" className="flex min-w-0 items-center gap-2.5">
            {db.association.logo ? (
              <img
                src={db.association.logo}
                alt=""
                className="size-9 shrink-0 rounded-xl border border-navy-200 bg-white object-contain"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                <BarChart3 className="size-5" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight font-extrabold text-navy-900">
                {db.association.acronym || db.association.name}
              </span>
              <span className="hidden truncate text-xs text-navy-500 sm:block">
                {db.association.name}
              </span>
            </span>
          </NavLink>

          <nav className="mx-auto hidden items-center gap-0.5 lg:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-navy-600 hover:bg-navy-100 hover:text-navy-900',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <SyncBadge />

            <button
              onClick={handleRoleButton}
              title={isViewer ? 'Passer en mode Trésorier' : 'Revenir en lecture seule'}
              className={cx(
                'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition sm:px-3',
                isViewer
                  ? 'border-navy-300 bg-navy-100 text-navy-700 hover:bg-navy-200'
                  : 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100',
              )}
            >
              {isViewer ? <Eye className="size-4" /> : <ShieldCheck className="size-4" />}
              <span className="hidden sm:inline">
                {isViewer ? 'Président / Secrétaire' : 'Trésorier'}
              </span>
              <span className="sm:hidden">{isViewer ? 'Lecture' : 'Trésorier'}</span>
            </button>

            <NavLink
              to="/app/parametres"
              className={({ isActive }) =>
                cx(
                  'flex size-9 items-center justify-center rounded-lg transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-navy-500 hover:bg-navy-100 hover:text-navy-900',
                )
              }
              aria-label="Paramètres"
            >
              <Settings className="size-5" />
            </NavLink>

            <button
              onClick={handleLogout}
              className="flex size-9 items-center justify-center rounded-lg text-navy-500 transition hover:bg-red-50 hover:text-red-600"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>

        {daysLeft <= WARN_DAYS && (
          <div className="flex items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-800 sm:px-6">
            <CalendarClock className="size-3.5 shrink-0" />
            {daysLeft === 0
              ? "Votre accès expire aujourd'hui — pensez à renouveler l'abonnement."
              : `Votre accès expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} — pensez à renouveler l'abonnement.`}
          </div>
        )}

        {isViewer && (
          <div className="border-t border-navy-200 bg-navy-900 px-3 py-1.5 text-center text-xs font-semibold text-navy-100 sm:px-6">
            Mode consultation — les actions de modification sont masquées.
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------ Pages */}
      <main className="mx-auto max-w-7xl px-3 pt-4 pb-24 sm:px-6 sm:pb-10">
        <Outlet />

        {/* Vendor signature. no-print keeps it off the A4 AG report, which
            carries the association's own letterhead, not ours. */}
        <p className="no-print mt-8 flex items-center justify-center gap-2 text-[11px] text-navy-400">
          <img
            src="/brand/zansotech-mark.png"
            alt=""
            width={360}
            height={162}
            className="h-4 w-auto"
            aria-hidden
          />
          Propulsé par ZansoTech
        </p>
      </main>

      {/* ------------------------------------------------- Bottom nav (mobile) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-navy-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_NAV.map(({ to, short, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition',
                  isActive ? 'text-brand-700' : 'text-navy-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'flex h-7 w-12 items-center justify-center rounded-full transition',
                      isActive && 'bg-brand-50',
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {short}
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-navy-500"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <HandCoins className="size-5" />
            </span>
            Plus
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Plus">
        <div className="grid gap-2">
          {[
            NAV.find((n) => n.to === '/app/campagnes')!,
            NAV.find((n) => n.to === '/app/rapport')!,
            { to: '/app/parametres', label: 'Paramètres', short: '', icon: Settings },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-xl border border-navy-200 px-4 py-3.5 font-semibold text-navy-800 transition hover:bg-navy-50"
            >
              <Icon className="size-5 text-brand-600" />
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/contact"
            onClick={() => setMoreOpen(false)}
            className="flex items-center gap-3 rounded-xl border border-navy-200 px-4 py-3.5 font-semibold text-navy-800 transition hover:bg-navy-50"
          >
            <LifeBuoy className="size-5 text-brand-600" />
            Nous contacter
          </NavLink>
          <button
            onClick={() => {
              setMoreOpen(false)
              handleLogout()
            }}
            className="flex items-center gap-3 rounded-xl border border-red-200 px-4 py-3.5 text-left font-semibold text-red-700 transition hover:bg-red-50"
          >
            <LogOut className="size-5" />
            Se déconnecter
          </button>
        </div>
      </Modal>

      <TreasurerUnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </div>
  )
}
