import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { formatNumber, parseAmount } from '@/lib/format'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-navy-900 text-white shadow-sm hover:bg-navy-800 active:bg-navy-900',
  outline: 'border border-navy-300 bg-white text-navy-800 hover:bg-navy-50 active:bg-navy-100',
  ghost: 'text-navy-600 hover:bg-navy-100 hover:text-navy-900',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-13 px-6 text-base gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  full?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-semibold whitespace-nowrap transition',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    />
  )
}

/* -------------------------------------------------------------------- Card */

export function Card({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-navy-200 bg-white shadow-sm shadow-navy-900/5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-navy-100 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold text-navy-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------- Badge */

type Tone = 'brand' | 'navy' | 'amber' | 'red' | 'violet' | 'slate'

const TONES: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  navy: 'bg-navy-100 text-navy-700 border-navy-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  slate: 'bg-navy-50 text-navy-500 border-navy-200',
}

export function Badge({
  children,
  tone = 'navy',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function toneForCategory(color: string): Tone {
  return (['brand', 'navy', 'amber', 'violet', 'red', 'slate'] as Tone[]).includes(color as Tone)
    ? (color as Tone)
    : 'navy'
}

/* ------------------------------------------------------------------ Fields */

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-navy-700">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-navy-500">{hint}</span>
      ) : null}
    </label>
  )
}

const CONTROL =
  'w-full rounded-xl border border-navy-300 bg-white px-3.5 text-[16px] text-navy-900 placeholder:text-navy-400 ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none disabled:bg-navy-50 sm:text-sm'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, 'h-11', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'min-h-20 py-2.5', className)} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL, 'h-11 pr-8', className)} {...rest} />
}

/** Money input: shows grouped digits, reports a plain integer. */
export function AmountInput({
  value,
  onValueChange,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number
  onValueChange: (n: number) => void
}) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={value ? formatNumber(value) : ''}
        onChange={(e) => onValueChange(parseAmount(e.target.value))}
        className={cx(CONTROL, 'tnum h-11 pr-16 font-semibold', className)}
        placeholder="0"
        {...rest}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-navy-400">
        FCFA
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
  printable,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Print this dialog alone, without the page behind it. */
  printable?: boolean
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (printable) document.body.classList.add('printing-modal')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      document.body.classList.remove('printing-modal')
    }
  }, [open, onClose, printable])

  if (!open) return null

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4',
        printable ? 'print:static print:block' : 'no-print',
      )}
    >
      <div
        className="no-print absolute inset-0 bg-navy-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'animate-sheet-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          printable && 'print-root print:max-h-none print:overflow-visible print:shadow-none',
        )}
      >
        <div className="no-print flex items-start justify-between gap-3 border-b border-navy-100 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-bold text-navy-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-navy-400 transition hover:bg-navy-100 hover:text-navy-900"
            aria-label="Fermer"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          className={cx(
            'min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5',
            printable && 'print:overflow-visible print:p-0',
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="no-print flex items-center justify-end gap-2 border-t border-navy-100 bg-navy-50/60 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------- Misc bits */

export function Progress({
  value,
  max,
  tone = 'brand',
}: {
  value: number
  max: number
  tone?: 'brand' | 'amber'
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-navy-200"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-500',
          tone === 'brand' ? 'bg-brand-600' : 'bg-amber-500',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-navy-100 text-navy-400">
        {icon}
      </div>
      <h3 className="text-base font-bold text-navy-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-navy-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-navy-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Avatar({ name, tone = 'brand' }: { name: string; tone?: Tone }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <div
      className={cx(
        'flex size-10 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
        TONES[tone],
      )}
      aria-hidden
    >
      {letters}
    </div>
  )
}
