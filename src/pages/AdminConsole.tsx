import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarClock,
  CheckCircle2,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Pencil,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { usePlatform } from '@/lib/platform'
import { useToast } from '@/components/Toast'
import type { AssociationAccount, SubscriptionStatus } from '@/lib/types'
import { SUBSCRIPTION_STATUSES } from '@/lib/types'
import { effectiveStatus, extendedExpiry, joursRestants, statusLabel } from '@/lib/subscription'
import { noticeKindFor, subscriptionNotice } from '@/lib/notices'
import { formatDate, todayISO, waLink } from '@/lib/format'
import { passwordProblem } from '@/lib/auth'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PasswordInput,
  Select,
  cx,
} from '@/components/ui'

export function AdminConsole() {
  const { isAdmin } = usePlatform()
  return isAdmin ? <Console /> : <AdminGate />
}

/* ------------------------------------------------------------------- Gate */

function AdminGate() {
  const { adminExists, adminSetup, adminLogin } = usePlatform()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')

    if (!adminExists) {
      const problem = passwordProblem(password)
      if (problem) return setError(problem)
      if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.')
      setBusy(true)
      await adminSetup(password)
      setBusy(false)
      toast.success('Console plateforme initialisée')
      return
    }

    setBusy(true)
    const ok = await adminLogin(password)
    setBusy(false)
    if (!ok) {
      setError('Mot de passe incorrect.')
      setPassword('')
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-navy-700 bg-navy-800 p-6 shadow-2xl sm:p-8">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ShieldAlert className="size-6" />
          </span>
          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-white">
            Console Plateforme
          </h1>
          <p className="mt-1.5 text-sm text-navy-300">
            {adminExists
              ? 'Espace réservé à l’administrateur de la plateforme.'
              : 'Premier accès : définissez votre mot de passe administrateur.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-navy-200">
                {adminExists ? 'Mot de passe' : 'Nouveau mot de passe'}
              </span>
              <PasswordInput
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                placeholder="••••••••"
                autoComplete={adminExists ? 'current-password' : 'new-password'}
                autoFocus
              />
            </label>

            {!adminExists && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-navy-200">
                  Confirmer le mot de passe
                </span>
                <PasswordInput
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                    setError('')
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </label>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-xl bg-red-500/15 px-3.5 py-3 text-sm font-medium text-red-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <Button type="submit" full disabled={busy || !password}>
              <LockKeyhole className="size-4" />
              {busy ? 'Vérification…' : adminExists ? 'Se connecter' : 'Définir et continuer'}
            </Button>
          </form>

          {!adminExists && (
            <p className="mt-4 rounded-xl bg-navy-900/60 px-3.5 py-3 text-xs leading-relaxed text-navy-300">
              Ce mot de passe est stocké uniquement sur cet appareil. Notez-le : il n'existe aucune
              procédure de récupération.
            </p>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-navy-400">
          <Link to="/" className="font-semibold hover:text-white hover:underline">
            Retour au site
          </Link>
        </p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Console */

type SortKey = 'nom' | 'statut' | 'expiration' | 'jours' | 'creation'
type StatusFilter = SubscriptionStatus | 'tous' | 'bientot'

const STATUS_TONE: Record<SubscriptionStatus, 'brand' | 'amber' | 'red' | 'navy'> = {
  actif: 'brand',
  essai: 'navy',
  suspendu: 'amber',
  expire: 'red',
}

/** Warn this many days ahead so there is time to send a payment link. */
const SOON_DAYS = 7

function Console() {
  const { comptes, contact, adminLogout, updateAccount, deleteAccount } = usePlatform()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('tous')
  const [sort, setSort] = useState<SortKey>('jours')
  const [asc, setAsc] = useState(true)
  const [editing, setEditing] = useState<AssociationAccount | null>(null)
  const [removing, setRemoving] = useState<AssociationAccount | null>(null)
  const [contactOpen, setContactOpen] = useState(false)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = comptes.filter((c) => {
      const eff = effectiveStatus(c)
      const left = joursRestants(c.date_expiration_acces)
      if (status === 'bientot' && !(left >= 0 && left <= SOON_DAYS)) return false
      if (status !== 'tous' && status !== 'bientot' && eff !== status) return false
      if (!needle) return true
      return [c.nom, c.sigle, c.responsable, c.telephone, c.ville, c.email]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })

    const direction = asc ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'nom':
          return a.nom.localeCompare(b.nom, 'fr') * direction
        case 'statut':
          return effectiveStatus(a).localeCompare(effectiveStatus(b), 'fr') * direction
        case 'creation':
          return a.date_creation.localeCompare(b.date_creation) * direction
        case 'expiration':
          return a.date_expiration_acces.localeCompare(b.date_expiration_acces) * direction
        default:
          return (
            (joursRestants(a.date_expiration_acces) - joursRestants(b.date_expiration_acces)) *
            direction
          )
      }
    })
  }, [comptes, query, status, sort, asc])

  const stats = useMemo(() => {
    let actifs = 0
    let bientot = 0
    let bloques = 0
    for (const c of comptes) {
      const eff = effectiveStatus(c)
      const left = joursRestants(c.date_expiration_acces)
      if (eff === 'expire' || eff === 'suspendu') bloques++
      else {
        actifs++
        if (left <= SOON_DAYS) bientot++
      }
    }
    return { total: comptes.length, actifs, bientot, bloques }
  }, [comptes])

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((v) => !v)
    else {
      setSort(key)
      setAsc(true)
    }
  }

  /** One-tap renewal: mark paid and push the date out from today. */
  function renew(account: AssociationAccount, months: number) {
    updateAccount(account.id, {
      statut_abonnement: 'actif',
      date_expiration_acces: extendedExpiry(account.date_expiration_acces, months),
    })
    toast.success(`${account.sigle || account.nom} — accès prolongé de ${months} mois`)
  }

  return (
    <div className="min-h-dvh bg-navy-50">
      <header className="sticky top-0 z-30 border-b border-navy-700 bg-navy-900">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ShieldAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-extrabold text-white">
              Console Plateforme
            </p>
            <p className="hidden text-xs text-navy-400 sm:block">Gestion des abonnements</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-navy-600 bg-transparent text-navy-100 hover:bg-navy-800"
              onClick={() => setContactOpen(true)}
            >
              <MessageCircle className="size-4" />
              <span className="hidden sm:inline">Contact affiché</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-navy-600 bg-transparent text-navy-100 hover:bg-navy-800"
              onClick={() => {
                adminLogout()
                toast.toast('Déconnecté de la console', 'info')
              }}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6">
        {/* ------------------------------------------------------- Key stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Associations', value: stats.total, icon: Building2, tone: 'text-navy-900' },
            { label: 'Accès actifs', value: stats.actifs, icon: CheckCircle2, tone: 'text-brand-700' },
            {
              label: `Expire sous ${SOON_DAYS} j`,
              value: stats.bientot,
              icon: CalendarClock,
              tone: 'text-amber-700',
            },
            { label: 'Bloquées', value: stats.bloques, icon: LockKeyhole, tone: 'text-red-600' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <Card key={label} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-navy-500">{label}</p>
                <Icon className="size-4 text-navy-400" />
              </div>
              <p className={cx('tnum mt-1 text-2xl font-extrabold', tone)}>{value}</p>
            </Card>
          ))}
        </div>

        {/* ---------------------------------------------------------- Filters */}
        <Card className="mt-4">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-navy-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une association, un responsable, un téléphone…"
                className="pl-10"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="sm:w-56"
            >
              <option value="tous">Tous les statuts</option>
              <option value="bientot">Expire sous {SOON_DAYS} jours</option>
              {SUBSCRIPTION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Building2 className="size-6" />}
              title={comptes.length ? 'Aucun résultat' : 'Aucune association'}
              description={
                comptes.length
                  ? 'Aucune association ne correspond à cette recherche ou à ce filtre.'
                  : "Les associations apparaissent ici dès qu'elles sont créées depuis la page d'accueil."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] text-sm">
                <thead>
                  <tr className="border-y border-navy-100 bg-navy-50/60 text-left text-xs font-bold text-navy-500">
                    <SortableTh
                      label="Association"
                      active={sort === 'nom'}
                      asc={asc}
                      onClick={() => toggleSort('nom')}
                    />
                    <th className="px-3 py-2.5">Responsable</th>
                    <SortableTh
                      label="Statut"
                      active={sort === 'statut'}
                      asc={asc}
                      onClick={() => toggleSort('statut')}
                    />
                    <SortableTh
                      label="Expiration"
                      active={sort === 'expiration'}
                      asc={asc}
                      onClick={() => toggleSort('expiration')}
                    />
                    <SortableTh
                      label="Jours restants"
                      active={sort === 'jours'}
                      asc={asc}
                      onClick={() => toggleSort('jours')}
                    />
                    <th className="px-3 py-2.5 text-right">Renouveler</th>
                    <th className="w-20 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {rows.map((account) => {
                    const eff = effectiveStatus(account)
                    const left = joursRestants(account.date_expiration_acces)
                    const blocked = eff === 'expire' || eff === 'suspendu'
                    return (
                      <tr key={account.id} className="align-middle hover:bg-navy-50/60">
                        <td className="px-3 py-2.5">
                          <p className="font-bold text-navy-900">{account.nom}</p>
                          <p className="text-xs text-navy-500">
                            {[account.sigle, account.ville].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-navy-800">{account.responsable || '—'}</p>
                          {account.telephone && (
                            <a
                              href={waLink(
                                account.dialCode,
                                account.telephone,
                                `Bonjour, au sujet de l'abonnement AssoCaisse de ${account.nom}.`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="tnum text-xs font-semibold text-brand-700 hover:underline"
                            >
                              +{account.dialCode} {account.telephone}
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={STATUS_TONE[eff]}>{statusLabel(eff)}</Badge>
                        </td>
                        <td className="tnum px-3 py-2.5 font-medium text-navy-700">
                          {formatDate(account.date_expiration_acces)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cx(
                              'tnum font-bold',
                              blocked
                                ? 'text-red-600'
                                : left <= SOON_DAYS
                                  ? 'text-amber-600'
                                  : 'text-navy-700',
                            )}
                          >
                            {left < 0 ? `${Math.abs(left)} j de retard` : `${left} j`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            {[1, 3, 12].map((months) => (
                              <button
                                key={months}
                                onClick={() => renew(account, months)}
                                className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700 transition hover:bg-brand-100"
                                title={`Marquer payé et prolonger de ${months} mois`}
                              >
                                +{months}m
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            <a
                              href={waLink(
                                account.dialCode,
                                account.telephone,
                                subscriptionNotice(account, contact),
                              )}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                if (!account.telephone.trim()) {
                                  e.preventDefault()
                                  toast.error(
                                    `Aucun numéro enregistré pour ${account.nom} — ajoutez-le d'abord.`,
                                  )
                                }
                              }}
                              className={cx(
                                'rounded-lg p-1.5 transition',
                                account.telephone.trim()
                                  ? 'text-brand-600 hover:bg-brand-50'
                                  : 'text-navy-300 hover:bg-navy-100',
                              )}
                              aria-label={`Envoyer l'avis ${
                                noticeKindFor(account) === 'essai' ? 'de fin d’essai' : 'de résiliation'
                              } à ${account.nom}`}
                              title={
                                noticeKindFor(account) === 'essai'
                                  ? "Avis de fin de période d'essai (WhatsApp)"
                                  : "Avis de résiliation d'abonnement (WhatsApp)"
                              }
                            >
                              <Send className="size-4" />
                            </a>
                            <button
                              onClick={() => setEditing(account)}
                              className="rounded-lg p-1.5 text-navy-500 transition hover:bg-navy-100 hover:text-navy-900"
                              aria-label={`Modifier ${account.nom}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              onClick={() => setRemoving(account)}
                              className="rounded-lg p-1.5 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label={`Supprimer ${account.nom}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="mt-4 text-xs leading-relaxed text-navy-500">
          Le règlement se fait hors application (Orange Money, Moov Money, Wave). Après réception,
          prolongez l'accès ici — l'association retrouve son espace immédiatement.
        </p>
      </main>

      {editing && (
        <EditAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateAccount(editing.id, patch)
            setEditing(null)
            toast.success('Abonnement mis à jour')
          }}
        />
      )}

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Supprimer cette association ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!removing) return
                deleteAccount(removing.id)
                toast.toast(`${removing.nom} supprimée`, 'info')
                setRemoving(null)
              }}
            >
              <Trash2 className="size-4" />
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-navy-600">
          <strong className="text-navy-900">{removing?.nom}</strong> ainsi que ses membres,
          cotisations, campagnes, dépenses et justificatifs seront définitivement effacés de cet
          appareil. Cette action est irréversible.
        </p>
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
          Pour couper l'accès sans perdre les données, passez plutôt le statut à «&nbsp;Suspendu&nbsp;».
        </p>
      </Modal>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}

/* ------------------------------------------------------------ Sub-components */

function SortableTh({
  label,
  active,
  asc,
  onClick,
}: {
  label: string
  active: boolean
  asc: boolean
  onClick: () => void
}) {
  return (
    <th className="px-3 py-2.5">
      <button
        onClick={onClick}
        className={cx(
          'flex items-center gap-1 font-bold transition hover:text-navy-900',
          active && 'text-navy-900',
        )}
      >
        {label}
        {active &&
          (asc ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
      </button>
    </th>
  )
}

function EditAccountModal({
  account,
  onClose,
  onSave,
}: {
  account: AssociationAccount
  onClose: () => void
  onSave: (patch: Partial<AssociationAccount>) => void
}) {
  const [statut, setStatut] = useState<SubscriptionStatus>(account.statut_abonnement)
  const [expiration, setExpiration] = useState(account.date_expiration_acces)
  const [responsable, setResponsable] = useState(account.responsable)
  const [dialCode, setDialCode] = useState(account.dialCode)
  const [telephone, setTelephone] = useState(account.telephone)
  const [notes, setNotes] = useState(account.notes)

  const left = joursRestants(expiration)

  return (
    <Modal
      open
      onClose={onClose}
      title={account.nom}
      subtitle={`Créée le ${formatDate(account.date_creation)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() =>
              onSave({
                statut_abonnement: statut,
                date_expiration_acces: expiration,
                responsable,
                dialCode,
                telephone,
                notes,
              })
            }
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Statut d'abonnement">
            <Select
              value={statut}
              onChange={(e) => setStatut(e.target.value as SubscriptionStatus)}
            >
              {SUBSCRIPTION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Expiration de l'accès"
            hint={left < 0 ? `Expiré depuis ${Math.abs(left)} jour(s)` : `${left} jour(s) restants`}
          >
            <Input
              type="date"
              value={expiration}
              min="2020-01-01"
              onChange={(e) => setExpiration(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {[1, 3, 6, 12].map((months) => (
            <button
              key={months}
              onClick={() => {
                setExpiration(extendedExpiry(expiration, months))
                setStatut('actif')
              }}
              className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100"
            >
              + {months} mois
            </button>
          ))}
          <button
            onClick={() => {
              setExpiration(todayISO())
              setStatut('expire')
            }}
            className="rounded-lg border border-navy-300 px-3 py-1.5 text-xs font-bold text-navy-600 transition hover:bg-navy-50"
          >
            Couper l'accès
          </button>
        </div>

        <Field label="Responsable">
          <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
        </Field>

        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Indicatif">
            <Input
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </Field>
          <Field label="Téléphone">
            <Input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              inputMode="tel"
            />
          </Field>
        </div>

        <Field label="Notes internes" hint="Référence de paiement, historique — visible ici seulement.">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { contact, updateContact, adminSetup } = usePlatform()
  const toast = useToast()
  const [nom, setNom] = useState(contact.nom)
  const [dialCode, setDialCode] = useState(contact.dialCode)
  const [telephone, setTelephone] = useState(contact.telephone)
  const [email, setEmail] = useState(contact.email)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')

  async function save() {
    if (newPassword) {
      const problem = passwordProblem(newPassword)
      if (problem) return setError(problem)
      await adminSetup(newPassword)
    }
    updateContact({ nom, dialCode, telephone, email })
    toast.success('Paramètres de la plateforme enregistrés')
    setNewPassword('')
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paramètres de la plateforme"
      subtitle="Coordonnées affichées aux associations dont l'accès est coupé"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save}>Enregistrer</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nom affiché" hint="« Accès expiré — contactez … »">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Indicatif">
            <Input
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </Field>
          <Field label="Téléphone / WhatsApp">
            <Input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              inputMode="tel"
              placeholder="70 12 45 89"
            />
          </Field>
        </div>
        <Field
          label="Adresse e-mail"
          hint="Affichée sur la page « Nous contacter » et l'écran d'accès expiré."
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@assocaisse.bf"
          />
        </Field>
        <Field
          label="Nouveau mot de passe administrateur"
          hint="Laissez vide pour conserver le mot de passe actuel."
          error={error || undefined}
        >
          <PasswordInput
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              setError('')
            }}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </Field>
      </div>
    </Modal>
  )
}
