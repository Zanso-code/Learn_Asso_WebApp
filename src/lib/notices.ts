import type { AssociationAccount, PlatformContact } from './types'
import { formatDate } from './format'
import { effectiveStatus, joursRestants } from './subscription'

/** Mobile money operators accepted for a renewal, in the order customers know them. */
export const PAYMENT_OPERATORS = 'Orange Money, Moov Money, Wave, Télécel Money ou Sank Money'

export type NoticeKind = 'essai' | 'resiliation'

/**
 * A trial that is ending reads very differently from a paid subscription being
 * cut off, so the notice is chosen from the account's own status rather than
 * left to the admin to remember.
 */
export function noticeKindFor(account: AssociationAccount): NoticeKind {
  return account.statut_abonnement === 'essai' ? 'essai' : 'resiliation'
}

function phoneLine(contact: PlatformContact): string {
  const tel = contact.telephone.trim()
  return tel ? `+${contact.dialCode} ${tel}` : ''
}

/** How the deadline should be phrased: still ahead, today, or already past. */
function deadlinePhrase(expiry: string): string {
  const left = joursRestants(expiry)
  if (left < 0) return `a pris fin le ${formatDate(expiry)}`
  if (left === 0) return `prend fin aujourd'hui (${formatDate(expiry)})`
  if (left === 1) return `prend fin demain (${formatDate(expiry)})`
  return `prend fin le ${formatDate(expiry)} (dans ${left} jours)`
}

/**
 * The WhatsApp notice sent to an association about its subscription.
 *
 * Always closes with the payment-proof instruction: the platform has no payment
 * API, so a screenshot of the Mobile Money confirmation sent to the number on
 * the "Nous contacter" page is the only trigger for reactivating access.
 */
export function subscriptionNotice(
  account: AssociationAccount,
  contact: PlatformContact,
): string {
  const kind = noticeKindFor(account)
  const who = account.responsable.trim()
  const greeting = who ? `Bonjour ${who},` : 'Bonjour,'
  const association = account.sigle ? `${account.nom} (${account.sigle})` : account.nom
  const deadline = deadlinePhrase(account.date_expiration_acces)
  const number = phoneLine(contact)
  const blocked = ['expire', 'suspendu'].includes(effectiveStatus(account))

  const opening =
    kind === 'essai'
      ? `Votre période d'essai gratuite d'AssoCaisse pour l'association ${association} ${deadline}.`
      : `L'abonnement AssoCaisse de l'association ${association} ${deadline}.`

  const consequence = blocked
    ? "L'accès à l'application est actuellement suspendu : vos données sont conservées intactes et redeviendront accessibles dès le renouvellement."
    : "Sans renouvellement, l'accès à l'application sera suspendu à cette date. Vos données seront conservées."

  const payment = number
    ? `Pour renouveler, effectuez le paiement par ${PAYMENT_OPERATORS} au ${number}.`
    : `Pour renouveler, contactez-nous afin de recevoir les coordonnées de paiement (${PAYMENT_OPERATORS}).`

  const proof = number
    ? `Ensuite, envoyez une capture d'écran du message de confirmation Mobile Money par WhatsApp au ${number} — le numéro indiqué sur la page « Nous contacter » de l'application. Votre accès sera réactivé dès réception de cette capture.`
    : `Ensuite, envoyez une capture d'écran du message de confirmation Mobile Money par WhatsApp au numéro indiqué sur la page « Nous contacter » de l'application. Votre accès sera réactivé dès réception de cette capture.`

  return [
    greeting,
    '',
    opening,
    consequence,
    '',
    payment,
    proof,
    '',
    'Merci de votre confiance,',
    contact.nom,
  ].join('\n')
}
