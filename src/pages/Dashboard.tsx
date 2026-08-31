import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  FileText,
  HandCoins,
  Receipt,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react'
import { useDB } from '@/lib/store'
import {
  arrears,
  campaignRaised,
  expensesByCategory,
  monthlySeries,
  totals,
} from '@/lib/selectors'
import { formatDate, formatXOF, periodLabel } from '@/lib/format'
import { ExpenseShareBar, IncomeExpenseChart } from '@/components/charts'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Progress, cx } from '@/components/ui'

export function Dashboard() {
  const { db, role } = useDB()

  const t = useMemo(() => totals(db), [db])
  const series = useMemo(() => monthlySeries(db, 6), [db])
  const breakdown = useMemo(() => expensesByCategory(db), [db])
  const owing = useMemo(() => arrears(db), [db])

  const recentExpenses = useMemo(
    () => [...db.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [db.expenses],
  )

  const hasData = db.members.length > 0 || db.expenses.length > 0

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${db.association.name} · ${role === 'treasurer' ? 'Trésorier Général' : 'Consultation'}`}
      />

      {/* ------------------------------------ The treasurer's four key numbers */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KeyNumber
          label="Recettes encaissées"
          value={t.income}
          tone="brand"
          icon={<ArrowUpRight className="size-4.5" />}
          detail={`${formatXOF(t.dues)} de cotisations · ${formatXOF(t.contributions)} de campagnes`}
        />
        <KeyNumber
          label="Dépenses engagées"
          value={t.expenses}
          tone="red"
          icon={<TrendingDown className="size-4.5" />}
          detail={`${db.expenses.length} décaissement${db.expenses.length > 1 ? 's' : ''} enregistré${db.expenses.length > 1 ? 's' : ''}`}
        />
        <KeyNumber
          label="Trésorerie actuelle"
          value={t.balance}
          tone={t.balance >= 0 ? 'navy' : 'red'}
          icon={<Wallet className="size-4.5" />}
          detail="Recettes moins dépenses"
          emphasis
        />
        <KeyNumber
          label="Impayés à recouvrer"
          value={t.outstanding}
          tone={t.outstanding > 0 ? 'amber' : 'brand'}
          icon={<AlertTriangle className="size-4.5" />}
          detail={
            owing.length > 0
              ? `${owing.length} membre${owing.length > 1 ? 's' : ''} en retard`
              : 'Tous les membres sont à jour'
          }
        />
      </div>

      {!hasData ? (
        <Card>
          <EmptyState
            icon={<Users className="size-7" />}
            title="Votre association est prête"
            description="Commencez par inscrire vos membres, puis enregistrez les cotisations et les dépenses. Les quatre chiffres ci-dessus se mettront à jour automatiquement."
            action={
              <Link to="/app/membres">
                <Button>
                  <Users className="size-4" />
                  Ajouter les membres
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* ------------------------------------------------- Monthly trend */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Recettes et dépenses"
              subtitle="Six derniers mois — l'axe zéro sépare ce qui entre de ce qui sort"
            />
            <div className="p-4">
              <IncomeExpenseChart data={series} />
            </div>
          </Card>

          {/* --------------------------------------------------- Memberships */}
          <Card>
            <CardHeader title="Effectif" subtitle="Répartition par catégorie" />
            <div className="p-4">
              <div className="mb-4 flex items-baseline gap-3">
                <p className="text-3xl font-extrabold text-navy-900">{t.activeMembers}</p>
                <p className="text-sm font-semibold text-navy-500">
                  membres actifs
                  {t.inactiveMembers > 0 && ` · ${t.inactiveMembers} inactifs`}
                </p>
              </div>

              <ul className="space-y-2.5">
                {db.categories.map((c) => {
                  const count = db.members.filter((m) => m.categoryId === c.id && m.active).length
                  const share = t.activeMembers > 0 ? count / t.activeMembers : 0
                  return (
                    <li key={c.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-navy-700">{c.name}</span>
                        <span className="tnum shrink-0 text-navy-500">
                          {count} · {formatXOF(c.monthlyAmount)}/mois
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-navy-100">
                        <div
                          className="h-full rounded-full bg-navy-700"
                          style={{ width: `${share * 100}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>

              <Link
                to="/app/membres"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-navy-200 py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50"
              >
                Ouvrir le registre
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </Card>

          {/* ------------------------------------------------------- Arrears */}
          <Card>
            <CardHeader
              title="Principaux impayés"
              subtitle={owing.length > 0 ? `${formatXOF(t.outstanding)} au total` : undefined}
              action={
                owing.length > 0 ? (
                  <Badge tone="red">{owing.length}</Badge>
                ) : (
                  <Badge tone="brand">À jour</Badge>
                )
              }
            />
            {owing.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-navy-500">
                Aucun membre en retard de cotisation.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-navy-100">
                  {owing.slice(0, 5).map((b) => (
                    <li key={b.member.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy-900">
                          {b.member.fullName}
                        </p>
                        <p className="truncate text-xs text-navy-500">
                          {b.unpaidPeriods.length} mois ·{' '}
                          {b.unpaidPeriods.slice(0, 2).map(periodLabel).join(', ')}
                          {b.unpaidPeriods.length > 2 && '…'}
                        </p>
                      </div>
                      <p className="tnum shrink-0 text-sm font-extrabold text-red-600">
                        {formatXOF(b.balance)}
                      </p>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/app/cotisations"
                  className="flex items-center justify-center gap-1.5 border-t border-navy-100 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  Relancer les retardataires
                  <ArrowRight className="size-4" />
                </Link>
              </>
            )}
          </Card>

          {/* ----------------------------------------------------- Campaigns */}
          <Card>
            <CardHeader title="Campagnes en cours" />
            {db.campaigns.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-navy-500">
                Aucune cotisation extraordinaire en cours.
              </p>
            ) : (
              <>
                <ul className="space-y-4 p-4">
                  {db.campaigns.slice(0, 3).map((c) => {
                    const raised = campaignRaised(db, c.id)
                    const pct = c.targetAmount > 0 ? (raised / c.targetAmount) * 100 : 0
                    return (
                      <li key={c.id}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-bold text-navy-900">{c.title}</p>
                          <span className="tnum shrink-0 text-xs font-bold text-navy-600">
                            {Math.round(pct)}%
                          </span>
                        </div>
                        <Progress
                          value={raised}
                          max={c.targetAmount}
                          tone={pct >= 100 ? 'brand' : 'amber'}
                        />
                        <p className="tnum mt-1 text-xs text-navy-500">
                          {formatXOF(raised)} sur {formatXOF(c.targetAmount)}
                        </p>
                      </li>
                    )
                  })}
                </ul>
                <Link
                  to="/app/campagnes"
                  className="flex items-center justify-center gap-1.5 border-t border-navy-100 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  Toutes les campagnes
                  <ArrowRight className="size-4" />
                </Link>
              </>
            )}
          </Card>

          {/* ------------------------------------------------------ Expenses */}
          <Card>
            <CardHeader title="Dépenses par poste" />
            {breakdown.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-navy-500">
                Aucune dépense enregistrée.
              </p>
            ) : (
              <div className="p-4">
                <ExpenseShareBar data={breakdown} total={t.expenses} />
              </div>
            )}
          </Card>

          {/* ------------------------------------------------ Recent activity */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Derniers décaissements"
              action={
                <Link
                  to="/app/depenses"
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  Tout voir
                </Link>
              }
            />
            {recentExpenses.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-navy-500">
                Aucune dépense enregistrée.
              </p>
            ) : (
              <ul className="divide-y divide-navy-100">
                {recentExpenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                      <Receipt className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-900">{e.label}</p>
                      <p className="truncate text-xs text-navy-500">
                        {formatDate(e.date)}
                        {e.beneficiary && ` · ${e.beneficiary}`}
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-sm font-bold text-red-600">
                      {formatXOF(e.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* -------------------------------------------------------- AG CTA */}
          <Card className="flex flex-col justify-between bg-navy-900 p-5 text-white">
            <div>
              <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-brand-300">
                <FileText className="size-5.5" />
              </span>
              <h3 className="mt-4 text-base font-bold">Rapport d'Assemblée Générale</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-navy-300">
                Bilan financier complet, dépenses par poste, état des impayés et blocs de
                signature — prêt à imprimer en A4.
              </p>
            </div>
            <Link to="/app/rapport" className="mt-5">
              <Button full>
                Générer le rapport
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------- Mobile quick actions */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:hidden">
        {[
          { to: '/app/membres', label: 'Membres', icon: Users },
          { to: '/app/cotisations', label: 'Cotisations', icon: Wallet },
          { to: '/app/campagnes', label: 'Campagnes', icon: HandCoins },
          { to: '/app/depenses', label: 'Dépenses', icon: Receipt },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-navy-200 bg-white py-4 text-xs font-bold text-navy-700 transition hover:bg-navy-50"
          >
            <Icon className="size-5 text-brand-600" />
            {label}
          </Link>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------- Key numbers */

const KEY_TONE = {
  brand: { chip: 'bg-brand-50 text-brand-700', value: 'text-brand-700' },
  red: { chip: 'bg-red-50 text-red-600', value: 'text-red-600' },
  amber: { chip: 'bg-amber-50 text-amber-700', value: 'text-amber-700' },
  navy: { chip: 'bg-navy-900 text-white', value: 'text-navy-900' },
}

function KeyNumber({
  label,
  value,
  detail,
  tone,
  icon,
  emphasis,
}: {
  label: string
  value: number
  detail: string
  tone: keyof typeof KEY_TONE
  icon: React.ReactNode
  emphasis?: boolean
}) {
  return (
    <Card className={cx('p-3.5 sm:p-4', emphasis && 'ring-2 ring-navy-900/10')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-tight font-semibold text-navy-500">{label}</p>
        <span
          className={cx(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            KEY_TONE[tone].chip,
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cx(
          'tnum mt-2 text-xl leading-tight font-extrabold sm:text-2xl',
          KEY_TONE[tone].value,
        )}
      >
        {formatXOF(value)}
      </p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-navy-500">{detail}</p>
    </Card>
  )
}
