import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Eye,
  FileText,
  HandCoins,
  LayoutGrid,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { Modal, cx } from './ui'
import { useToast } from './Toast'

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

export function Layout() {
  const { db, role, setRole } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!db) navigate('/', { replace: true })
  }, [db, navigate])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  if (!db) return null // the effect above bounces to the landing page

  const isViewer = role === 'viewer'

  function toggleRole() {
    const next = isViewer ? 'treasurer' : 'viewer'
    setRole(next)
    toast.toast(
      next === 'treasurer'
        ? 'Mode Trésorier — accès complet en écriture'
        : 'Mode Président / Secrétaire — lecture seule',
      'info',
    )
  }

  return (
    <div className="min-h-dvh">
      {/* ---------------------------------------------------------- Top bar */}
      <header className="no-print sticky top-0 z-40 border-b border-navy-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <NavLink to="/app" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <BarChart3 className="size-5" />
            </span>
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
            <button
              onClick={toggleRole}
              title="Changer de rôle"
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
          </div>
        </div>

        {isViewer && (
          <div className="border-t border-navy-200 bg-navy-900 px-3 py-1.5 text-center text-xs font-semibold text-navy-100 sm:px-6">
            Mode consultation — les actions de modification sont masquées.
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------ Pages */}
      <main className="mx-auto max-w-7xl px-3 pt-4 pb-24 sm:px-6 sm:pb-10">
        <Outlet />
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
        </div>
      </Modal>
    </div>
  )
}
