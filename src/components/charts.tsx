import { useId, useState } from 'react'
import type { MonthlyPoint, CategoryTotal } from '@/lib/selectors'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import { EXPENSE_COLORS, INCOME_COLOR, EXPENSE_COLOR } from '@/lib/palette'
import { MONTHS_SHORT, formatXOF, periodLabel } from '@/lib/format'
import { cx } from './ui'

function shortMonth(period: string): string {
  return MONTHS_SHORT[Number(period.slice(5, 7)) - 1]
}

/** Compact axis ticks: 1 250 000 → "1,25 M", 75 000 → "75 k". */
function tickLabel(n: number): string {
  const v = Math.abs(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace('.', ',')} M`
  if (v >= 1000) return `${Math.round(v / 1000)} k`
  return String(v)
}

/**
 * Recettes vs Dépenses per month, diverging about a zero line.
 *
 * Direction is the primary encoding — income above, expense below — so the pair
 * stays readable for a colour-blind reader; the blue/red pairing only
 * reinforces the app's existing semantics.
 */
export function IncomeExpenseChart({ data }: { data: MonthlyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const clipId = useId()

  const peak = Math.max(1, ...data.map((d) => Math.max(d.income, d.expenses)))

  // Geometry in a fixed viewBox; the SVG scales to its container.
  const W = 560
  const H = 220
  const PAD_L = 44
  const PAD_R = 8
  const PAD_T = 12
  const PAD_B = 26
  const mid = PAD_T + (H - PAD_T - PAD_B) / 2
  const half = (H - PAD_T - PAD_B) / 2 - 6

  const slot = (W - PAD_L - PAD_R) / Math.max(1, data.length)
  const barW = Math.min(26, slot * 0.46)
  const R = 4 // rounded data-end

  const scale = (v: number) => (v / peak) * half

  /** Bar with rounded outer end, square against the zero baseline. */
  function barPath(x: number, len: number, up: boolean): string {
    const h = Math.max(len, 2)
    const r = Math.min(R, h, barW / 2)
    return up
      ? `M${x},${mid} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`
      : `M${x},${mid} v${h - r} a${r},${r} 0 0 0 ${r},${r} h${barW - 2 * r} a${r},${r} 0 0 0 ${r},${-r} v${-(h - r)} z`
  }

  const active = hover !== null ? data[hover] : null

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Recettes et dépenses des six derniers mois"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={W} height={H} />
            </clipPath>
          </defs>

          {/* Recessive gridlines at ±½ peak and the zero baseline */}
          {[-1, -0.5, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={mid - half * f}
              y2={mid - half * f}
              stroke="var(--color-navy-200)"
              strokeWidth={1}
            />
          ))}
          {[1, 0.5, -0.5, -1].map((f) => (
            <text
              key={f}
              x={PAD_L - 6}
              y={mid - half * f + 3.5}
              textAnchor="end"
              className="fill-navy-400 text-[9px] font-semibold"
            >
              {tickLabel(peak * f)}
            </text>
          ))}
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={mid}
            y2={mid}
            stroke="var(--color-navy-400)"
            strokeWidth={1.5}
          />

          <g clipPath={`url(#${clipId})`}>
            {data.map((d, i) => {
              const cx0 = PAD_L + slot * i + slot / 2
              const x = cx0 - barW / 2
              const isHover = hover === i
              return (
                <g key={d.period}>
                  {/* Hit target: the whole column, wider than the marks */}
                  <rect
                    x={PAD_L + slot * i}
                    y={PAD_T}
                    width={slot}
                    height={H - PAD_T - PAD_B}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${periodLabel(d.period)} : recettes ${formatXOF(d.income)}, dépenses ${formatXOF(d.expenses)}`}
                  />
                  {isHover && (
                    <rect
                      x={PAD_L + slot * i}
                      y={PAD_T}
                      width={slot}
                      height={H - PAD_T - PAD_B}
                      fill="var(--color-navy-900)"
                      opacity={0.04}
                    />
                  )}
                  <path
                    d={barPath(x, scale(d.income), true)}
                    fill={INCOME_COLOR}
                    opacity={hover === null || isHover ? 1 : 0.45}
                  />
                  <path
                    d={barPath(x, scale(d.expenses), false)}
                    fill={EXPENSE_COLOR}
                    opacity={hover === null || isHover ? 1 : 0.45}
                  />
                  <text
                    x={cx0}
                    y={H - 8}
                    textAnchor="middle"
                    className={cx(
                      'text-[10px] font-bold',
                      isHover ? 'fill-navy-900' : 'fill-navy-500',
                    )}
                  >
                    {shortMonth(d.period)}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {active && (
          <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs shadow-lg">
            <p className="font-bold text-navy-900">{periodLabel(active.period)}</p>
            <p className="mt-1 flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: INCOME_COLOR }}
                aria-hidden
              />
              <span className="text-navy-600">Recettes</span>
              <span className="tnum ml-auto font-semibold text-navy-900">
                {formatXOF(active.income)}
              </span>
            </p>
            <p className="mt-0.5 flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: EXPENSE_COLOR }}
                aria-hidden
              />
              <span className="text-navy-600">Dépenses</span>
              <span className="tnum ml-auto font-semibold text-navy-900">
                {formatXOF(active.expenses)}
              </span>
            </p>
            <p className="mt-1 border-t border-navy-100 pt-1 text-navy-600">
              Solde du mois{' '}
              <span
                className={cx(
                  'tnum font-bold',
                  active.income - active.expenses >= 0 ? 'text-brand-700' : 'text-red-600',
                )}
              >
                {formatXOF(active.income - active.expenses)}
              </span>
            </p>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-navy-600">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: INCOME_COLOR }} aria-hidden />
          Recettes (au-dessus)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: EXPENSE_COLOR }} aria-hidden />
          Dépenses (en-dessous)
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * Share of spend per posting. Every segment is direct-labelled below — the
 * relief required by the palette's contrast warning.
 */
export function ExpenseShareBar({
  data,
  total,
  activeCategory,
  onSelect,
}: {
  data: CategoryTotal[]
  total: number
  activeCategory?: string
  onSelect?: (category: CategoryTotal['category']) => void
}) {
  const label = (c: CategoryTotal['category']) =>
    EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c

  if (data.length === 0) return null

  return (
    <figure className="m-0">
      {/* 2px surface gaps keep adjacent fills from reading as one block */}
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {data.map((d) => (
          <div
            key={d.category}
            className="h-full rounded-full transition-opacity"
            style={{
              width: `${Math.max(d.share * 100, 1.5)}%`,
              background: EXPENSE_COLORS[d.category],
              opacity: activeCategory && activeCategory !== d.category ? 0.3 : 1,
            }}
            title={`${label(d.category)} — ${formatXOF(d.amount)}`}
          />
        ))}
      </div>

      <figcaption className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {data.map((d) => (
          <button
            key={d.category}
            type="button"
            onClick={() => onSelect?.(d.category)}
            className={cx(
              'flex items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition',
              onSelect && 'hover:bg-navy-50',
              activeCategory === d.category && 'bg-navy-100',
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: EXPENSE_COLORS[d.category] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-semibold text-navy-700">
              {label(d.category)}
            </span>
            <span className="tnum shrink-0 font-semibold text-navy-900">
              {formatXOF(d.amount)}
            </span>
            <span className="tnum w-9 shrink-0 text-right text-navy-500">
              {Math.round(d.share * 100)}%
            </span>
          </button>
        ))}
        <p className="mt-1 border-t border-navy-100 pt-1.5 text-xs font-bold text-navy-700 sm:col-span-2">
          Total des dépenses{' '}
          <span className="tnum float-right text-navy-900">{formatXOF(total)}</span>
        </p>
      </figcaption>
    </figure>
  )
}
