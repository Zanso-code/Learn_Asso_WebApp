import { useMemo, useState } from 'react'
import {
  CalendarDays,
  HandCoins,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Target,
  Trash2,
  Users,
} from 'lucide-react'
import type { Campaign, PaymentMethod } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/types'
import { useDB } from '@/lib/store'
import { useToast } from '@/components/Toast'
import { campaignRaised } from '@/lib/selectors'
import { formatDate, formatXOF, plainXOF, todayISO } from '@/lib/format'
import {
  AmountInput,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Textarea,
  cx,
} from '@/components/ui'

const BLANK: Omit<Campaign, 'id'> = {
  title: '',
  description: '',
  targetAmount: 0,
  deadline: '',
  status: 'open',
}

export function Campaigns() {
  const store = useDB()
  const { db, isTreasurer } = store
  const toast = useToast()

  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null)

  const detail = db.campaigns.find((c) => c.id === detailFor) ?? null

  const totals = useMemo(() => {
    const target = db.campaigns.reduce((s, c) => s + c.targetAmount, 0)
    const raised = db.contributions.reduce((s, c) => s + c.amount, 0)
    return { target, raised }
  }, [db.campaigns, db.contributions])

  return (
    <>
      <PageHeader
        title="Cotisations extraordinaires"
        subtitle={
          db.campaigns.length > 0
            ? `${formatXOF(totals.raised)} collectés sur ${formatXOF(totals.target)} visés`
            : 'Campagnes ponctuelles : gala, forage, obsèques, projets…'
        }
        action={
          isTreasurer && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nouvelle campagne</span>
              <span className="sm:hidden">Campagne</span>
            </Button>
          )
        }
      />

      {db.campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HandCoins className="size-7" />}
            title="Aucune campagne"
            description="Créez une campagne pour collecter des fonds en dehors des cotisations mensuelles : gala annuel, forage communautaire, soutien à un membre endeuillé."
            action={
              isTreasurer && (
                <Button onClick={() => setEditing('new')}>
                  <Plus className="size-4" />
                  Créer une campagne
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {db.campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onOpen={() => setDetailFor(campaign.id)}
              onEdit={() => setEditing(campaign)}
              onDelete={() => setConfirmDelete(campaign)}
            />
          ))}
        </div>
      )}

      {editing && (
        <CampaignForm
          campaign={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') {
              store.addCampaign(data)
              toast.success(`Campagne « ${data.title} » créée`)
            } else {
              store.updateCampaign(editing.id, data)
              toast.success('Campagne mise à jour')
            }
            setEditing(null)
          }}
        />
      )}

      {detail && <CampaignDetail campaign={detail} onClose={() => setDetailFor(null)} />}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer cette campagne ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmDelete) return
                store.removeCampaign(confirmDelete.id)
                toast.toast(`Campagne « ${confirmDelete.title} » supprimée`, 'info')
                setConfirmDelete(null)
              }}
            >
              <Trash2 className="size-4" />
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-navy-600">
          La campagne <strong className="text-navy-900">{confirmDelete?.title}</strong> et les{' '}
          {db.contributions.filter((c) => c.campaignId === confirmDelete?.id).length} contributions
          associées seront définitivement effacées des comptes.
        </p>
      </Modal>
    </>
  )
}

/* ----------------------------------------------------------- Campaign card */

function CampaignCard({
  campaign,
  onOpen,
  onEdit,
  onDelete,
}: {
  campaign: Campaign
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { db, isTreasurer } = useDB()
  const raised = campaignRaised(db, campaign.id)
  const pct = campaign.targetAmount > 0 ? (raised / campaign.targetAmount) * 100 : 0
  const contributors = db.contributions.filter((c) => c.campaignId === campaign.id).length
  const overdue = campaign.deadline && campaign.deadline < todayISO() && campaign.status === 'open'

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={onOpen}
            className="text-left text-base font-bold text-navy-900 hover:text-brand-700"
          >
            {campaign.title}
          </button>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-navy-600">
            {campaign.description}
          </p>
        </div>
        <Badge tone={campaign.status === 'open' ? 'brand' : 'slate'}>
          {campaign.status === 'open' ? (
            <>
              <LockOpen className="size-3" />
              Ouverte
            </>
          ) : (
            <>
              <Lock className="size-3" />
              Clôturée
            </>
          )}
        </Badge>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-end justify-between gap-3">
          <p className="tnum text-2xl font-extrabold text-navy-900">{formatXOF(raised)}</p>
          <p className="tnum text-sm font-semibold text-navy-500">
            sur {formatXOF(campaign.targetAmount)}
          </p>
        </div>
        <Progress value={raised} max={campaign.targetAmount} tone={pct >= 100 ? 'brand' : 'amber'} />
        <div className="mt-1.5 flex items-center justify-between text-xs font-semibold">
          <span className={cx(pct >= 100 ? 'text-brand-700' : 'text-navy-600')}>
            {Math.round(pct)}% de l'objectif
          </span>
          <span className="text-navy-500">
            {campaign.targetAmount - raised > 0
              ? `Reste ${formatXOF(campaign.targetAmount - raised)}`
              : 'Objectif atteint'}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-navy-100 pt-3 text-xs text-navy-500">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" />
          {contributors} contribution{contributors > 1 ? 's' : ''}
        </span>
        {campaign.deadline && (
          <span className={cx('flex items-center gap-1.5', overdue && 'font-bold text-red-600')}>
            <CalendarDays className="size-3.5" />
            Échéance {formatDate(campaign.deadline)}
            {overdue && ' — dépassée'}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onOpen}>
          Voir les contributions
        </Button>
        {isTreasurer && (
          <>
            <Button variant="ghost" onClick={onEdit} aria-label="Modifier">
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={onDelete}
              aria-label="Supprimer"
              className="text-navy-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------- Campaign form */

function CampaignForm({
  campaign,
  onClose,
  onSave,
}: {
  campaign: Campaign | null
  onClose: () => void
  onSave: (data: Omit<Campaign, 'id'>) => void
}) {
  const [form, setForm] = useState<Omit<Campaign, 'id'>>(() => campaign ?? BLANK)
  const [touched, setTouched] = useState(false)

  function submit() {
    setTouched(true)
    if (!form.title.trim() || form.targetAmount <= 0) return
    onSave({ ...form, title: form.title.trim(), description: form.description.trim() })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={campaign ? 'Modifier la campagne' : 'Nouvelle campagne'}
      subtitle="Une collecte ponctuelle, distincte des cotisations mensuelles."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit}>{campaign ? 'Enregistrer' : 'Créer la campagne'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field
          label="Intitulé"
          required
          error={touched && !form.title.trim() ? "L'intitulé est obligatoire" : undefined}
        >
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Dîner-gala annuel 2026"
            autoFocus
          />
        </Field>

        <Field label="Description" hint="Objet de la collecte, décision de l'AG, bénéficiaire…">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Location de la salle, traiteur et animation pour la soirée de fin d'année."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Objectif à atteindre"
            required
            error={touched && form.targetAmount <= 0 ? 'Indiquez un objectif' : undefined}
          >
            <AmountInput
              value={form.targetAmount}
              onValueChange={(n) => setForm({ ...form, targetAmount: n })}
            />
          </Field>
          <Field label="Date limite">
            <Input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Statut">
          <Select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as Campaign['status'] })}
          >
            <option value="open">Ouverte — les contributions sont acceptées</option>
            <option value="closed">Clôturée — collecte terminée</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------- Campaign detail */

function CampaignDetail({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const store = useDB()
  const { db, isTreasurer } = store
  const toast = useToast()
  const [adding, setAdding] = useState(false)

  const list = useMemo(
    () =>
      db.contributions
        .filter((c) => c.campaignId === campaign.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.contributions, campaign.id],
  )

  const raised = list.reduce((s, c) => s + c.amount, 0)

  function nameOf(memberId: string | null, donorName?: string) {
    if (memberId) return db.members.find((m) => m.id === memberId)?.fullName ?? 'Membre supprimé'
    return donorName || 'Donateur externe'
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={campaign.title}
      subtitle={`${formatXOF(raised)} collectés sur ${formatXOF(campaign.targetAmount)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          {isTreasurer && campaign.status === 'open' && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Enregistrer une contribution
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 rounded-xl border border-navy-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy-600">
          <Target className="size-4 text-brand-600" />
          Progression
        </div>
        <Progress value={raised} max={campaign.targetAmount} />
        <p className="mt-2 text-sm text-navy-600">
          {campaign.targetAmount > 0 ? Math.round((raised / campaign.targetAmount) * 100) : 0}% de
          l'objectif · {list.length} contribution{list.length > 1 ? 's' : ''}
          {campaign.deadline && ` · échéance le ${formatDate(campaign.deadline)}`}
        </p>
        {campaign.description && (
          <p className="mt-2 border-t border-navy-100 pt-2 text-sm leading-relaxed text-navy-600">
            {campaign.description}
          </p>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="size-7" />}
          title="Aucune contribution"
          description="Enregistrez le premier versement pour lancer cette collecte."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-navy-200">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-left text-xs font-bold text-navy-600 uppercase">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Contributeur</th>
                <th className="hidden px-3 py-2 sm:table-cell">Mode</th>
                <th className="px-3 py-2 text-right">Montant</th>
                {isTreasurer && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="tnum px-3 py-2 whitespace-nowrap">{formatDate(c.date)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-navy-900">
                      {nameOf(c.memberId, c.donorName)}
                    </span>
                    {!c.memberId && (
                      <Badge tone="violet" className="ml-2">
                        Externe
                      </Badge>
                    )}
                    {c.note && <span className="block text-xs text-navy-500">{c.note}</span>}
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-navy-500 sm:table-cell">
                    {PAYMENT_METHODS.find((m) => m.value === c.method)?.label}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {formatXOF(c.amount)}
                  </td>
                  {isTreasurer && (
                    <td className="pr-2">
                      <button
                        onClick={() => {
                          store.removeContribution(c.id)
                          toast.toast('Contribution supprimée', 'info')
                        }}
                        className="rounded-lg p-1.5 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-navy-50 font-bold">
              <tr>
                <td colSpan={isTreasurer ? 3 : 2} className="px-3 py-2 text-right">
                  Total collecté
                </td>
                <td className="tnum px-3 py-2 text-right whitespace-nowrap">{formatXOF(raised)}</td>
                {isTreasurer && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {adding && <ContributionForm campaign={campaign} onClose={() => setAdding(false)} />}
    </Modal>
  )
}

/* ------------------------------------------------------- Contribution form */

function ContributionForm({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const store = useDB()
  const { db } = store
  const toast = useToast()

  const [source, setSource] = useState<string>(db.members[0]?.id ?? 'external')
  const [donorName, setDonorName] = useState('')
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<PaymentMethod>('especes')
  const [note, setNote] = useState('')

  const isExternal = source === 'external'

  function submit() {
    if (amount <= 0) {
      toast.error('Saisissez un montant supérieur à zéro.')
      return
    }
    if (isExternal && !donorName.trim()) {
      toast.error('Indiquez le nom du donateur externe.')
      return
    }
    store.addContribution({
      campaignId: campaign.id,
      memberId: isExternal ? null : source,
      donorName: isExternal ? donorName.trim() : undefined,
      amount,
      date,
      method,
      note: note.trim(),
    })
    const who = isExternal
      ? donorName.trim()
      : (db.members.find((m) => m.id === source)?.fullName ?? 'un membre')
    toast.success(`Contribution de ${plainXOF(amount)} enregistrée pour ${who}`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle contribution"
      subtitle={campaign.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit}>Enregistrer</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Contributeur" required>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            {db.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
            <option value="external">— Donateur externe —</option>
          </Select>
        </Field>

        {isExternal && (
          <Field label="Nom du donateur" required>
            <Input
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              placeholder="Fondation Sahel Avenir"
            />
          </Field>
        )}

        <Field label="Montant" required>
          <AmountInput value={amount} onValueChange={setAmount} autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Mode de paiement">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Note" hint="Optionnel.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="—" />
        </Field>
      </div>
    </Modal>
  )
}
