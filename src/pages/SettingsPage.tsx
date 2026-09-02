import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  KeyRound,
  LifeBuoy,
  RotateCcw,
  ShieldCheck,
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
  const { account, lockTreasurer, changeTreasurerPassword, changeAccountPassword } = usePlatform()
  const toast = useToast()

  const [confirmReset, setConfirmReset] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [passwordModal, setPasswordModal] = useState<'tresorier' | 'compte' | null>(null)
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
                disabled={!isTreasurer}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sigle">
                <CommitInput
                  value={a.acronym}
                  onCommit={(next) => store.updateAssociation({ acronym: next })}
                  disabled={!isTreasurer}
                />
              </Field>
              <Field label="Ville">
                <CommitInput
                  value={a.city}
                  onCommit={(next) => store.updateAssociation({ city: next })}
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
                  disabled={!isTreasurer}
                />
              </Field>
              <Field label="Président">
                <CommitInput
                  value={a.presidentName}
                  onCommit={(next) => store.updateAssociation({ presidentName: next })}
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
    </>
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
