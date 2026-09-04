import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  KeyRound,
  LifeBuoy,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react'
import { useDB } from '@/lib/store'
import { usePlatform } from '@/lib/platform'
import { useToast } from '@/components/Toast'
import { TreasurerUnlockModal } from '@/components/TreasurerUnlock'
import { LogoPicker } from '@/components/LogoPicker'
import { totals } from '@/lib/selectors'
import { formatDate, formatXOF, periodLabel } from '@/lib/format'
import { passwordProblem } from '@/lib/auth'
import { pendingCount } from '@/lib/sync/outbox'
import { LIMITS } from '@/lib/limits'
import { ExcelImportError, describeImport, exportWorkbook, importWorkbook } from '@/lib/excel'
import { effectiveStatus, joursRestants, statusLabel } from '@/lib/subscription'
import type { DB } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  CommitInput,
  CardHeader,
  Field,
  Modal,
  PageHeader,
  PasswordInput,
  Select,
  cx,
} from '@/components/ui'

export function SettingsPage() {
  const store = useDB()
  const { db, role, isTreasurer } = store
  const {
    account,
    lockTreasurer,
    changeTreasurerPassword,
    changeAccountPassword,
    purgeDevice,
    treasurerIdentityLegacy,
    rotateTreasurerIdentity,
  } = usePlatform()
  const toast = useToast()
  const navigate = useNavigate()

  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)

  // Compté à l'ouverture du dialogue : ce nombre décide du ton de
  // l'avertissement, entre « hygiène sur appareil partagé » et « vous êtes sur
  // le point de jeter des versements ».
  const [pendingOps, setPendingOps] = useState(0)
  useEffect(() => {
    if (!confirmPurge || !store.associationId) return
    void pendingCount(store.associationId)
      .then(setPendingOps)
      .catch(() => setPendingOps(0))
  }, [confirmPurge, store.associationId])
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [passwordModal, setPasswordModal] = useState<'tresorier' | 'compte' | null>(null)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<DB | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const t = totals(db)
  const a = db.association

  function exportJSON() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${a.acronym || 'association'}-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Sauvegarde JSON téléchargée')
  }

  async function exportExcel() {
    setBusy(true)
    try {
      await exportWorkbook(db)
      toast.success('Sauvegarde Excel téléchargée')
    } catch (err) {
      console.error(err)
      toast.error("Export impossible. Réessayez depuis un navigateur à jour.")
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      setPendingImport(await importWorkbook(file, db))
    } catch (err) {
      // A rejected spreadsheet is expected user input, not a defect — the toast
      // already explains it. Only genuine faults deserve console.error.
      if (err instanceof ExcelImportError) {
        toast.error(err.message)
      } else {
        console.error(err)
        toast.error('Fichier illisible ou format inattendu.')
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = '' // allow re-picking the same file
    }
  }

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Association, accès, rôles et sauvegardes" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------ Identity */}
        <Card>
          <CardHeader
            title="Identité de l'association"
            subtitle="Repris dans l'en-tête et le rapport d'AG"
          />
          <div className="grid gap-4 p-4">
            <Field label="Logo de l'association" hint="Apparaît dans l'en-tête et sur le rapport d'AG.">
              <LogoPicker
                value={a.logo}
                onChange={(logo) => store.updateAssociation({ logo })}
                disabled={!isTreasurer}
              />
            </Field>

            <Field label="Nom complet">
              <CommitInput
                value={a.name}
                onCommit={(next) => store.updateAssociation({ name: next })}
                maxLength={LIMITS.associationNom}
                disabled={!isTreasurer}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sigle">
                <CommitInput
                  value={a.acronym}
                  onCommit={(next) => store.updateAssociation({ acronym: next })}
                  maxLength={LIMITS.associationSigle}
                  disabled={!isTreasurer}
                />
              </Field>
              <Field label="Ville">
                <CommitInput
                  value={a.city}
                  onCommit={(next) => store.updateAssociation({ city: next })}
                  maxLength={LIMITS.associationVille}
                  placeholder="Ouagadougou"
                  disabled={!isTreasurer}
                />
              </Field>
            </div>
            <Field label="Pays">
              <Select
                value={a.country}
                onChange={(e) => store.updateAssociation({ country: e.target.value })}
                disabled={!isTreasurer}
              >
                {[
                  'Burkina Faso',
                  "Côte d'Ivoire",
                  'Mali',
                  'Sénégal',
                  'Niger',
                  'Togo',
                  'Bénin',
                  'Guinée',
                  'Autre',
                ].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trésorier Général">
                <CommitInput
                  value={a.treasurerName}
                  onCommit={(next) => store.updateAssociation({ treasurerName: next })}
                  maxLength={LIMITS.associationTreasurerName}
                  disabled={!isTreasurer}
                />
              </Field>
              <Field label="Président">
                <CommitInput
                  value={a.presidentName}
                  onCommit={(next) => store.updateAssociation({ presidentName: next })}
                  maxLength={LIMITS.associationPresidentName}
                  disabled={!isTreasurer}
                />
              </Field>
            </div>
            <Field
              label="Début du suivi des cotisations"
              hint={`Les cotisations sont comptées à partir de ${periodLabel(a.fiscalStart)}.`}
            >
              <CommitInput
                type="month"
                value={a.fiscalStart}
                onCommit={(next) => store.updateAssociation({ fiscalStart: next })}
                disabled={!isTreasurer}
              />
            </Field>
          </div>
        </Card>

        <div className="grid content-start gap-4">
          {/* --------------------------------------------------- Abonnement */}
          {account && (
            <Card>
              <CardHeader title="Abonnement" subtitle="Géré par votre fournisseur AssoCaisse" />
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <div className="rounded-lg bg-navy-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-navy-500">Statut</p>
                  <Badge
                    tone={
                      effectiveStatus(account) === 'actif'
                        ? 'brand'
                        : effectiveStatus(account) === 'essai'
                          ? 'navy'
                          : 'amber'
                    }
                    className="mt-1"
                  >
                    {statusLabel(effectiveStatus(account))}
                  </Badge>
                </div>
                <div className="rounded-lg bg-navy-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-navy-500">Expire le</p>
                  <p className="tnum text-sm font-bold text-navy-900">
                    {formatDate(account.date_expiration_acces)}
                  </p>
                </div>
                <div className="rounded-lg bg-navy-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-navy-500">Jours restants</p>
                  <p className="tnum flex items-center gap-1 text-sm font-bold text-navy-900">
                    <CalendarClock className="size-3.5 text-navy-400" />
                    {Math.max(0, joursRestants(account.date_expiration_acces))}
                  </p>
                </div>
              </div>
              <div className="px-4 pb-4">
                <Link
                  to="/contact"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-navy-300 bg-white px-4 text-sm font-semibold text-navy-800 transition hover:bg-navy-50"
                >
                  <LifeBuoy className="size-4" />
                  Renouveler / nous contacter
                </Link>
              </div>
            </Card>
          )}

          {/* ------------------------------------------------------- Roles */}
          <Card>
            <CardHeader
              title="Rôle actif"
              subtitle="Le rôle Trésorier est protégé par son propre mot de passe"
            />
            <div className="grid gap-2.5 p-4">
              <button
                onClick={() => {
                  if (isTreasurer) setPasswordModal('tresorier')
                  else setUnlockOpen(true)
                }}
                className={cx(
                  'flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition',
                  isTreasurer ? 'border-brand-500 bg-brand-50' : 'border-navy-200 hover:bg-navy-50',
                )}
              >
                <ShieldCheck
                  className={cx(
                    'mt-0.5 size-5 shrink-0',
                    isTreasurer ? 'text-brand-600' : 'text-navy-400',
                  )}
                />
                <span>
                  <span className="block text-sm font-bold text-navy-900">
                    Trésorier (Administrateur)
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-navy-600">
                    {isTreasurer
                      ? 'Actif. Touchez pour modifier le mot de passe Trésorier.'
                      : 'Accès complet : membres, cotisations, campagnes, dépenses. Touchez pour saisir le mot de passe.'}
                  </span>
                </span>
              </button>

              <button
                onClick={() => {
                  if (!isTreasurer) return
                  lockTreasurer()
                  toast.toast('Rôle actif : Président / Secrétaire', 'info')
                }}
                className={cx(
                  'flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition',
                  role === 'viewer'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-navy-200 hover:bg-navy-50',
                )}
              >
                <Eye
                  className={cx(
                    'mt-0.5 size-5 shrink-0',
                    role === 'viewer' ? 'text-brand-600' : 'text-navy-400',
                  )}
                />
                <span>
                  <span className="block text-sm font-bold text-navy-900">
                    Président / Secrétaire
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-navy-600">
                    Lecture seule : tableaux de bord, relevés et rapports, sans boutons de
                    modification.
                  </span>
                </span>
              </button>

              {isTreasurer && (
                <Button variant="outline" onClick={() => setPasswordModal('compte')}>
                  <KeyRound className="size-4" />
                  Modifier le mot de passe du compte
                </Button>
              )}

              {/* Ne s'affiche que pour les associations restées sur l'ancienne
                  adresse Trésorier, et disparaît définitivement une fois le
                  renouvellement fait — d'où la place en bas de carte plutôt
                  qu'un réglage permanent. */}
              {isTreasurer && treasurerIdentityLegacy && (
                <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <p className="text-sm font-bold text-amber-900">
                    Identité Trésorier à renouveler
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    Le rôle Trésorier de cette association repose encore sur une adresse technique
                    créée avant le renforcement de la sécurité. Le renouvellement en met une
                    nouvelle en place, avec un nouveau mot de passe Trésorier. À faire une fois,
                    connecté à Internet.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => setRotateOpen(true)}
                  >
                    <RefreshCw className="size-4" />
                    Renouveler l'identité Trésorier
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* -------------------------------------------------------- Data */}
          <Card>
            <CardHeader title="Données locales" subtitle="Stockées sur cet appareil uniquement" />
            <div className="p-4">
              <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Membres', String(db.members.length)],
                  ['Versements', String(db.duePayments.length)],
                  ['Campagnes', String(db.campaigns.length)],
                  ['Dépenses', String(db.expenses.length)],
                  ['Recettes', formatXOF(t.income)],
                  ['Trésorerie', formatXOF(t.balance)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-navy-50 px-3 py-2">
                    <dt className="text-[11px] font-semibold text-navy-500">{label}</dt>
                    <dd className="tnum text-sm font-bold text-navy-900">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="grid gap-2">
                <Button variant="outline" onClick={exportExcel} disabled={busy}>
                  <FileSpreadsheet className="size-4" />
                  Exporter la sauvegarde (Excel)
                </Button>

                {isTreasurer && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                    >
                      <Upload className="size-4" />
                      Importer une sauvegarde (Excel)
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(e) => void handleFile(e.target.files?.[0])}
                    />
                  </>
                )}

                <Button variant="outline" onClick={exportJSON}>
                  <Download className="size-4" />
                  Exporter une copie technique (JSON)
                </Button>

                {isTreasurer && (
                  <Button variant="danger" onClick={() => setConfirmReset(true)}>
                    <Trash2 className="size-4" />
                    Vider les données de l'association
                  </Button>
                )}

                {/* Ouvert aux deux rôles : effacer la copie locale n'écrit rien
                    sur le serveur, et c'est justement la personne qui rend un
                    téléphone emprunté qui en a besoin. */}
                <Button variant="outline" onClick={() => setConfirmPurge(true)}>
                  <Smartphone className="size-4" />
                  Effacer les données de cet appareil
                </Button>
              </div>

              <p className="mt-3 flex items-start gap-2 rounded-xl bg-navy-50 px-3.5 py-3 text-xs leading-relaxed text-navy-600">
                <Database className="mt-0.5 size-4 shrink-0 text-navy-400" />
                Vos données sont enregistrées sur nos serveurs et copiées sur cet appareil :
                l'application continue de fonctionner sans réseau, et tout ce que vous saisissez
                hors connexion repart automatiquement dès que la connexion revient. Changer de
                téléphone ne fait plus rien perdre — il suffit de vous reconnecter. Les photos de
                justificatifs ne sont pas incluses dans le fichier Excel.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* --------------------------------------------------------- Modals */}

      <TreasurerUnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />

      <ChangePasswordModal
        kind={passwordModal}
        onClose={() => setPasswordModal(null)}
        onSubmit={(current, next) =>
          passwordModal === 'compte'
            ? changeAccountPassword(current, next)
            : changeTreasurerPassword(current, next)
        }
      />

      <RotateIdentityModal
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        onSubmit={rotateTreasurerIdentity}
      />

      <Modal
        open={Boolean(pendingImport)}
        onClose={() => setPendingImport(null)}
        title="Restaurer cette sauvegarde ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingImport(null)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                if (!pendingImport) return
                store.replaceDB(pendingImport)
                setPendingImport(null)
                toast.success('Sauvegarde restaurée')
              }}
            >
              <RotateCcw className="size-4" />
              Restaurer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-navy-600">
          Le fichier contient&nbsp;:
          <span className="mt-2 block font-semibold text-navy-900">
            {pendingImport ? describeImport(pendingImport) : ''}
          </span>
        </p>
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
          Ces données <strong>remplacent intégralement</strong> le contenu actuel de l'association.
          Exportez d'abord une sauvegarde si vous souhaitez conserver l'état présent. Les photos de
          justificatifs ne sont restaurées que sur l'appareil où elles ont été prises.
        </p>
      </Modal>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Vider les données de l'association ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.resetLedger()
                setConfirmReset(false)
                toast.toast('Les données ont été effacées', 'info')
              }}
            >
              <Trash2 className="size-4" />
              Tout effacer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-navy-600">
          Membres, cotisations, campagnes, dépenses et justificatifs photographiés seront
          définitivement supprimés. Le compte de l'association et son abonnement sont conservés.
          Cette action est irréversible.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
          <Upload className="mt-0.5 size-4 shrink-0" />
          Exportez d'abord une sauvegarde Excel si vous souhaitez conserver l'historique.
        </div>
      </Modal>

      <Modal
        open={confirmPurge}
        onClose={() => setConfirmPurge(false)}
        title="Effacer les données de cet appareil ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPurge(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void purgeDevice().finally(() => {
                  setBusy(false)
                  setConfirmPurge(false)
                  navigate('/', { replace: true })
                })
              }}
            >
              <Smartphone className="size-4" />
              Effacer et se déconnecter
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-navy-600">
          La copie locale de <strong className="text-navy-900">{a.name || 'votre association'}</strong>{' '}
          — grand livre, photos de justificatifs, file d'attente — est supprimée de ce téléphone ou
          de cet ordinateur, et vous êtes déconnecté. <strong>Rien n'est effacé sur nos serveurs</strong> :
          une reconnexion retélécharge tout.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
          <Upload className="mt-0.5 size-4 shrink-0" />
          {pendingOps > 0 ? (
            <span>
              <strong>
                {pendingOps === 1
                  ? "1 opération n'a pas encore été envoyée au serveur et sera perdue."
                  : `${pendingOps} opérations n'ont pas encore été envoyées au serveur et seront perdues.`}
              </strong>{' '}
              Connectez-vous à Internet et attendez la fin de la synchronisation avant d'effacer.
            </span>
          ) : (
            <span>
              À utiliser avant de prêter ou de rendre cet appareil : sans cela, les données restent
              lisibles dans le navigateur même une fois déconnecté.
            </span>
          )}
        </p>
      </Modal>
    </>
  )
}

/* --------------------------------------------- Treasurer identity rotation */

/**
 * Renouvellement de l'identité Trésorier.
 *
 * Même formulaire qu'un changement de mot de passe, et c'est voulu : du point
 * de vue du trésorier, l'opération EST un changement de mot de passe. Le
 * remplacement du compte Auth sous-jacent ne le concerne pas — il n'a jamais vu
 * l'adresse technique, qui est dérivée et ne reçoit aucun courriel.
 *
 * Ce que le texte doit faire passer, en revanche, c'est l'irréversibilité :
 * l'ancien mot de passe Trésorier cesse de fonctionner sur TOUS les appareils,
 * y compris ceux qui étaient déverrouillés hors ligne.
 */
function RotateIdentityModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (current: string, next: string) => Promise<string | null>
}) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
    onClose()
  }

  async function submit() {
    const problem = passwordProblem(next)
    if (problem) return setError(problem)
    if (next !== confirm) return setError('Les deux nouveaux mots de passe ne correspondent pas.')
    setBusy(true)
    const failed = await onSubmit(current, next)
    setBusy(false)
    if (failed) {
      setError(failed)
      setCurrent('')
      return
    }
    toast.success('Identité Trésorier renouvelée')
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Renouveler l'identité Trésorier"
      subtitle="À faire une seule fois, connecté à Internet."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || !current || !next}>
            <RefreshCw className="size-4" />
            {busy ? 'Renouvellement…' : 'Renouveler'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Mot de passe Trésorier actuel">
          <PasswordInput
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value)
              setError('')
            }}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </Field>
        <Field label="Nouveau mot de passe Trésorier" error={error || undefined}>
          <PasswordInput
            value={next}
            onChange={(e) => {
              setNext(e.target.value)
              setError('')
            }}
            autoComplete="new-password"
            placeholder="Lettres et chiffres, 8 caractères minimum"
          />
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <PasswordInput
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setError('')
            }}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </Field>
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
        L'ancien mot de passe Trésorier cessera de fonctionner, <strong>sur tous les appareils</strong>.
        Chacun devra être déverrouillé une fois avec le nouveau, connecté à Internet.
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------- Password change */

function ChangePasswordModal({
  kind,
  onClose,
  onSubmit,
}: {
  kind: 'tresorier' | 'compte' | null
  onClose: () => void
  /** Renvoie un message d'erreur, ou null si le changement a réussi. */
  onSubmit: (current: string, next: string) => Promise<string | null>
}) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
    onClose()
  }

  async function submit() {
    const problem = passwordProblem(next)
    if (problem) return setError(problem)
    if (next !== confirm) return setError('Les deux nouveaux mots de passe ne correspondent pas.')
    setBusy(true)
    const failed = await onSubmit(current, next)
    setBusy(false)
    if (failed) {
      // Le message vient du serveur : « mot de passe incorrect » et « hors
      // ligne » appellent des réactions très différentes de l'utilisateur.
      setError(failed)
      setCurrent('')
      return
    }
    toast.success('Mot de passe modifié')
    close()
  }

  const isTreasurerPwd = kind === 'tresorier'

  return (
    <Modal
      open={kind !== null}
      onClose={close}
      title={isTreasurerPwd ? 'Mot de passe Trésorier' : 'Mot de passe du compte'}
      subtitle={
        isTreasurerPwd
          ? "Il débloque l'écriture. Ne le partagez qu'avec le Trésorier."
          : 'Il ouvre l\'application en lecture seule pour le bureau.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || !current || !next}>
            {busy ? 'Enregistrement…' : 'Modifier'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Mot de passe actuel">
          <PasswordInput
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value)
              setError('')
            }}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </Field>
        <Field label="Nouveau mot de passe" error={error || undefined}>
          <PasswordInput
            value={next}
            onChange={(e) => {
              setNext(e.target.value)
              setError('')
            }}
            autoComplete="new-password"
            placeholder="Au moins 6 caractères"
          />
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <PasswordInput
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
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
