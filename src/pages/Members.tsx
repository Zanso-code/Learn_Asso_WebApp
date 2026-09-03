import { useMemo, useState } from 'react'
import {
  FileText,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { Category, Member } from '@/lib/types'
import { LIMITS } from '@/lib/limits'
import { useDB } from '@/lib/store'
import { useToast } from '@/components/Toast'
import { MemberStatementModal } from '@/components/MemberStatement'
import { categoryOf, memberBalance } from '@/lib/selectors'
import { formatDate, formatXOF, todayISO, waLink } from '@/lib/format'
import {
  AmountInput,
  Avatar,
  Badge,
  Button,
  Card,
  CommitInput,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  cx,
  toneForCategory,
} from '@/components/ui'

/** Country codes common to West African association rosters. */
const DIAL_CODES: Array<[string, string]> = [
  ['226', 'Burkina Faso'],
  ['225', "Côte d'Ivoire"],
  ['223', 'Mali'],
  ['221', 'Sénégal'],
  ['227', 'Niger'],
  ['228', 'Togo'],
  ['229', 'Bénin'],
  ['224', 'Guinée'],
  ['233', 'Ghana'],
  ['234', 'Nigéria'],
  ['235', 'Tchad'],
  ['33', 'France'],
  ['1', 'USA / Canada'],
  ['39', 'Italie'],
  ['32', 'Belgique'],
]

type StatusFilter = 'all' | 'active' | 'inactive'

const BLANK: Omit<Member, 'id'> = {
  fullName: '',
  dialCode: '226',
  phone: '',
  categoryId: '',
  joinDate: todayISO(),
  active: true,
  note: '',
}

export function Members() {
  const store = useDB()
  const { db, isTreasurer } = store
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [statementFor, setStatementFor] = useState<Member | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return db.members
      .filter((m) => {
        if (categoryFilter !== 'all' && m.categoryId !== categoryFilter) return false
        if (statusFilter === 'active' && !m.active) return false
        if (statusFilter === 'inactive' && m.active) return false
        if (!q) return true
        return (
          m.fullName.toLowerCase().includes(q) ||
          `${m.dialCode}${m.phone}`.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
        )
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'))
  }, [db.members, query, categoryFilter, statusFilter])

  const activeCount = db.members.filter((m) => m.active).length
  const hasFilters = query !== '' || categoryFilter !== 'all' || statusFilter !== 'all'

  return (
    <>
      <PageHeader
        title="Membres"
        subtitle={`${activeCount} actifs · ${db.members.length - activeCount} inactifs · ${db.members.length} au total`}
        action={
          isTreasurer && (
            <div className="flex gap-2">
              <Button variant="outline" size="md" onClick={() => setCategoriesOpen(true)}>
                <Settings2 className="size-4" />
                <span className="hidden sm:inline">Catégories</span>
              </Button>
              <Button onClick={() => setEditing('new')}>
                <UserPlus className="size-4" />
                <span className="hidden sm:inline">Nouveau membre</span>
                <span className="sm:hidden">Ajouter</span>
              </Button>
            </div>
          )
        }
      />

      {/* --------------------------------------------------------- Filters */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-navy-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par nom ou téléphone…"
              className="pl-9"
              type="search"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="flex-1 sm:w-48"
              aria-label="Filtrer par catégorie"
            >
              <option value="all">Toutes catégories</option>
              {db.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="flex-1 sm:w-36"
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </Select>
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              setQuery('')
              setCategoryFilter('all')
              setStatusFilter('all')
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-navy-900"
          >
            <X className="size-3.5" />
            Réinitialiser les filtres ({filtered.length} résultat
            {filtered.length > 1 ? 's' : ''})
          </button>
        )}
      </Card>

      {/* ------------------------------------------------------------ List */}
      {db.members.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-7" />}
            title="Aucun membre pour l'instant"
            description="Ajoutez vos adhérents pour commencer à suivre les cotisations mensuelles."
            action={
              isTreasurer && (
                <Button onClick={() => setEditing('new')}>
                  <UserPlus className="size-4" />
                  Ajouter le premier membre
                </Button>
              )
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="size-7" />}
            title="Aucun résultat"
            description="Aucun membre ne correspond à cette recherche ou à ces filtres."
          />
        </Card>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onEdit={() => setEditing(member)}
              onDelete={() => setConfirmDelete(member)}
              onStatement={() => setStatementFor(member)}
            />
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------- Modals */}
      {editing && (
        <MemberForm
          member={editing === 'new' ? null : editing}
          categories={db.categories}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') {
              store.addMember(data)
              toast.success(`${data.fullName} ajouté(e) au registre`)
            } else {
              store.updateMember(editing.id, data)
              toast.success(`Fiche de ${data.fullName} mise à jour`)
            }
            setEditing(null)
          }}
        />
      )}

      <CategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />

      <MemberStatementModal
        member={statementFor}
        open={statementFor !== null}
        onClose={() => setStatementFor(null)}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer ce membre ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmDelete) return
                store.removeMember(confirmDelete.id)
                toast.toast(`${confirmDelete.fullName} supprimé(e) du registre`, 'info')
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
          <strong className="text-navy-900">{confirmDelete?.fullName}</strong> et l'ensemble de ses
          cotisations mensuelles seront définitivement effacés. Ses contributions aux campagnes
          extraordinaires sont conservées dans les totaux, en tant que dons.
        </p>
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Pour un membre qui a simplement quitté l'association, préférez le passer en{' '}
          <strong>Inactif</strong> : l'historique reste consultable.
        </p>
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------- Member card */

function MemberCard({
  member,
  onEdit,
  onDelete,
  onStatement,
}: {
  member: Member
  onEdit: () => void
  onDelete: () => void
  onStatement: () => void
}) {
  const { db, isTreasurer } = useDB()
  const category = categoryOf(db, member)
  const balance = memberBalance(db, member)

  return (
    <Card className={cx('p-3.5 transition', !member.active && 'bg-navy-50/60')}>
      <div className="flex items-start gap-3">
        <Avatar
          name={member.fullName}
          tone={member.active ? toneForCategory(category?.color ?? 'navy') : 'slate'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={onStatement}
              className="min-w-0 text-left font-bold text-navy-900 hover:text-brand-700"
            >
              <span className="block truncate">{member.fullName}</span>
            </button>
            {!member.active && <Badge tone="slate">Inactif</Badge>}
          </div>

          <p className="tnum mt-0.5 truncate text-sm text-navy-500">
            +{member.dialCode} {member.phone}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={toneForCategory(category?.color ?? 'navy')}>
              {category?.name ?? 'Sans catégorie'}
            </Badge>
            <span className="tnum text-xs font-semibold text-navy-500">
              {formatXOF(category?.monthlyAmount ?? 0)}/mois
            </span>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-navy-100 pt-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-navy-500">
                Depuis le {formatDate(member.joinDate)}
              </p>
              <p
                className={cx(
                  'tnum text-sm font-extrabold',
                  balance.balance > 0 ? 'text-red-600' : 'text-brand-700',
                )}
              >
                {balance.balance > 0 ? `${formatXOF(balance.balance)} dus` : 'À jour'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <a
                href={waLink(
                  member.dialCode,
                  member.phone,
                  `Bonjour ${member.fullName.split(' ')[0]}, `,
                )}
                target="_blank"
                rel="noreferrer"
                title="Écrire sur WhatsApp"
                className="flex size-9 items-center justify-center rounded-lg text-brand-600 transition hover:bg-brand-50"
              >
                <MessageCircle className="size-4.5" />
              </a>
              <a
                href={`tel:+${member.dialCode}${member.phone.replace(/\s/g, '')}`}
                title="Appeler"
                className="flex size-9 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100"
              >
                <Phone className="size-4.5" />
              </a>
              <button
                onClick={onStatement}
                title="Relevé individuel"
                className="flex size-9 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100"
              >
                <FileText className="size-4.5" />
              </button>
              {isTreasurer && (
                <>
                  <button
                    onClick={onEdit}
                    title="Modifier"
                    className="flex size-9 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100"
                  >
                    <Pencil className="size-4.5" />
                  </button>
                  <button
                    onClick={onDelete}
                    title="Supprimer"
                    className="flex size-9 items-center justify-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-4.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------- Member form */

function MemberForm({
  member,
  categories,
  onClose,
  onSave,
}: {
  member: Member | null
  categories: Category[]
  onClose: () => void
  onSave: (data: Omit<Member, 'id'>) => void
}) {
  const [form, setForm] = useState<Omit<Member, 'id'>>(() =>
    member
      ? { ...member }
      : { ...BLANK, categoryId: categories[0]?.id ?? '' },
  )
  const [touched, setTouched] = useState(false)

  const nameError = touched && !form.fullName.trim() ? 'Le nom est obligatoire' : undefined
  const phoneError = touched && !form.phone.trim() ? 'Le téléphone est obligatoire' : undefined

  function submit() {
    setTouched(true)
    if (!form.fullName.trim() || !form.phone.trim()) return
    onSave({ ...form, fullName: form.fullName.trim(), phone: form.phone.trim() })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? 'Modifier le membre' : 'Nouveau membre'}
      subtitle={member ? member.fullName : 'Ajoutez un adhérent au registre'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit}>{member ? 'Enregistrer' : 'Ajouter le membre'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nom complet" required error={nameError}>
          <Input
            value={form.fullName}
            maxLength={LIMITS.membreNom}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            placeholder="Aminata Ouédraogo"
            autoFocus
          />
        </Field>

        <Field
          label="Téléphone"
          required
          error={phoneError}
          hint="Utilisé pour les rappels WhatsApp et les appels directs."
        >
          {/* Stacked on phones: the country name makes the select too wide to
              sit beside the number on a 390 px screen without squeezing both. */}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
            <Select
              value={form.dialCode}
              onChange={(e) => setForm({ ...form, dialCode: e.target.value })}
              className="w-full min-w-0"
              aria-label="Indicatif pays"
            >
              {DIAL_CODES.map(([code, label]) => (
                <option key={code} value={code}>
                  +{code} · {label}
                </option>
              ))}
            </Select>
            <Input
              value={form.phone}
              maxLength={LIMITS.membreTelephone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="70 12 45 89"
              inputMode="tel"
              className="tnum w-full min-w-0"
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catégorie de cotisation" required>
            <Select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {formatXOF(c.monthlyAmount)}/mois
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date d'adhésion" hint="Les cotisations démarrent à ce mois-là.">
            <Input
              type="date"
              value={form.joinDate}
              onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setForm({ ...form, active: !form.active })}
          className="flex items-center justify-between rounded-xl border border-navy-200 px-4 py-3 text-left transition hover:bg-navy-50"
        >
          <span>
            <span className="block text-sm font-semibold text-navy-900">Membre actif</span>
            <span className="block text-xs text-navy-500">
              Un membre inactif ne génère plus de cotisations dues.
            </span>
          </span>
          <span
            className={cx(
              'relative h-6 w-11 shrink-0 rounded-full transition',
              form.active ? 'bg-brand-600' : 'bg-navy-300',
            )}
          >
            <span
              className={cx(
                'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                form.active ? 'left-5.5' : 'left-0.5',
              )}
            />
          </span>
        </button>
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------- Categories modal */

function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useDB()
  const { db } = store
  const toast = useToast()
  const [draft, setDraft] = useState<{ name: string; amount: number }>({ name: '', amount: 0 })

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of db.members) map.set(m.categoryId, (map.get(m.categoryId) ?? 0) + 1)
    return map
  }, [db.members])

  const palette = ['brand', 'navy', 'amber', 'violet', 'red', 'slate']

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Catégories de cotisation"
      subtitle="Définissez le montant mensuel dû par chaque type de membre."
      footer={<Button onClick={onClose}>Terminé</Button>}
    >
      <div className="grid gap-2.5">
        {db.categories.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-navy-200 p-3"
          >
            <CommitInput
              value={c.name}
              onCommit={(next) => store.updateCategory(c.id, { name: next })}
              maxLength={LIMITS.categorieNom}
              className="min-w-0 flex-1"
              aria-label="Nom de la catégorie"
            />
            <div className="w-40">
              <AmountInput
                value={c.monthlyAmount}
                onValueChange={(n) => store.updateCategory(c.id, { monthlyAmount: n })}
                aria-label="Montant mensuel"
              />
            </div>
            <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
              <Badge tone={toneForCategory(c.color)}>
                {counts.get(c.id) ?? 0} membre{(counts.get(c.id) ?? 0) > 1 ? 's' : ''}
              </Badge>
              <button
                onClick={() => {
                  if (db.categories.length <= 1) {
                    toast.error('Gardez au moins une catégorie.')
                    return
                  }
                  store.removeCategory(c.id)
                  toast.toast(`Catégorie « ${c.name} » supprimée`, 'info')
                }}
                className="flex size-9 items-center justify-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                title="Supprimer la catégorie"
              >
                <Trash2 className="size-4.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-navy-300 p-3">
        <p className="mb-2 text-sm font-semibold text-navy-700">Ajouter une catégorie</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft.name}
            maxLength={LIMITS.categorieNom}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Ex. Sympathisant"
            className="min-w-0 flex-1"
          />
          <div className="w-40">
            <AmountInput
              value={draft.amount}
              onValueChange={(n) => setDraft({ ...draft, amount: n })}
            />
          </div>
          <Button
            onClick={() => {
              if (!draft.name.trim()) return
              store.addCategory({
                name: draft.name.trim(),
                monthlyAmount: draft.amount,
                color: palette[db.categories.length % palette.length],
              })
              toast.success(`Catégorie « ${draft.name.trim()} » créée`)
              setDraft({ name: '', amount: 0 })
            }}
            disabled={!draft.name.trim()}
          >
            <Plus className="size-4" />
            Ajouter
          </Button>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-navy-500">
        En supprimant une catégorie, ses membres sont automatiquement rattachés à la première
        catégorie restante. Les paiements déjà enregistrés ne sont jamais modifiés.
      </p>
    </Modal>
  )
}
