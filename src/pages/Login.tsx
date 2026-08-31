import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogIn, TriangleAlert } from 'lucide-react'
import { usePlatform } from '@/lib/platform'
import { BrandLockup } from '@/components/BrandLockup'
import { useToast } from '@/components/Toast'
import { Button, Field, PasswordInput, Select } from '@/components/ui'

export function Login() {
  const { comptes, login } = usePlatform()
  const navigate = useNavigate()
  const toast = useToast()

  const [associationId, setAssociationId] = useState(comptes[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!associationId || busy) return
    setBusy(true)
    setError('')
    const ok = await login(associationId, password)
    setBusy(false)
    if (!ok) {
      setError('Mot de passe incorrect.')
      setPassword('')
      return
    }
    const nom = comptes.find((c) => c.id === associationId)?.nom ?? ''
    toast.success(`Connecté — ${nom}`)
    // The subscription guard on /app decides whether the dashboard opens or
    // the "accès expiré" page does.
    navigate('/app', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-navy-50">
      <header className="border-b border-navy-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLockup />
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-semibold text-navy-600 transition hover:text-navy-900"
          >
            <ArrowLeft className="size-4" />
            Accueil
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-sm shadow-navy-900/5 sm:p-8">
            <h1 className="text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">
              Connexion
            </h1>
            <p className="mt-1.5 text-sm text-navy-600">
              Accédez à l'espace de votre association.
            </p>

            {comptes.length === 0 ? (
              <div className="mt-6">
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-amber-800">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  Aucune association n'est enregistrée sur cet appareil. Créez-en une pour
                  commencer.
                </p>
                <Button full className="mt-4" onClick={() => navigate('/')}>
                  Créer mon association
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                <Field label="Association">
                  <Select
                    value={associationId}
                    onChange={(e) => {
                      setAssociationId(e.target.value)
                      setError('')
                    }}
                  >
                    {comptes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sigle ? `${c.sigle} — ${c.nom}` : c.nom}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Mot de passe du compte" error={error || undefined}>
                  <PasswordInput
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError('')
                    }}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    autoFocus
                  />
                </Field>

                <Button type="submit" full disabled={busy || !password}>
                  <LogIn className="size-4" />
                  {busy ? 'Vérification…' : 'Se connecter'}
                </Button>

                <p className="rounded-xl bg-navy-50 px-3.5 py-3 text-xs leading-relaxed text-navy-600">
                  Vous entrez en mode <strong>Président / Secrétaire</strong> (lecture seule). Le
                  rôle <strong>Trésorier</strong> se déverrouille ensuite avec son propre mot de
                  passe.
                </p>
              </form>
            )}
          </div>

          <p className="mt-5 text-center text-sm text-navy-600">
            Pas encore de compte ?{' '}
            <Link to="/" className="font-semibold text-brand-700 hover:underline">
              Créer mon association
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
