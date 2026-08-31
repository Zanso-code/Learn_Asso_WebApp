import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { usePlatform } from '@/lib/platform'
import { useToast } from '@/components/Toast'
import { Button, Field, Modal, PasswordInput } from '@/components/ui'

/**
 * Password gate for the Trésorier role. The account password only ever grants
 * read-only access, so this is the single door to every write action.
 */
export function TreasurerUnlockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { unlockTreasurer } = usePlatform()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setPassword('')
    setError('')
    onClose()
  }

  async function submit() {
    if (busy || !password) return
    setBusy(true)
    const ok = await unlockTreasurer(password)
    setBusy(false)
    if (!ok) {
      setError('Mot de passe Trésorier incorrect.')
      setPassword('')
      return
    }
    toast.success('Mode Trésorier activé — accès complet en écriture')
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Passer en mode Trésorier"
      subtitle="Saisissez le mot de passe Trésorier, distinct de celui du compte."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || !password}>
            <ShieldCheck className="size-4" />
            {busy ? 'Vérification…' : 'Déverrouiller'}
          </Button>
        </>
      }
    >
      <Field label="Mot de passe Trésorier" error={error || undefined}>
        <PasswordInput
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="••••••••"
          autoComplete="current-password"
          autoFocus
        />
      </Field>
      <p className="mt-3 rounded-xl bg-navy-50 px-3.5 py-3 text-xs leading-relaxed text-navy-600">
        Sans ce mot de passe, l'application reste en lecture seule : consultation des tableaux de
        bord, relevés et rapports, sans possibilité de modification.
      </p>
    </Modal>
  )
}
