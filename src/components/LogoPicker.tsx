import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { compressLogo, formatBytes } from '@/lib/image'
import { useToast } from '@/components/Toast'
import { Button, cx } from '@/components/ui'

/**
 * Optional association logo. Always compressed client-side before it is stored:
 * the ledger lives in localStorage, where an untouched phone photo would eat
 * the whole quota on its own.
 */
export function LogoPicker({
  value,
  onChange,
  disabled,
}: {
  value?: string
  onChange: (dataUrl: string | undefined) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function handle(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const result = await compressLogo(file)
      onChange(result.dataUrl)
      toast.success(`Logo ajouté (${formatBytes(result.bytes)})`)
    } catch (err) {
      console.error(err)
      toast.error("Image illisible. Essayez un fichier JPEG ou PNG.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = '' // let the same file be re-picked
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className={cx(
          'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border',
          value ? 'border-navy-200 bg-white' : 'border-dashed border-navy-300 bg-navy-50',
        )}
      >
        {value ? (
          <img src={value} alt="Logo de l'association" className="size-full object-contain" />
        ) : (
          <ImagePlus className="size-6 text-navy-400" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {value ? 'Remplacer' : 'Choisir une image'}
          </Button>
          {value && !disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
              <Trash2 className="size-4" />
              Retirer
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-navy-500">
          Facultatif — JPEG ou PNG, réduit automatiquement.
        </p>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => void handle(e.target.files?.[0])}
      />
    </div>
  )
}
