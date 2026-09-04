import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Check,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react'
import type { Expense, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import { LIMITS } from '@/lib/limits'
import { useDB, useStore } from '@/lib/store'
import { useToast } from '@/components/Toast'
import { expensesByCategory, totalExpenses } from '@/lib/selectors'
import { ExpenseShareBar } from '@/components/charts'
import { EXPENSE_COLORS } from '@/lib/palette'
import { formatDate, formatXOF, plainXOF, todayISO, uid } from '@/lib/format'
import { compressReceipt, formatBytes, MAX_RECEIPT_BYTES } from '@/lib/image'
import { deleteReceipt, getReceipt, putReceipt } from '@/lib/receipts'
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
  Select,
  Textarea,
} from '@/components/ui'

function categoryLabel(value: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

/** Chip colour, tinted from the category's chart hue so both views agree. */
function CategoryChip({ category }: { category: ExpenseCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-white px-2 py-0.5 text-xs font-semibold text-navy-700">
      <span
        className="size-2 rounded-sm"
        style={{ background: EXPENSE_COLORS[category] }}
        aria-hidden
      />
      {categoryLabel(category)}
    </span>
  )
}

export function Expenses() {
  const store = useDB()
  const { db, isTreasurer } = store
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | ExpenseCategory>('all')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [zoomKey, setZoomKey] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return db.expenses
      .filter((e) => {
        if (filter !== 'all' && e.category !== filter) return false
        if (!q) return true
        return (
          e.label.toLowerCase().includes(q) ||
          e.beneficiary.toLowerCase().includes(q) ||
          categoryLabel(e.category).toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [db.expenses, query, filter])

  const total = totalExpenses(db)
  const breakdown = useMemo(() => expensesByCategory(db), [db])
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0)
  const withReceipts = db.expenses.filter((e) => e.receiptKey).length

  return (
    <>
      <PageHeader
        title="Dépenses"
        subtitle={`${formatXOF(total)} dépensés · ${withReceipts}/${db.expenses.length} justificatifs`}
        action={
          isTreasurer && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nouvelle dépense</span>
              <span className="sm:hidden">Dépense</span>
            </Button>
          )
        }
      />

      {breakdown.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="mb-3 text-xs font-bold text-navy-600 uppercase">Répartition par poste</p>
          <ExpenseShareBar
            data={breakdown}
            total={total}
            activeCategory={filter === 'all' ? undefined : filter}
            onSelect={(category) => setFilter(filter === category ? 'all' : category)}
          />
        </Card>
      )}

      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-navy-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une dépense ou un bénéficiaire…"
              className="pl-9"
              type="search"
            />
          </div>
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | ExpenseCategory)}
            className="sm:w-56"
            aria-label="Filtrer par catégorie"
          >
            <option value="all">Toutes les catégories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        {(query || filter !== 'all') && (
          <p className="mt-2 text-xs font-semibold text-navy-500">
            {filtered.length} dépense{filtered.length > 1 ? 's' : ''} ·{' '}
            <span className="tnum">{formatXOF(filteredTotal)}</span>
          </p>
        )}
      </Card>

      {db.expenses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt className="size-7" />}
            title="Aucune dépense enregistrée"
            description="Saisissez vos décaissements et photographiez les reçus : ils seront joints au rapport d'Assemblée Générale."
            action={
              isTreasurer && (
                <Button onClick={() => setEditing('new')}>
                  <Plus className="size-4" />
                  Enregistrer une dépense
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
            description="Aucune dépense ne correspond à cette recherche."
          />
        </Card>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((expense) => (
            <Card key={expense.id} className="flex gap-3 p-3.5">
              <ReceiptThumb
                receiptKey={expense.receiptKey}
                onZoom={() => expense.receiptKey && setZoomKey(expense.receiptKey)}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-bold text-navy-900">{expense.label}</p>
                  <p className="tnum shrink-0 font-extrabold text-red-600">
                    {formatXOF(expense.amount)}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-sm text-navy-500">{expense.beneficiary}</p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <CategoryChip category={expense.category} />
                  <span className="tnum text-xs text-navy-500">{formatDate(expense.date)}</span>
                </div>

                {expense.note && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-navy-500">{expense.note}</p>
                )}

                {isTreasurer && (
                  <div className="mt-2 flex justify-end gap-0.5">
                    <button
                      onClick={() => setEditing(expense)}
                      className="flex size-8 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100"
                      title="Modifier"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(expense)}
                      className="flex size-8 items-center justify-center rounded-lg text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Supprimer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ReceiptZoom receiptKey={zoomKey} onClose={() => setZoomKey(null)} />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer cette dépense ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmDelete) return
                store.removeExpense(confirmDelete.id)
                toast.toast(`Dépense « ${confirmDelete.label} » supprimée`, 'info')
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
          <strong className="text-navy-900">{confirmDelete?.label}</strong> (
          {confirmDelete && formatXOF(confirmDelete.amount)}) sera retirée des comptes
          {confirmDelete?.receiptKey && ', avec son justificatif photographié'}.
        </p>
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------ Receipt bits */

/**
 * Charge un reçu : cache IndexedDB d'abord, Supabase Storage ensuite. La clé
 * chargée est conservée à côté de l'image pour qu'un blob périmé soit écarté au
 * rendu plutôt que nettoyé dans un effet.
 */
function useReceipt(receiptKey?: string): string | null {
  const { associationId } = useStore()
  const [loaded, setLoaded] = useState<{ key: string; src: string | null } | null>(null)

  useEffect(() => {
    if (!receiptKey || !associationId) return
    let cancelled = false
    getReceipt(associationId, receiptKey).then((src) => {
      if (!cancelled) setLoaded({ key: receiptKey, src })
    })
    return () => {
      cancelled = true
    }
  }, [associationId, receiptKey])

  return loaded && loaded.key === receiptKey ? loaded.src : null
}

function ReceiptThumb({
  receiptKey,
  onZoom,
}: {
  receiptKey?: string
  onZoom: () => void
}) {
  const src = useReceipt(receiptKey)

  if (!receiptKey || !src) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-navy-300 bg-navy-50 text-navy-300">
        <ImageIcon className="size-5" />
      </div>
    )
  }

  return (
    <button
      onClick={onZoom}
      className="group relative size-16 shrink-0 overflow-hidden rounded-xl border border-navy-200"
      title="Agrandir le justificatif"
    >
      <img src={src} alt="Justificatif" className="size-full object-cover" loading="lazy" />
      <span className="absolute inset-0 flex items-center justify-center bg-navy-900/0 text-white opacity-0 transition group-hover:bg-navy-900/40 group-hover:opacity-100">
        <ZoomIn className="size-5" />
      </span>
    </button>
  )
}

function ReceiptZoom({ receiptKey, onClose }: { receiptKey: string | null; onClose: () => void }) {
  const src = useReceipt(receiptKey ?? undefined)

  return (
    <Modal
      open={receiptKey !== null}
      onClose={onClose}
      wide
      title="Justificatif"
      footer={<Button onClick={onClose}>Fermer</Button>}
    >
      {src ? (
        <img
          src={src}
          alt="Justificatif de dépense"
          className="mx-auto max-h-[70vh] w-auto rounded-xl border border-navy-200"
        />
      ) : (
        <p className="py-10 text-center text-sm text-navy-500">Justificatif introuvable.</p>
      )}
    </Modal>
  )
}

/* -------------------------------------------------------------- Expense form */

const BLANK: Omit<Expense, 'id'> = {
  label: '',
  beneficiary: '',
  amount: 0,
  category: 'logistique',
  date: todayISO(),
  note: '',
}

function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const store = useDB()
  const associationId = store.associationId
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Omit<Expense, 'id'>>(() => expense ?? BLANK)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [stats, setStats] = useState<{ from: number; to: number } | null>(null)

  // Staged separately so an abandoned form leaves no orphan blob behind.
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (expense?.receiptKey) {
      getReceipt(associationId, expense.receiptKey).then((value) => {
        if (!cancelled) setPreview(value)
      })
    }
    return () => {
      cancelled = true
    }
  }, [associationId, expense])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choisissez une image (photo du reçu).')
      return
    }
    setBusy(true)
    try {
      const result = await compressReceipt(file)
      const key = uid('rcpt')
      await putReceipt(associationId, key, result.dataUrl)
      if (pendingKey) void deleteReceipt(associationId, pendingKey)
      setPendingKey(key)
      setPreview(result.dataUrl)
      setStats({ from: result.originalBytes, to: result.bytes })
      toast.success(
        `Reçu compressé : ${formatBytes(result.originalBytes)} → ${formatBytes(result.bytes)}`,
      )
    } catch (err) {
      console.error(err)
      toast.error("Impossible de traiter cette image sur cet appareil.")
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function removeReceipt() {
    if (pendingKey) void deleteReceipt(associationId, pendingKey)
    setPendingKey(null)
    setPreview(null)
    setStats(null)
    setForm({ ...form, receiptKey: undefined })
  }

  function submit() {
    setTouched(true)
    if (!form.label.trim() || form.amount <= 0) return

    const receiptKey = pendingKey ?? form.receiptKey
    const data = {
      ...form,
      label: form.label.trim(),
      beneficiary: form.beneficiary.trim(),
      note: (form.note ?? '').trim(),
      receiptKey,
    }

    if (expense) {
      // Replacing a receipt: drop the old blob once the new one is committed.
      if (pendingKey && expense.receiptKey && expense.receiptKey !== pendingKey) {
        void deleteReceipt(associationId, expense.receiptKey)
      }
      if (!receiptKey && expense.receiptKey) void deleteReceipt(associationId, expense.receiptKey)
      store.updateExpense(expense.id, data)
      toast.success('Dépense mise à jour')
    } else {
      store.addExpense(data)
      toast.success(`Dépense de ${plainXOF(form.amount)} enregistrée`)
    }
    onClose()
  }

  function cancel() {
    if (pendingKey) void deleteReceipt(associationId, pendingKey)
    onClose()
  }

  return (
    <Modal
      open
      onClose={cancel}
      title={expense ? 'Modifier la dépense' : 'Nouvelle dépense'}
      subtitle="Chaque décaissement justifié renforce la confiance en Assemblée Générale."
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            {expense ? 'Enregistrer' : 'Ajouter la dépense'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field
          label="Objet de la dépense"
          required
          error={touched && !form.label.trim() ? "L'objet est obligatoire" : undefined}
        >
          <Input
            value={form.label}
            maxLength={LIMITS.depenseLibelle}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Location de chaises pour l'AG"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Montant"
            required
            error={touched && form.amount <= 0 ? 'Indiquez un montant' : undefined}
          >
            <AmountInput
              value={form.amount}
              onValueChange={(n) => setForm({ ...form, amount: n })}
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catégorie">
            <Select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as ExpenseCategory })
              }
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bénéficiaire" hint="Fournisseur, prestataire ou membre remboursé.">
            <Input
              value={form.beneficiary}
              maxLength={LIMITS.depenseBeneficiaire}
              onChange={(e) => setForm({ ...form, beneficiary: e.target.value })}
              placeholder="Établissement Wend-Kuuni"
            />
          </Field>
        </div>

        {/* ------------------------------------------------- Receipt capture */}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-navy-700">Justificatif</p>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          {preview ? (
            <div className="flex items-start gap-3 rounded-xl border border-navy-200 p-3">
              <img
                src={preview}
                alt="Aperçu du justificatif"
                className="size-24 rounded-lg border border-navy-200 object-cover"
              />
              <div className="min-w-0 flex-1">
                {stats ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                    <Check className="size-3.5" />
                    {formatBytes(stats.from)} → {formatBytes(stats.to)}
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-navy-600">Justificatif enregistré</p>
                )}
                <p className="mt-1 text-xs text-navy-500">
                  Compressé côté téléphone, sous {formatBytes(MAX_RECEIPT_BYTES)}, pour rester
                  léger sur une connexion 3G.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                    <Camera className="size-4" />
                    Remplacer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={removeReceipt}
                    className="text-navy-500 hover:text-red-600"
                  >
                    <X className="size-4" />
                    Retirer
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-300 px-4 py-7 text-navy-500 transition hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="size-6 animate-spin" />
                  <span className="text-sm font-semibold">Compression en cours…</span>
                </>
              ) : (
                <>
                  <Camera className="size-6" />
                  <span className="text-sm font-semibold">
                    Photographier le reçu ou choisir une image
                  </span>
                  <span className="text-xs">
                    Compressé automatiquement sous {formatBytes(MAX_RECEIPT_BYTES)}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        <Field label="Note" hint="Optionnel — référence de facture, précision utile en AG.">
          <Textarea
            value={form.note ?? ''}
            maxLength={LIMITS.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="—"
          />
        </Field>

        <p className="rounded-xl bg-navy-50 px-4 py-3 text-xs leading-relaxed text-navy-600">
          <Badge tone="brand" className="mr-1.5">
            Astuce
          </Badge>
          Sur téléphone, le bouton ouvre directement l'appareil photo. Les images sont réduites à
          1024 px et enregistrées localement — rien n'est envoyé sur Internet.
        </p>
      </div>
    </Modal>
  )
}
