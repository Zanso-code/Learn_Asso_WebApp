import { MessageCircle, Printer } from 'lucide-react'
import type { Member } from '@/lib/types'
import { paymentMethodLabel } from '@/lib/types'
import { useDB } from '@/lib/store'
import { memberBalance, memberStatement } from '@/lib/selectors'
import { formatDate, formatDateLong, formatXOF, plainXOF, periodLabel, todayISO, waLink } from '@/lib/format'
import { Badge, Button, Modal } from './ui'

function methodLabel(value: string): string {
  return paymentMethodLabel(value)
}

/** Polite arrears reminder, ready to paste into WhatsApp. */
export function reminderMessage(
  associationName: string,
  member: Member,
  amount: number,
  months: string[],
): string {
  const detail =
    months.length > 0
      ? `\nMois concernés : ${months.map(periodLabel).join(', ')}.`
      : ''
  // WhatsApp renders narrow / non-breaking spaces inconsistently; send plain ones.
  const money = plainXOF(amount)
  return (
    `Bonjour ${member.fullName.split(' ')[0]},\n\n` +
    `Le bureau de ${associationName} vous informe que votre situation de cotisations présente ` +
    `un solde de ${money}.${detail}\n\n` +
    `Merci de bien vouloir régulariser auprès du trésorier dès que possible. ` +
    `Nous restons disponibles pour tout arrangement.\n\n` +
    `Cordialement,\nLe Trésorier Général`
  )
}

export function MemberStatementModal({
  member,
  open,
  onClose,
}: {
  member: Member | null
  open: boolean
  onClose: () => void
}) {
  const { db } = useDB()
  if (!member) return null

  const balance = memberBalance(db, member)
  const lines = memberStatement(db, member.id)
  const totalPaid = lines.reduce((s, l) => s + l.amount, 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      printable
      title={`Relevé individuel — ${member.fullName}`}
      subtitle={db.association.name}
      footer={
        <>
          <a
            href={waLink(
              member.dialCode,
              member.phone,
              balance.balance > 0
                ? reminderMessage(db.association.name, member, balance.balance, balance.unpaidPeriods)
                : `Bonjour ${member.fullName.split(' ')[0]}, votre situation de cotisations auprès de ${db.association.name} est à jour. Merci de votre engagement !`,
            )}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-navy-300 bg-white px-4 text-sm font-semibold text-navy-800 transition hover:bg-navy-50"
          >
            <MessageCircle className="size-4 text-brand-600" />
            WhatsApp
          </a>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            Imprimer
          </Button>
        </>
      }
    >
      <div className="print-page">
        {/* Printed header — replaces the dialog chrome on paper */}
        <div className="mb-5 hidden border-b-2 border-navy-900 pb-3 print:block">
          <h1 className="text-lg font-extrabold">{db.association.name}</h1>
          <p className="text-xs">
            {db.association.city}
            {db.association.city && db.association.country ? ', ' : ''}
            {db.association.country} — Relevé individuel de cotisations
          </p>
          <p className="mt-1 text-xs">Édité le {formatDateLong(todayISO())}</p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-navy-200 p-3.5">
            <p className="text-xs font-semibold text-navy-500">Membre</p>
            <p className="mt-0.5 font-bold text-navy-900">{member.fullName}</p>
            <p className="tnum mt-1 text-sm text-navy-600">
              +{member.dialCode} {member.phone}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="navy">{balance.category?.name ?? 'Sans catégorie'}</Badge>
              <Badge tone={member.active ? 'brand' : 'slate'}>
                {member.active ? 'Actif' : 'Inactif'}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-navy-500">
              Membre depuis le {formatDate(member.joinDate)}
            </p>
          </div>

          <div className="rounded-xl border border-navy-200 p-3.5">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-navy-600">Cotisation mensuelle</dt>
                <dd className="tnum font-semibold">{formatXOF(balance.monthly)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-600">Total attendu à ce jour</dt>
                <dd className="tnum font-semibold">{formatXOF(balance.expected)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-600">Total versé</dt>
                <dd className="tnum font-semibold text-brand-700">{formatXOF(totalPaid)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-navy-200 pt-1.5">
                <dt className="font-bold text-navy-900">Solde restant dû</dt>
                <dd
                  className={`tnum font-extrabold ${balance.balance > 0 ? 'text-red-600' : 'text-brand-700'}`}
                >
                  {formatXOF(balance.balance)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {balance.unpaidPeriods.length > 0 && (
          <div className="avoid-break mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 print:bg-white">
            <p className="text-xs font-bold text-amber-800">
              Mois non soldés ({balance.unpaidPeriods.length})
            </p>
            <p className="mt-1 text-sm text-amber-900">
              {balance.unpaidPeriods.map(periodLabel).join(' · ')}
            </p>
          </div>
        )}

        <div className="avoid-break overflow-hidden rounded-xl border border-navy-200">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-left text-xs font-bold text-navy-600 uppercase">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Objet</th>
                <th className="px-3 py-2">Détail</th>
                <th className="px-3 py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-navy-500">
                    Aucun versement enregistré pour ce membre.
                  </td>
                </tr>
              )}
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="tnum px-3 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                  <td className="px-3 py-2">{l.label}</td>
                  <td className="px-3 py-2 text-navy-600">
                    {l.kind === 'due' ? periodLabel(l.detail) : l.detail}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {formatXOF(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            {lines.length > 0 && (
              <tfoot className="bg-navy-50 font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right">
                    Total versé
                  </td>
                  <td className="tnum px-3 py-2 text-right whitespace-nowrap">
                    {formatXOF(totalPaid)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="mt-3 hidden text-xs print:block">
          <p>
            Reçu établi par le Trésorier Général
            {db.association.treasurerName ? ` — ${db.association.treasurerName}` : ''}.
          </p>
          <div className="mt-10 flex justify-end">
            <div className="w-56 border-t border-navy-900 pt-1 text-center">
              Signature et cachet
            </div>
          </div>
        </div>

        {lines.length > 0 && (
          <p className="mt-3 text-xs text-navy-500 print:hidden">
            Modes de paiement utilisés :{' '}
            {[...new Set(db.duePayments.filter((p) => p.memberId === member.id).map((p) => p.method))]
              .map(methodLabel)
              .join(', ') || '—'}
          </p>
        )}
      </div>
    </Modal>
  )
}
