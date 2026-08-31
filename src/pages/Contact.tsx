import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Mail,
  MessageCircle,
  Phone,
  Smartphone,
} from 'lucide-react'
import { usePlatform } from '@/lib/platform'
import { PAYMENT_OPERATORS } from '@/lib/notices'
import { waLink, waNumber } from '@/lib/format'
import { Card } from '@/components/ui'
import { BrandLockup } from '@/components/BrandLockup'

/**
 * Public "Nous contacter" page. It is the single published source for the
 * support number, so the renewal notices sent from the admin console can point
 * every association here for the payment proof.
 */
export function Contact() {
  const { contact, session } = usePlatform()
  const navigate = useNavigate()

  const phone = contact.telephone.trim()
  const email = contact.email.trim()
  const message = `Bonjour ${contact.nom}, je vous contacte au sujet de mon abonnement AssoCaisse.`

  return (
    <div className="flex min-h-dvh flex-col bg-navy-50">
      <header className="border-b border-navy-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <BrandLockup />
          <button
            onClick={() => navigate(session ? '/app' : '/')}
            className="flex items-center gap-1.5 text-sm font-semibold text-navy-600 transition hover:text-navy-900"
          >
            <ArrowLeft className="size-4" />
            {session ? 'Retour à l’application' : 'Accueil'}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
          Nous contacter
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-600 sm:text-base">
          Une question sur votre abonnement, un renouvellement à valider ou un souci technique ?
          Écrivez-nous, nous répondons directement sur WhatsApp.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* ------------------------------------------------------ Contact */}
          <Card className="p-5">
            <p className="text-xs font-bold tracking-wide text-navy-500 uppercase">Votre contact</p>
            <p className="mt-1 text-xl font-extrabold text-navy-900">{contact.nom}</p>

            <dl className="mt-4 grid gap-3 text-sm">
              {phone && (
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 size-4 shrink-0 text-navy-400" />
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold text-navy-500">
                      Téléphone / WhatsApp
                    </dt>
                    <dd className="tnum font-bold break-words text-navy-900">
                      +{contact.dialCode} {phone}
                    </dd>
                  </div>
                </div>
              )}
              {email && (
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-navy-400" />
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold text-navy-500">Adresse e-mail</dt>
                    <dd className="font-bold break-words text-navy-900">{email}</dd>
                  </div>
                </div>
              )}
            </dl>

            {!phone && !email && (
              <p className="mt-4 rounded-xl bg-navy-50 px-3.5 py-3 text-sm leading-relaxed text-navy-600">
                Les coordonnées de votre fournisseur ne sont pas encore renseignées.
              </p>
            )}

            <div className="mt-5 grid gap-2">
              {phone && (
                <>
                  <a
                    href={waLink(contact.dialCode, phone, message)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    <MessageCircle className="size-4" />
                    Écrire sur WhatsApp
                  </a>
                  <a
                    href={`tel:+${waNumber(contact.dialCode, phone)}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-navy-300 bg-white px-4 text-sm font-semibold text-navy-800 transition hover:bg-navy-50"
                  >
                    <Phone className="size-4" />
                    Appeler
                  </a>
                </>
              )}
              {email && (
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent('AssoCaisse — abonnement')}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-navy-300 bg-white px-4 text-sm font-semibold text-navy-800 transition hover:bg-navy-50"
                >
                  <Mail className="size-4" />
                  Envoyer un e-mail
                </a>
              )}
            </div>
          </Card>

          {/* ----------------------------------------------------- Renewal */}
          <Card className="p-5">
            <p className="text-xs font-bold tracking-wide text-navy-500 uppercase">
              Renouveler l'abonnement
            </p>
            <ol className="mt-3 grid gap-4">
              {[
                {
                  icon: Smartphone,
                  title: 'Effectuez le paiement',
                  text: `Réglez le montant convenu par ${PAYMENT_OPERATORS}${
                    phone ? ` au +${contact.dialCode} ${phone}` : ''
                  }.`,
                },
                {
                  icon: Camera,
                  title: 'Envoyez la preuve',
                  text: `Transmettez une capture d'écran du message de confirmation Mobile Money par WhatsApp${
                    phone ? ` au +${contact.dialCode} ${phone}` : ''
                  }.`,
                },
                {
                  icon: MessageCircle,
                  title: 'Accès réactivé',
                  text: "Dès réception de la capture, l'accès de votre association est rétabli et vos données vous sont rendues intactes.",
                },
              ].map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-extrabold text-brand-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
                      <Icon className="size-4 text-brand-600" />
                      {title}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-navy-500">
          Le paiement s'effectue hors de l'application : AssoCaisse n'enregistre aucune donnée
          bancaire et ne prélève rien automatiquement.
        </p>
      </main>

      <footer className="border-t border-navy-200 bg-white py-6">
        <p className="text-center text-xs text-navy-500">
          AssoCaisse — gestion d'associations, ONG, amicales et tontines. Montants en F CFA (XOF).
        </p>
      </footer>
    </div>
  )
}
