/**
 * Longueurs maximales des champs texte — le miroir des contraintes CHECK.
 *
 * La base est l'autorité : ces bornes sont posées par
 * `supabase/migrations/0002_durcissement.sql` §9 et `0005_cloison_tresorier.sql`
 * §4, et c'est Postgres qui refuse une valeur trop longue, y compris venue
 * d'une requête forgée qui n'aurait jamais vu ce fichier.
 *
 * Ce module ne sert donc PAS à sécuriser : il sert à ce que le trésorier voie
 * la limite pendant qu'il tape, au lieu de la découvrir par un « Une des
 * valeurs saisies dépasse la taille autorisée » une fois le formulaire envoyé.
 *
 * Toute modification ici doit être accompagnée de la migration correspondante,
 * et réciproquement. Les valeurs sont recopiées à l'identique.
 */
export const LIMITS = {
  /* --- association (0002 §9 + 0005 §4) ------------------------------------ */
  associationNom: 150,
  associationSigle: 30,
  associationVille: 100,
  associationResponsable: 150,
  associationTelephone: 30,
  associationEmail: 254,
  associationTreasurerName: 150,
  associationPresidentName: 150,

  /* --- grand livre (0002 §9) ---------------------------------------------- */
  categorieNom: 60,
  membreNom: 150,
  membreTelephone: 30,
  campagneTitre: 150,
  campagneDescription: 2000,
  depenseLibelle: 200,
  depenseBeneficiaire: 200,

  /** `note` partage la même borne sur members, due_payments, campaigns… */
  note: 1000,

  /* --- plateforme (0002 §9, 0003) ----------------------------------------- */
  plateformeNom: 100,
  plateformeEmail: 254,
  plateformeTelephone: 30,
  notesAdmin: 2000,
} as const
