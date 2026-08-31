# AssoCaisse

Gestion financière pour associations, ONG, amicales et tontines d'Afrique de
l'Ouest : registre des membres, cotisations mensuelles, cotisations
extraordinaires, dépenses justifiées et rapport d'Assemblée Générale imprimable.

Interface en français, montants en **F CFA** (XOF), dates en **JJ/MM/AAAA**,
pensée d'abord pour le téléphone.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

## Prise en main

1. Sur la page d'accueil, **« Créer mon association »**. Le formulaire demande
   deux mots de passe distincts (voir *Rôles* plus bas). L'association démarre
   avec **30 jours d'essai**.
2. Vous êtes connecté en lecture seule ; le bouton de rôle dans l'en-tête ouvre
   le mode Trésorier après saisie du mot de passe Trésorier.
3. La console d'administration de la plateforme vit sur **`/admin`** (aucun lien
   depuis le site). Au premier accès, vous y définissez votre mot de passe
   administrateur.

## Modules

| Route | Contenu |
|---|---|
| `/` | Landing, création d'une association |
| `/connexion` | Connexion d'une association (mot de passe du compte) |
| `/deconnexion` | Ferme la session puis renvoie à la landing |
| `/contact` | **Nous contacter** : coordonnées du fournisseur, étapes de renouvellement |
| `/acces-expire` | Écran de blocage : qui contacter pour renouveler |
| `/admin` | **Console Plateforme** : abonnements, échéances, coordonnées |
| `/app` | Les 4 chiffres du trésorier, graphiques, impayés, campagnes |
| `/app/membres` | Registre, recherche, filtres, catégories de cotisation, WhatsApp |
| `/app/cotisations` | Matrice 12 mois, saisie en un clic, liste des impayés, relances |
| `/app/campagnes` | Cotisations extraordinaires, objectifs, journal des contributions |
| `/app/depenses` | Dépenses par poste, capture de reçu par appareil photo |
| `/app/rapport` | Rapport financier d'AG, imprimable A4 avec blocs de signature |
| `/app/parametres` | Identité, rôles, mots de passe, sauvegarde Excel, abonnement |

## Décisions techniques

**Multi-tenant.** Chaque association est un locataire isolé. La couche plateforme
([`src/lib/platform.tsx`](src/lib/platform.tsx)) détient les comptes, la session
et l'abonnement ; le registre comptable de chaque association vit sous une clé
qui lui est propre (`assocaisse:tenant:<id>`,
[`src/lib/storage.ts`](src/lib/storage.ts)). Le `StoreProvider` est monté *sous*
le `PlatformProvider` et recharge le registre quand la session change — une
association ne peut jamais lire les données d'une autre.

**Abonnements.** Bascule 100 % manuelle, sans API de paiement : la console
`/admin` liste les associations avec `statut_abonnement`,
`date_expiration_acces` et *jours restants*, triables et filtrables, plus des
boutons `+1m / +3m / +12m`, plus un envoi d'avis WhatsApp — fin d'essai ou
résiliation selon le statut, rédigé par [`src/lib/notices.ts`](src/lib/notices.ts).
Cet avis renvoie toujours à la page `/contact` et réclame une capture d'écran du
message Mobile Money : sans API de paiement, c'est le seul déclencheur de
réactivation. Les règles d'accès sont centralisées dans
[`src/lib/subscription.ts`](src/lib/subscription.ts) — l'accès court jusqu'à la
**fin** du jour d'expiration, et un statut `actif` dont la date est passée est
affiché comme expiré, pour que la liste ne mente jamais.

**Rôles et mots de passe.** Deux rôles sans RBAC. Le **mot de passe du compte**
(partagé avec le bureau) ouvre l'application en `Président / Secrétaire`, en
lecture seule. Le **mot de passe Trésorier**, distinct et obligatoirement
différent, débloque l'écriture. Les deux sont définis à la création et se
modifient dans Paramètres. Hachage PBKDF2-SHA256 salé
([`src/lib/auth.ts`](src/lib/auth.ts)) : cela protège d'un téléphone emprunté,
pas d'un attaquant qui éditerait le `localStorage` — une application purement
navigateur ne peut pas offrir mieux.

**Déconnexion.** Elle passe par la route dédiée `/deconnexion`
([`src/pages/Logout.tsx`](src/pages/Logout.tsx)). Vider la session depuis `/app`
re-rendrait le `Layout`, dont la garde redirigerait vers `/connexion` avant qu'un
`navigate('/')` n'aboutisse — React Router v7 navigue dans une transition, que
`flushSync` ne devance pas.

**Stockage.** Tout vit dans le navigateur : les registres en JSON dans
`localStorage`, les justificatifs photo dans **IndexedDB**
([`src/lib/receipts.ts`](src/lib/receipts.ts)). Les images sont séparées
volontairement — quelques photos de 150 Ko suffiraient à saturer le quota de
`localStorage` et à emporter la comptabilité avec elles. La suppression d'une
association ne purge que *ses* reçus (`deleteReceipts`), jamais le magasin
entier.

**Sauvegarde Excel.** Export et import `.xlsx` depuis Paramètres
([`src/lib/excel.ts`](src/lib/excel.ts)) : sept feuilles françaises lisibles
(Association, Catégories, Membres, Cotisations, Campagnes, Contributions,
Dépenses) qui conservent les colonnes `ID` servant à reconstituer les liens à la
restauration. `write-excel-file` / `read-excel-file` sont chargés en *import
dynamique*, donc absents du bundle principal. Les photos de justificatifs ne
tiennent pas dans un classeur : seule leur clé voyage.

**Logo d'association.** Facultatif, proposé à la création et modifiable ensuite
dans Paramètres. Réduit à 256 px / 40 Ko avant stockage, car il vit dans le JSON
en `localStorage` et non dans IndexedDB ; il s'affiche dans l'en-tête et en tête
du rapport d'AG.

**Cotisations anticipées.** La matrice accepte la saisie d'un mois postérieur au
mois courant. Ces cellules portent le statut `future` : le versement compte en
recettes mais reste hors du dû, donc un paiement d'avance n'apparaît jamais dans
les impayés ([`src/lib/selectors.ts`](src/lib/selectors.ts)).

**Moyens de paiement.** Espèces, Orange Money, Moov Money, Wave, Télécel Money et
Sank Money. MTN MoMo et le virement bancaire ont été retirés du sélecteur, mais
`paymentMethodLabel` conserve leur libellé pour que les versements enregistrés
avant ce changement ne s'affichent pas vides.

**Compression des reçus.** [`src/lib/image.ts`](src/lib/image.ts) redimensionne à
1024 px puis baisse la qualité JPEG par paliers jusqu'à passer sous 150 Ko, avant
de réduire encore les dimensions si nécessaire. `browser-image-compression` n'est
chargé (en *chunk* séparé) que pour les fichiers de plus de 8 Mo.

**Calcul des impayés.** [`src/lib/selectors.ts`](src/lib/selectors.ts) : le dû
d'un membre court du plus tardif entre son adhésion et le début d'exercice
jusqu'au mois courant. Les membres inactifs et les membres d'honneur (0 F CFA) ne
génèrent pas d'arriéré ; leurs versements passés restent comptés en recettes.

**Couleurs des graphiques.** [`src/lib/palette.ts`](src/lib/palette.ts) —
palette validée pour le daltonisme, pas choisie à l'œil. Recettes et dépenses
sont distinguées d'abord par la **direction** (au-dessus / en-dessous de l'axe
zéro), la couleur ne faisant que renforcer ; chaque poste de dépense est
étiqueté en toutes lettres à côté de sa pastille.

**Impression.** Règles `@media print` dans [`src/index.css`](src/index.css),
format A4. Le rapport d'AG et le relevé individuel s'impriment seuls, sans la
navigation.
