import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  Download,
  Eye,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { useDB } from '@/lib/store'
import { useToast } from '@/components/Toast'
import { totals } from '@/lib/selectors'
import { formatXOF, periodLabel } from '@/lib/format'
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  cx,
} from '@/components/ui'

export function SettingsPage() {
  const store = useDB()
  const { db, role, setRole, isTreasurer } = store
  const toast = useToast()
  const navigate = useNavigate()

  const [confirmReset, setConfirmReset] = useState(false)
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
    toast.success('Sauvegarde téléchargée')
  }

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Association, rôle et données locales" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------ Identity */}
        <Card>
          <CardHeader
            title="Identité de l'association"
            subtitle="Repris dans l'en-tête et le rapport d'AG"
          />
          <div className="grid gap-4 p-4">
            <Field label="Nom complet">
              <Input
                value={a.name}
                onChange={(e) => store.updateAssociation({ name: e.target.value })}
                disabled={!isTreasurer}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sigle">
                <Input
                  value={a.acronym}
                  onChange={(e) => store.updateAssociation({ acronym: e.target.value })}
                  disabled={!isTreasurer}
                />
              </Field>
              <Field label="Ville">
                <Input
                  value={a.city}
                  onChange={(e) => store.updateAssociation({ city: e.target.value })}
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
                <Input
                  value={a.treasurerName}
                  onChange={(e) => store.updateAssociation({ treasurerName: e.target.value })}
                  disabled={!isTreasurer}
                />
              </Field>
              <Field label="Président">
                <Input
                  value={a.presidentName}
                  onChange={(e) => store.updateAssociation({ presidentName: e.target.value })}
                  disabled={!isTreasurer}
                />
              </Field>
            </div>
            <Field
              label="Début du suivi des cotisations"
              hint={`Les cotisations sont comptées à partir de ${periodLabel(a.fiscalStart)}.`}
            >
              <Input
                type="month"
                value={a.fiscalStart}
                onChange={(e) => store.updateAssociation({ fiscalStart: e.target.value })}
                disabled={!isTreasurer}
              />
            </Field>
          </div>
        </Card>

        <div className="grid content-start gap-4">
          {/* ------------------------------------------------------- Roles */}
          <Card>
            <CardHeader
              title="Rôle actif"
              subtitle="Basculez pour présenter les deux vues en réunion"
            />
            <div className="grid gap-2.5 p-4">
              {(
                [
                  [
                    'treasurer',
                    'Trésorier (Administrateur)',
                    'Accès complet : membres, cotisations, campagnes, dépenses.',
                    ShieldCheck,
                  ],
                  [
                    'viewer',
                    'Président / Secrétaire',
                    'Lecture seule : tableaux de bord, relevés et rapports, sans boutons de modification.',
                    Eye,
                  ],
                ] as const
              ).map(([value, label, description, Icon]) => (
                <button
                  key={value}
                  onClick={() => {
                    setRole(value)
                    toast.toast(`Rôle actif : ${label}`, 'info')
                  }}
                  className={cx(
                    'flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition',
                    role === value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-navy-200 hover:bg-navy-50',
                  )}
                >
                  <Icon
                    className={cx(
                      'mt-0.5 size-5 shrink-0',
                      role === value ? 'text-brand-600' : 'text-navy-400',
                    )}
                  />
                  <span>
                    <span className="block text-sm font-bold text-navy-900">{label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-navy-600">
                      {description}
                    </span>
                  </span>
                </button>
              ))}
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
                <Button variant="outline" onClick={exportJSON}>
                  <Download className="size-4" />
                  Exporter une sauvegarde (JSON)
                </Button>
                {isTreasurer && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        store.loadDemo()
                        toast.success('Données de démonstration rechargées')
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Recharger les données de démo
                    </Button>
                    <Button variant="danger" onClick={() => setConfirmReset(true)}>
                      <Trash2 className="size-4" />
                      Effacer toutes les données
                    </Button>
                  </>
                )}
              </div>

              <p className="mt-3 flex items-start gap-2 rounded-xl bg-navy-50 px-3.5 py-3 text-xs leading-relaxed text-navy-600">
                <Database className="mt-0.5 size-4 shrink-0 text-navy-400" />
                Tout est enregistré dans le navigateur de cet appareil : les données restent
                privées et l'application fonctionne sans connexion. Exportez régulièrement une
                sauvegarde avant de changer de téléphone ou de vider le cache.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Effacer toutes les données ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.resetAll()
                setConfirmReset(false)
                toast.toast("Toutes les données ont été effacées", 'info')
                navigate('/')
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
          définitivement supprimés de cet appareil. Cette action est irréversible.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
          <Upload className="mt-0.5 size-4 shrink-0" />
          Exportez d'abord une sauvegarde JSON si vous souhaitez conserver l'historique.
        </div>
      </Modal>
    </>
  )
}
