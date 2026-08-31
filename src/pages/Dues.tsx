import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  MessageCircle,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { Member, PaymentMethod } from '@/lib/types'
import { PAYMENT_METHODS, paymentMethodLabel } from '@/lib/types'
import { useDB } from '@/lib/store'
import { useToast } from '@/components/Toast'
import { MemberStatementModal, reminderMessage } from '@/components/MemberStatement'
import {
  activeYears,
  arrears,
  categoryOf,
  memberYearRow,
  paidFor,
  type CellStatus,
} from '@/lib/selectors'
import {
  MONTHS_SHORT,
  currentPeriod,
  formatXOF, plainXOF,
  periodLabel,
  todayISO,
  waLink,
} from '@/lib/format'
import {
  AmountInput,
  Avatar,
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
  cx,
} from '@/components/ui'

const CELL_STYLE: Record<CellStatus, string> = {
  paid: 'bg-brand-500 text-white hover:bg-brand-600',
  partial: 'bg-amber-400 text-amber-950 hover:bg-amber-500',
  unpaid: 'bg-navy-200 text-navy-500 hover:bg-navy-300',
  exempt: 'bg-violet-100 text-violet-500',
  'before-join': 'bg-navy-50 text-navy-300',
  future: 'bg-white text-navy-300 ring-1 ring-navy-200 ring-inset hover:bg-navy-50',
}

const CELL_LABEL: Record<CellStatus, string> = {
  paid: 'Payé',
  partial: 'Partiel',
  unpaid: 'Impayé',
  exempt: 'Exempté',
  'before-join': 'Hors période',
  future: 'À venir',
}

/** Legend swatch. Explicit, because a future cell is white on white and would
 *  otherwise be invisible once reduced to its first background class. */
const CELL_SWATCH: Record<CellStatus, string> = {
  paid: 'bg-brand-500',
  partial: 'bg-amber-400',
  unpaid: 'bg-navy-200',
  exempt: 'bg-violet-100',
  'before-join': 'bg-navy-50 ring-1 ring-navy-200 ring-inset',
  future: 'bg-white ring-1 ring-navy-300 ring-inset',
}

type Tab = 'matrix' | 'arrears'

export function Dues() {
  const { db } = useDB()
  const [tab, setTab] = useState<Tab>('matrix')
  const [year, setYear] = useState(() => Number(currentPeriod().slice(0, 4)))
  const [statementFor, setStatementFor] = useState<Member | null>(null)

  const years = useMemo(() => activeYears(db), [db])
  const owing = useMemo(() => arrears(db), [db])
  const totalOwed = owing.reduce((s, b) => s + b.balance, 0)

  return (
    <>
      <PageHeader
        title="Cotisations"
        subtitle="Suivi mensuel des cotisations et relances des impayés"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-navy-200 bg-white p-1">
          {(
            [
              ['matrix', 'Matrice annuelle'],
              ['arrears', `Impayés${owing.length ? ` (${owing.length})` : ''}`],
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cx(
                'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                tab === value ? 'bg-brand-600 text-white' : 'text-navy-600 hover:bg-navy-100',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'matrix' && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="flex size-9 items-center justify-center rounded-lg border border-navy-200 bg-white text-navy-600 transition hover:bg-navy-50"
              aria-label="Année précédente"
            >
              <ChevronLeft className="size-4.5" />
            </button>
            <Select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-28"
              aria-label="Année"
            >
              {[...new Set([...years, year])]
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </Select>
            <button
              onClick={() => setYear((y) => y + 1)}
              className="flex size-9 items-center justify-center rounded-lg border border-navy-200 bg-white text-navy-600 transition hover:bg-navy-50"
              aria-label="Année suivante"
            >
              <ChevronRight className="size-4.5" />
            </button>
          </div>
        )}

        {tab === 'arrears' && totalOwed > 0 && (
          <Badge tone="red" className="ml-auto px-3 py-1.5 text-sm">
            <AlertTriangle className="size-4" />
            {formatXOF(totalOwed)} à recouvrer
          </Badge>
        )}
      </div>

      {tab === 'matrix' ? (
        <Matrix year={year} onStatement={setStatementFor} />
      ) : (
        <Arrears onStatement={setStatementFor} />
      )}

      <MemberStatementModal
        member={statementFor}
        open={statementFor !== null}
        onClose={() => setStatementFor(null)}
      />
    </>
  )
}

/* ------------------------------------------------------------------ Matrix */

function Matrix({
  year,
  onStatement,
}: {
  year: number
  onStatement: (m: Member) => void
}) {
  const { db, isTreasurer } = useDB()
  const [query, setQuery] = useState('')
  const [cell, setCell] = useState<{ member: Member; period: string } | null>(null)

  const members = useMemo(() => {
    const q = query.trim().toLowerCase()
    return db.members
      .filter((m) => (q ? m.fullName.toLowerCase().includes(q) : true))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName, 'fr'))
  }, [db.members, query])

  const rows = useMemo(
    () => members.map((m) => ({ member: m, cells: memberYearRow(db, m, year) })),
    [db, members, year],
  )

  const monthTotals = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        rows.reduce((sum, r) => sum + r.cells[i].paid, 0),
      ),
    [rows],
  )

  if (db.members.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet className="size-7" />}
          title="Pas encore de membres"
          description="Ajoutez des membres au registre pour voir apparaître la matrice des cotisations."
        />
      </Card>
    )
  }

  return (
    <>
      <Card className="mb-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-navy-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer les membres…"
            className="pl-9"
            type="search"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-navy-200 bg-navy-50">
                <th className="sticky left-0 z-10 min-w-[9.5rem] bg-navy-50 px-3 py-2.5 text-left text-xs font-bold text-navy-600 uppercase">
                  Membre
                </th>
                {MONTHS_SHORT.map((m, i) => (
                  <th
                    key={m}
                    className={cx(
                      'min-w-11 px-1 py-2.5 text-center text-xs font-bold text-navy-600',
                      `${year}-${String(i + 1).padStart(2, '0')}` === currentPeriod() &&
                        'bg-brand-50 text-brand-700',
                    )}
                  >
                    {m}
                  </th>
                ))}
                <th className="min-w-24 px-3 py-2.5 text-right text-xs font-bold text-navy-600 uppercase">
                  Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-navy-100">
              {rows.map(({ member, cells }) => {
                const rowTotal = cells.reduce((s, c) => s + c.paid, 0)
                return (
                  <tr key={member.id} className={cx(!member.active && 'bg-navy-50/50')}>
                    <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-normal">
                      <button
                        onClick={() => onStatement(member)}
                        className="block max-w-[8.5rem] truncate text-left text-sm font-semibold text-navy-900 hover:text-brand-700"
                        title={member.fullName}
                      >
                        {member.fullName}
                      </button>
                      <span className="tnum block text-[11px] text-navy-500">
                        {formatXOF(categoryOf(db, member)?.monthlyAmount ?? 0)}
                        {!member.active && ' · inactif'}
                      </span>
                    </th>

                    {cells.map((c) => (
                      <td key={c.period} className="p-0.5 text-center">
                        <button
                          disabled={!isTreasurer || c.status === 'before-join'}
                          onClick={() => setCell({ member, period: c.period })}
                          title={`${periodLabel(c.period)} — ${CELL_LABEL[c.status]}${
                            c.paid ? ` (${formatXOF(c.paid)})` : ''
                          }`}
                          className={cx(
                            'flex h-9 w-full items-center justify-center rounded-md text-[10px] font-bold transition',
                            CELL_STYLE[c.status],
                            (!isTreasurer || c.status === 'before-join') &&
                              'cursor-default hover:brightness-100',
                          )}
                        >
                          {c.status === 'paid' ? (
                            <Check className="size-4" strokeWidth={3} />
                          ) : c.status === 'partial' ? (
                            '½'
                          ) : c.status === 'exempt' ? (
                            '—'
                          ) : (
                            ''
                          )}
                        </button>
                      </td>
                    ))}

                    <td className="tnum px-3 py-1.5 text-right text-xs font-bold whitespace-nowrap text-navy-800">
                      {formatXOF(rowTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-navy-200 bg-navy-50 font-bold">
                <th className="sticky left-0 z-10 bg-navy-50 px-3 py-2.5 text-left text-xs text-navy-700 uppercase">
                  Encaissé
                </th>
                {monthTotals.map((t, i) => (
                  <td
                    key={i}
                    className="tnum px-1 py-2.5 text-center text-[10px] whitespace-nowrap text-navy-700"
                  >
                    {t > 0 ? `${Math.round(t / 1000)}k` : '—'}
                  </td>
                ))}
                <td className="tnum px-3 py-2.5 text-right text-xs whitespace-nowrap text-navy-900">
                  {formatXOF(monthTotals.reduce((a, b) => a + b, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-navy-100 px-3 py-2.5 text-[11px] font-semibold text-navy-500">
          {(['paid', 'partial', 'unpaid', 'future', 'exempt', 'before-join'] as CellStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cx('size-3 rounded-sm', CELL_SWATCH[s])} />
              {CELL_LABEL[s]}
            </span>
          ))}
          {isTreasurer && (
            <span className="ml-auto hidden sm:inline">
              Cliquez sur une case pour enregistrer un paiement.
            </span>
          )}
        </div>
      </Card>

      {cell && (
        <PaymentModal
          member={cell.member}
          period={cell.period}
          onClose={() => setCell(null)}
        />
      )}
    </>
  )
}

/* ----------------------------------------------------------- Payment modal */

function PaymentModal({
  member,
  period,
  onClose,
}: {
  member: Member
  period: string
  onClose: () => void
}) {
  const store = useDB()
  const { db } = store
  const toast = useToast()

  const monthly = categoryOf(db, member)?.monthlyAmount ?? 0
  const alreadyPaid = paidFor(db, member.id, period)
  const remaining = Math.max(0, monthly - alreadyPaid)

  const existing = db.duePayments.filter((p) => p.memberId === member.id && p.period === period)

  const [amount, setAmount] = useState(remaining > 0 ? remaining : monthly)
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<PaymentMethod>('especes')
  const [note, setNote] = useState('')

  function record() {
    if (amount <= 0) {
      toast.error('Saisissez un montant supérieur à zéro.')
      return
    }
    store.recordDue({ memberId: member.id, period, amount, date, method, note })
    toast.success(
      `Paiement de ${plainXOF(amount)} enregistré pour ${member.fullName}`,
    )
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={periodLabel(period)}
      subtitle={`${member.fullName} — cotisation ${formatXOF(monthly)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={record}>Enregistrer le paiement</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {period > currentPeriod() && (
          <p className="rounded-xl bg-brand-50 px-3.5 py-3 text-xs leading-relaxed text-brand-800">
            <strong>Paiement anticipé.</strong> Ce mois n'est pas encore échu : le versement est
            encaissé et apparaîtra comme payé, sans jamais compter dans les impayés.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-navy-50 p-3 text-center">
          {[
            ['Dû', formatXOF(monthly), 'text-navy-900'],
            ['Déjà versé', formatXOF(alreadyPaid), 'text-brand-700'],
            ['Reste', formatXOF(remaining), remaining > 0 ? 'text-red-600' : 'text-brand-700'],
          ].map(([label, value, tone]) => (
            <div key={label}>
              <p className="text-[11px] font-semibold text-navy-500">{label}</p>
              <p className={cx('tnum text-sm font-extrabold', tone)}>{value}</p>
            </div>
          ))}
        </div>

        {existing.length > 0 && (
          <div className="rounded-xl border border-navy-200">
            <p className="border-b border-navy-100 px-3 py-2 text-xs font-bold text-navy-600 uppercase">
              Versements déjà enregistrés
            </p>
            <ul className="divide-y divide-navy-100">
              {existing.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="tnum flex-1 font-semibold">{formatXOF(p.amount)}</span>
                  <span className="text-xs text-navy-500">
                    {paymentMethodLabel(p.method)}
                  </span>
                  <button
                    onClick={() => {
                      store.removeDue(p.id)
                      toast.toast('Versement annulé', 'info')
                    }}
                    className="rounded-lg p-1.5 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Annuler ce versement"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Montant versé" required>
          <AmountInput value={amount} onValueChange={setAmount} autoFocus />
        </Field>

        {remaining > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAmount(remaining)}>
              Solder ({formatXOF(remaining)})
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAmount(Math.round(remaining / 2))}>
              Moitié
            </Button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date du versement">
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

        <Field label="Note" hint="Optionnel — numéro de transaction, remarque…">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="—" />
        </Field>
      </div>
    </Modal>
  )
}

/* ----------------------------------------------------------------- Arrears */

function Arrears({ onStatement }: { onStatement: (m: Member) => void }) {
  const { db } = useDB()
  const toast = useToast()
  const list = useMemo(() => arrears(db), [db])
  const [broadcast, setBroadcast] = useState(false)

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label)
    } catch {
      toast.error('Copie impossible — sélectionnez le texte manuellement.')
    }
  }

  if (list.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Check className="size-7" />}
          title="Aucun impayé"
          description="Tous les membres actifs sont à jour de leurs cotisations. Beau travail."
        />
      </Card>
    )
  }

  const total = list.reduce((s, b) => s + b.balance, 0)

  return (
    <>
      <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-navy-600">
            {list.length} membre{list.length > 1 ? 's' : ''} en retard
          </p>
          <p className="tnum text-2xl font-extrabold text-red-600">{formatXOF(total)}</p>
        </div>
        <Button variant="outline" onClick={() => setBroadcast(true)}>
          <FileText className="size-4" />
          Liste récapitulative
        </Button>
      </Card>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((b) => {
          const message = reminderMessage(
            db.association.name,
            b.member,
            b.balance,
            b.unpaidPeriods,
          )
          return (
            <Card key={b.member.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <Avatar name={b.member.fullName} tone="red" />
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => onStatement(b.member)}
                    className="block w-full truncate text-left font-bold text-navy-900 hover:text-brand-700"
                  >
                    {b.member.fullName}
                  </button>
                  <p className="tnum text-xs text-navy-500">
                    +{b.member.dialCode} {b.member.phone}
                  </p>
                  <p className="tnum mt-1.5 text-xl font-extrabold text-red-600">
                    {formatXOF(b.balance)}
                  </p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    {b.unpaidPeriods.length} mois non soldé
                    {b.unpaidPeriods.length > 1 ? 's' : ''} ·{' '}
                    {b.unpaidPeriods.slice(0, 3).map(periodLabel).join(', ')}
                    {b.unpaidPeriods.length > 3 ? '…' : ''}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => copy(message, `Rappel pour ${b.member.fullName} copié`)}
                    >
                      <Copy className="size-4" />
                      Copier
                    </Button>
                    <a
                      href={waLink(b.member.dialCode, b.member.phone, message)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white transition hover:bg-brand-700"
                    >
                      <MessageCircle className="size-4" />
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={broadcast}
        onClose={() => setBroadcast(false)}
        wide
        title="Récapitulatif des impayés"
        subtitle="À copier dans le groupe WhatsApp ou à lire en réunion."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBroadcast(false)}>
              Fermer
            </Button>
            <Button
              onClick={() =>
                copy(
                  buildBroadcast(db.association.name, list),
                  'Récapitulatif copié dans le presse-papiers',
                )
              }
            >
              <Copy className="size-4" />
              Copier le texte
            </Button>
          </>
        }
      >
        <Textarea
          readOnly
          value={buildBroadcast(db.association.name, list)}
          className="tnum min-h-72 font-mono text-xs"
        />
      </Modal>
    </>
  )
}

function buildBroadcast(
  associationName: string,
  list: ReturnType<typeof arrears>,
): string {
  const total = list.reduce((s, b) => s + b.balance, 0)
  const money = (n: number) => plainXOF(n)
  return (
    `${associationName} — point sur les cotisations\n` +
    `Situation au ${new Date().toLocaleDateString('fr-FR')}\n\n` +
    list.map((b, i) => `${i + 1}. ${b.member.fullName} : ${money(b.balance)}`).join('\n') +
    `\n\nTotal à recouvrer : ${money(total)}\n\n` +
    `Merci à chacun de régulariser sa situation auprès du trésorier.\nLe Bureau`
  )
}
