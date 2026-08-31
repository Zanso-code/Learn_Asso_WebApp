import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const STYLES: Record<ToastKind, { ring: string; icon: ReactNode }> = {
  success: {
    ring: 'border-brand-200 bg-white',
    icon: <CheckCircle2 className="size-5 shrink-0 text-brand-600" />,
  },
  error: {
    ring: 'border-red-200 bg-white',
    icon: <TriangleAlert className="size-5 shrink-0 text-red-600" />,
  },
  info: {
    ring: 'border-navy-200 bg-white',
    icon: <Info className="size-5 shrink-0 text-navy-600" />,
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { id, kind, message }])
      window.setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m: string) => toast(m, 'success'),
      error: (m: string) => toast(m, 'error'),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-3 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-navy-900/10 ${STYLES[t.kind].ring}`}
          >
            {STYLES[t.kind].icon}
            <p className="flex-1 text-sm leading-snug font-medium text-navy-800">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="-mr-1 rounded p-0.5 text-navy-400 transition hover:bg-navy-100 hover:text-navy-700"
              aria-label="Fermer"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans un <ToastProvider>')
  return ctx
}
