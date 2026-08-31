import { Link, Navigate, useNavigate } from 'react-router-dom'
import { LockKeyhole, LogOut, MessageCircle, Phone, RefreshCw } from 'lucide-react'
import { usePlatform } from '@/lib/platform'
import { accessBlockReason } from '@/lib/subscription'
import { formatDate, waNumber } from '@/lib/format'
import { Button } from '@/components/ui'

/**
 * Where every association user lands once the subscription lapses. No ledger
 * data is rendered here — only who to call to get access back.
 */
export function AccessExpired() {
  const { account, contact } = usePlatform()
  const navigate = useNavigate()

  if (!account) return <Navigate to="/connexion" replace />

  const reason = accessBlockReason(account)
  // Renewed in the meantime (or opened by hand): send them back to the app.
  if (reason === null) return <Navigate to="/app" replace />

  const suspended = reason === 'suspendu'
  const phone = contact.telephone.trim()
  const email = contact.email.trim()
  const message = `Bonjour ${contact.nom}, je souhaite renouveler l'accès de l'association ${
    account.sigle || account.nom
  } à AssoCaisse.`

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-navy-200 bg-white p-6 text-center shadow-sm shadow-navy-900/5 sm:p-8">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <LockKeyhole className="size-7" />
          </span>

          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">
            {suspended ? 'Accès suspendu' : 'Accès expiré'}
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-navy-600">
            L'accès de <strong className="text-navy-900">{account.nom}</strong>{' '}
            {suspended ? 'a été suspendu' : 'a pris fin'}
            {!suspended && account.date_expiration_acces && (
              <> le {formatDate(account.date_expiration_acces)}</>
            )}
            . Vos données sont conservées : elles seront de nouveau accessibles dès le
            renouvellement.
          </p>

          <div className="mt-6 rounded-2xl border border-navy-200 bg-navy-50 p-5 text-left">
            <p className="text-xs font-bold tracking-wide text-navy-500 uppercase">
              Contactez
            </p>
            <p className="mt-1 text-lg font-extrabold text-navy-900">{contact.nom}</p>

            {phone ? (
              <>
                <p className="tnum mt-1 text-sm font-semibold text-navy-700">
                  +{contact.dialCode} {phone}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <a
                    href={`https://wa.me/${waNumber(contact.dialCode, phone)}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </a>
                  <a
                    href={`tel:+${waNumber(contact.dialCode, phone)}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-navy-300 bg-white px-4 text-sm font-semibold text-navy-800 transition hover:bg-navy-50"
                  >
                    <Phone className="size-4" />
                    Appeler
                  </a>
                </div>
                {email && (
                  <a
                    href={`mailto:${email}?subject=${encodeURIComponent('AssoCaisse — renouvellement')}`}
                    className="mt-2 block text-sm font-semibold break-words text-brand-700 hover:underline"
                  >
                    {email}
                  </a>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-navy-600">
                Rapprochez-vous de votre fournisseur pour renouveler l'abonnement.
              </p>
            )}
          </div>

          <p className="mt-4 text-sm">
            <Link to="/contact" className="font-semibold text-brand-700 hover:underline">
              Voir la page « Nous contacter »
            </Link>
          </p>

          <p className="mt-5 text-xs leading-relaxed text-navy-500">
            Le règlement s'effectue par Orange Money, Moov Money ou Wave. L'accès est réactivé
            manuellement après réception du paiement.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={() => navigate(0)}>
              <RefreshCw className="size-4" />
              J'ai payé — actualiser
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/deconnexion', { replace: true })}
            >
              <LogOut className="size-4" />
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
