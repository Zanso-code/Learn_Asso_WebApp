import { Check, CloudOff, RefreshCw, TriangleAlert, UploadCloud } from 'lucide-react'
import { useSync } from '@/lib/sync/status'
import { cx } from './ui'

/**
 * Etat de la synchronisation, dans l'en-tete.
 *
 * Un tresorier qui encaisse vingt cotisations en reunion, sans reseau, a besoin
 * de voir que rien n'est perdu — c'est la contrepartie indispensable du travail
 * hors ligne. Le compteur d'operations en attente est donc affiche en clair, et
 * le badge reste cliquable pour forcer un envoi.
 */
export function SyncBadge({ className }: { className?: string }) {
  const { phase, pending, syncNow } = useSync()

  const state = describe(phase, pending)

  return (
    <button
      onClick={syncNow}
      title={state.title}
      aria-label={state.title}
      className={cx(
        'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition',
        state.tone,
        className,
      )}
    >
      <state.Icon className={cx('size-4 shrink-0', phase === 'syncing' && 'animate-spin')} />
      <span className="hidden sm:inline">{state.label}</span>
      {pending > 0 && <span className="sm:hidden">{pending}</span>}
    </button>
  )
}

function describe(phase: string, pending: number) {
  // L'attente prime sur tout le reste : c'est la seule information qui engage
  // les donnees de l'utilisateur.
  if (pending > 0 && phase !== 'syncing') {
    return {
      Icon: UploadCloud,
      label: `${pending} en attente`,
      title:
        phase === 'offline'
          ? `${pending} modification(s) enregistrée(s) sur cet appareil, en attente de réseau.`
          : `${pending} modification(s) en attente d'envoi. Cliquez pour réessayer.`,
      tone: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
    }
  }

  switch (phase) {
    case 'syncing':
      return {
        Icon: RefreshCw,
        label: 'Synchronisation…',
        title: 'Échange en cours avec le serveur',
        tone: 'border-navy-300 bg-navy-100 text-navy-700',
      }
    case 'offline':
      return {
        Icon: CloudOff,
        label: 'Hors ligne',
        title: 'Aucun réseau. Vos saisies sont enregistrées et partiront au retour de la connexion.',
        tone: 'border-navy-300 bg-navy-100 text-navy-600 hover:bg-navy-200',
      }
    case 'error':
      return {
        Icon: TriangleAlert,
        label: 'Erreur',
        title: 'La synchronisation a échoué. Cliquez pour réessayer.',
        tone: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
      }
    default:
      return {
        Icon: Check,
        label: 'Synchronisé',
        title: 'Tout est enregistré sur le serveur. Cliquez pour vérifier maintenant.',
        tone: 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100',
      }
  }
}
