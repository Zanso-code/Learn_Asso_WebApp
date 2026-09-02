import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogIn, TriangleAlert } from 'lucide-react'
import { usePlatform } from '@/lib/platform'
import { BrandLockup } from '@/components/BrandLockup'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, PasswordInput } from '@/components/ui'

export function Login() {
  const { login } = usePlatform()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !email) return
    setBusy(true)
    setError('')
    const message = await login(email, password)
    setBusy(false)
    if (message) {
      setError(message)
      setPassword('')
      return
    }
    toast.success('Connecté')
    // Le garde d'abonnement sur /app décide ensuite si le tableau de bord
    // s'ouvre ou si la page « accès expiré » prend la main.
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
              Accédez à l'espace de votre association, depuis n'importe quel appareil.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
              <Field label="E-mail de l'association">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError('')
                  }}
                  placeholder="tresorier@monasso.org"
                  autoComplete="username"
                  autoFocus
                />
              </Field>

              <Field label="Mot de passe du compte">
                <PasswordInput
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </Field>

              {error && (
                <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}

              <Button type="submit" full disabled={busy || !email || !password}>
                <LogIn className="size-4" />
                {busy ? 'Vérification…' : 'Se connecter'}
              </Button>

              <p className="rounded-xl bg-navy-50 px-3.5 py-3 text-xs leading-relaxed text-navy-600">
                Vous entrez en mode <strong>Président / Secrétaire</strong> (lecture seule). Le
                rôle <strong>Trésorier</strong> se déverrouille ensuite avec son propre mot de
                passe.
              </p>
            </form>
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
