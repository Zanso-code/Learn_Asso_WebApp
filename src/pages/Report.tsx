import { useMemo, useState } from 'react'
import { Printer, Settings2 } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import { useDB } from '@/lib/store'
import {
  arrears,
  campaignRaised,
  expensesByCategory,
  totals,
} from '@/lib/selectors'
import {
  currentPeriod,
  formatDate,
  formatDateLong,
  formatXOF,
  periodLabel,
  periodRange,
  todayISO,
} from '@/lib/format'
import { Button, Card, Field, Input, Modal, PageHeader, Select, cx } from '@/components/ui'

function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export function Report() {
  const store = useDB()
  const { db } = store
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [from, setFrom] = useState(db.association.fiscalStart)
  const [to, setTo] = useState(currentPeriod())

  const periods = useMemo(() => (from <= to ? periodRange(from, to) : []), [from, to])
  const periodSet = useMemo(() => new Set(periods), [periods])

  /** The report is scoped to the exercise; totals() covers all time. */
  const scoped = useMemo(() => {
    const dues = db.duePayments.filter((p) => periodSet.has(p.date.slice(0, 7)))
    const contributions = db.contributions.filter((c) => periodSet.has(c.date.slice(0, 7)))
    const expenses = db.expenses.filter((e) => periodSet.has(e.date.slice(0, 7)))
    const duesTotal = dues.reduce((s, p) => s + p.amount, 0)
    const contribTotal = contributions.reduce((s, c) => s + c.amount, 0)
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
    return {
      dues,
      contributions,
      expenses,
      duesTotal,
      contribTotal,
      expenseTotal,
      income: duesTotal + contribTotal,
      balance: duesTotal + contribTotal - expenseTotal,
    }
  }, [db, periodSet])

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of scoped.expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    return [...map.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [scoped.expenses])

  const owing = useMemo(() => arrears(db), [db])
  const globalTotals = useMemo(() => totals(db), [db])
  const allTimeBreakdown = useMemo(() => expensesByCategory(db), [db])

  const heading = periods.length
    ? `Exercice du ${periodLabel(periods[0])} au ${periodLabel(periods[periods.length - 1])}`
    : 'Période invalide'

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Rapport financier d'AG"
          subtitle="Document de reddition des comptes, prêt à imprimer en A4"
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="size-4" />
                <span className="hidden sm:inline">En-tête</span>
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" />
                Imprimer / PDF
              </Button>
            </div>
          }
        />

        <Card className="mb-4 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Début de l'exercice">
              <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Fin de l'exercice">
              <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-navy-500">
            Le rapport ne retient que les mouvements datés dans cette période. L'état des impayés
            reflète la situation cumulée à ce jour.
          </p>
        </Card>
      </div>

      {/* ================================================= The printed report */}
      <Card className="print-root mx-auto max-w-[210mm] p-6 sm:p-10">
        <header className="avoid-break border-b-2 border-navy-900 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              {db.association.logo && (
                <img
                  src={db.association.logo}
                  alt=""
                  className="size-16 shrink-0 object-contain"
                />
              )}
              <div>
              <h1 className="text-xl leading-tight font-extrabold text-navy-900 sm:text-2xl">
                {db.association.name}
              </h1>
              {db.association.acronym && (
                <p className="text-sm font-bold text-navy-600">({db.association.acronym})</p>
              )}
              <p className="mt-1 text-sm text-navy-600">
                {[db.association.city, db.association.country].filter(Boolean).join(', ')}
              </p>
              </div>
            </div>
            <div className="text-right text-xs text-navy-600">
              <p className="font-bold text-navy-900">Document interne</p>
              <p>Édité le {formatDateLong(todayISO())}</p>
            </div>
          </div>

          <h2 className="mt-5 text-center text-base font-extrabold tracking-wide text-navy-900 uppercase sm:text-lg">
            Rapport financier — Assemblée Générale
          </h2>
          <p className="mt-1 text-center text-sm font-semibold text-navy-600">{heading}</p>
        </header>

        {/* ------------------------------------------------- 1. Balance sheet */}
        <Section number={1} title="Synthèse financière de l'exercice">
          <table className="w-full text-sm">
            <tbody>
              <Row label="Cotisations mensuelles encaissées" value={scoped.duesTotal} />
              <Row label="Cotisations extraordinaires collectées" value={scoped.contribTotal} />
              <Row label="TOTAL DES RECETTES" value={scoped.income} strong />
              <Row label="Total des dépenses engagées" value={-scoped.expenseTotal} />
              <Row
                label="RÉSULTAT DE L'EXERCICE"
                value={scoped.balance}
                strong
                highlight
              />
            </tbody>
          </table>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Trésorerie cumulée à ce jour"
              value={formatXOF(globalTotals.balance)}
              hint="Toutes périodes confondues"
            />
            <Metric
              label="Impayés à recouvrer"
              value={formatXOF(globalTotals.outstanding)}
              hint={`${owing.length} membre${owing.length > 1 ? 's' : ''} concerné${owing.length > 1 ? 's' : ''}`}
            />
            <Metric
              label="Effectif"
              value={`${globalTotals.activeMembers} actifs`}
              hint={`${globalTotals.inactiveMembers} inactifs · ${db.members.length} inscrits`}
            />
          </div>
        </Section>

        {/* ------------------------------------------------ 2. Expense detail */}
        <Section number={2} title="Détail des dépenses par poste">
          {byCategory.length === 0 ? (
            <p className="text-sm text-navy-500">Aucune dépense sur la période retenue.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-300 text-left text-xs font-bold text-navy-600 uppercase">
                  <th className="py-1.5">Poste de dépense</th>
                  <th className="py-1.5 text-center">Nombre</th>
                  <th className="py-1.5 text-right">Montant</th>
                  <th className="py-1.5 text-right">Part</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {byCategory.map((b) => (
                  <tr key={b.category}>
                    <td className="py-1.5">{categoryLabel(b.category)}</td>
                    <td className="tnum py-1.5 text-center">
                      {scoped.expenses.filter((e) => e.category === b.category).length}
                    </td>
                    <td className="tnum py-1.5 text-right font-semibold">{formatXOF(b.amount)}</td>
                    <td className="tnum py-1.5 text-right text-navy-600">
                      {Math.round((b.amount / (scoped.expenseTotal || 1)) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy-900 font-extrabold">
                  <td className="py-2">TOTAL</td>
                  <td className="tnum py-2 text-center">{scoped.expenses.length}</td>
                  <td className="tnum py-2 text-right">{formatXOF(scoped.expenseTotal)}</td>
                  <td className="tnum py-2 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          )}

          {scoped.expenses.length > 0 && (
            <>
              <h4 className="mt-5 mb-2 text-xs font-bold text-navy-600 uppercase">
                Journal des décaissements
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-300 text-left font-bold text-navy-600 uppercase">
                    <th className="py-1.5">Date</th>
                    <th className="py-1.5">Objet</th>
                    <th className="py-1.5">Bénéficiaire</th>
                    <th className="py-1.5">Poste</th>
                    <th className="py-1.5 text-center">Pièce</th>
                    <th className="py-1.5 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {[...scoped.expenses]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((e) => (
                      <tr key={e.id}>
                        <td className="tnum py-1.5 whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="py-1.5">{e.label}</td>
                        <td className="py-1.5 text-navy-600">{e.beneficiary || '—'}</td>
                        <td className="py-1.5 text-navy-600">{categoryLabel(e.category)}</td>
                        <td className="py-1.5 text-center">{e.receiptKey ? 'Oui' : '—'}</td>
                        <td className="tnum py-1.5 text-right font-semibold whitespace-nowrap">
                          {formatXOF(e.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        {/* -------------------------------------------------- 3. Campaigns */}
        {db.campaigns.length > 0 && (
          <Section number={3} title="Cotisations extraordinaires">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-300 text-left text-xs font-bold text-navy-600 uppercase">
                  <th className="py-1.5">Campagne</th>
                  <th className="py-1.5 text-right">Objectif</th>
                  <th className="py-1.5 text-right">Collecté</th>
                  <th className="py-1.5 text-right">Taux</th>
                  <th className="py-1.5 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {db.campaigns.map((c) => {
                  const raised = campaignRaised(db, c.id)
                  return (
                    <tr key={c.id}>
                      <td className="py-1.5 font-medium">{c.title}</td>
                      <td className="tnum py-1.5 text-right">{formatXOF(c.targetAmount)}</td>
                      <td className="tnum py-1.5 text-right font-semibold">{formatXOF(raised)}</td>
                      <td className="tnum py-1.5 text-right">
                        {c.targetAmount > 0 ? Math.round((raised / c.targetAmount) * 100) : 0}%
                      </td>
                      <td className="py-1.5 text-center">
                        {c.status === 'open' ? 'Ouverte' : 'Clôturée'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>
        )}

        {/* ---------------------------------------------------- 4. Arrears */}
        <Section
          number={db.campaigns.length > 0 ? 4 : 3}
          title="État des cotisations impayées"
        >
          {owing.length === 0 ? (
            <p className="text-sm text-navy-600">
              Aucun arriéré : l'ensemble des membres actifs est à jour de ses cotisations.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-300 text-left text-xs font-bold text-navy-600 uppercase">
                  <th className="py-1.5">N°</th>
                  <th className="py-1.5">Membre</th>
                  <th className="py-1.5">Catégorie</th>
                  <th className="py-1.5 text-center">Mois dus</th>
                  <th className="py-1.5 text-right">Solde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {owing.map((b, i) => (
                  <tr key={b.member.id}>
                    <td className="tnum py-1.5 text-navy-500">{i + 1}</td>
                    <td className="py-1.5 font-medium">{b.member.fullName}</td>
                    <td className="py-1.5 text-navy-600">{b.category?.name ?? '—'}</td>
                    <td className="tnum py-1.5 text-center">{b.unpaidPeriods.length}</td>
                    <td className="tnum py-1.5 text-right font-semibold">
                      {formatXOF(b.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy-900 font-extrabold">
                  <td colSpan={4} className="py-2">
                    TOTAL DES IMPAYÉS
                  </td>
                  <td className="tnum py-2 text-right">{formatXOF(globalTotals.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Section>

        {/* ------------------------------------------- 5. Cumulative position */}
        <Section
          number={db.campaigns.length > 0 ? 5 : 4}
          title="Situation cumulée depuis l'origine"
        >
          <table className="w-full text-sm">
            <tbody>
              <Row label="Cotisations mensuelles (toutes périodes)" value={globalTotals.dues} />
              <Row label="Cotisations extraordinaires" value={globalTotals.contributions} />
              <Row label="Total des recettes" value={globalTotals.income} strong />
              <Row label="Total des dépenses" value={-globalTotals.expenses} />
              <Row label="TRÉSORERIE DISPONIBLE" value={globalTotals.balance} strong highlight />
            </tbody>
          </table>

          {allTimeBreakdown.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-navy-600">
              Poste de dépense principal :{' '}
              <strong>{categoryLabel(allTimeBreakdown[0].category)}</strong> (
              {formatXOF(allTimeBreakdown[0].amount)}, soit{' '}
              {Math.round(allTimeBreakdown[0].share * 100)}% du total dépensé).
            </p>
          )}
        </Section>

        {/* ----------------------------------------------------- Signatures */}
        <div className="avoid-break mt-10 border-t border-navy-200 pt-6">
          <p className="mb-8 text-xs leading-relaxed text-navy-600">
            Le présent rapport a été établi sur la base des pièces justificatives détenues par la
            trésorerie et soumis à l'approbation de l'Assemblée Générale.
          </p>

          <div className="grid grid-cols-2 gap-10">
            {[
              ['Le Trésorier Général', db.association.treasurerName],
              ['Le Président', db.association.presidentName],
            ].map(([role, name]) => (
              <div key={role}>
                <p className="text-sm font-bold text-navy-900">{role}</p>
                {name && <p className="text-sm text-navy-600">{name}</p>}
                <div className="mt-16 border-t border-navy-900 pt-1 text-center text-xs text-navy-500">
                  Signature
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-[10px] text-navy-400">
            {db.association.name} — rapport généré le {formatDate(todayISO())} · Montants exprimés
            en francs CFA (XOF)
          </p>
        </div>
      </Card>

      <ReportSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

/* -------------------------------------------------------------- Fragments */

function Section({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="avoid-break mt-7">
      <h3 className="mb-2.5 flex items-center gap-2 border-b border-navy-200 pb-1.5 text-sm font-extrabold tracking-wide text-navy-900 uppercase">
        <span className="flex size-5 items-center justify-center rounded bg-navy-900 text-[11px] text-white">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({
  label,
  value,
  strong,
  highlight,
}: {
  label: string
  value: number
  strong?: boolean
  highlight?: boolean
}) {
  return (
    <tr
      className={cx(
        'border-b border-navy-100',
        strong && 'border-t-2 border-t-navy-900 font-extrabold',
      )}
    >
      <td className={cx('py-2', highlight && 'text-navy-900')}>{label}</td>
      <td
        className={cx(
          'tnum py-2 text-right whitespace-nowrap',
          highlight && (value >= 0 ? 'text-brand-700' : 'text-red-600'),
        )}
      >
        {formatXOF(value)}
      </td>
    </tr>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-navy-200 p-3">
      <p className="text-[11px] font-semibold text-navy-500">{label}</p>
      <p className="tnum mt-0.5 text-sm font-extrabold text-navy-900">{value}</p>
      <p className="mt-0.5 text-[10px] text-navy-500">{hint}</p>
    </div>
  )
}

function ReportSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useDB()
  const { db, isTreasurer } = store
  const a = db.association

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="En-tête et signataires"
      subtitle="Ces informations apparaissent sur le rapport imprimé."
      footer={<Button onClick={onClose}>Terminé</Button>}
    >
      <div className="grid gap-4">
        <Field label="Nom de l'association">
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
              placeholder="Nom et prénom"
              disabled={!isTreasurer}
            />
          </Field>
          <Field label="Président">
            <Input
              value={a.presidentName}
              onChange={(e) => store.updateAssociation({ presidentName: e.target.value })}
              placeholder="Nom et prénom"
              disabled={!isTreasurer}
            />
          </Field>
        </div>
        {!isTreasurer && (
          <p className="rounded-xl bg-navy-50 px-4 py-3 text-xs text-navy-600">
            En mode consultation, l'en-tête n'est pas modifiable.
          </p>
        )}
      </div>
    </Modal>
  )
}
