# AssoCaisse

Gestion financière pour associations, ONG, amicales et tontines d'Afrique de
l'Ouest : registre des membres, cotisations mensuelles, cotisations
extraordinaires, dépenses justifiées et rapport d'Assemblée Générale imprimable.

Interface en français, montants en FCFA (XOF), pensée d'abord pour le téléphone.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

Au premier lancement, la page d'accueil propose **« Explorer la démo »** : elle
charge l'*Amicale des Anciens & Amis du Sahel* (14 membres, 6 mois de
cotisations, 2 campagnes, 8 dépenses) — aucune configuration requise.

## Modules

| Route | Contenu |
|---|---|
| `/` | Landing, chargement de la démo, création d'une association vide |
| `/app` | Les 4 chiffres du trésorier, graphiques, impayés, campagnes |
| `/app/membres` | Registre, recherche, filtres, catégories de cotisation, WhatsApp |
| `/app/cotisations` | Matrice 12 mois, saisie en un clic, liste des impayés, relances |
| `/app/campagnes` | Cotisations extraordinaires, objectifs, journal des contributions |
| `/app/depenses` | Dépenses par poste, capture de reçu par appareil photo |
| `/app/rapport` | Rapport financier d'AG, imprimable A4 avec blocs de signature |
| `/app/parametres` | Identité, rôle actif, export JSON, réinitialisation |

## Décisions techniques

**Stockage.** Tout vit dans le navigateur : le registre en JSON dans
`localStorage`, les justificatifs photo dans **IndexedDB**
([`src/lib/receipts.ts`](src/lib/receipts.ts)). Les images sont séparées
volontairement — quelques photos de 150 Ko suffiraient à saturer le quota de
`localStorage` et à emporter la comptabilité avec elles.

**Compression des reçus.** [`src/lib/image.ts`](src/lib/image.ts) redimensionne à
1024 px puis baisse la qualité JPEG par paliers jusqu'à passer sous 150 Ko, avant
de réduire encore les dimensions si nécessaire. `browser-image-compression` n'est
chargé (en *chunk* séparé) que pour les fichiers de plus de 8 Mo.

**Calcul des impayés.** [`src/lib/selectors.ts`](src/lib/selectors.ts) : le dû
d'un membre court du plus tardif entre son adhésion et le début d'exercice
jusqu'au mois courant. Les membres inactifs et les membres d'honneur (0 FCFA) ne
génèrent pas d'arriéré ; leurs versements passés restent comptés en recettes.

**Couleurs des graphiques.** [`src/lib/palette.ts`](src/lib/palette.ts) —
palette validée pour le daltonisme, pas choisie à l'œil. Recettes et dépenses
sont distinguées d'abord par la **direction** (au-dessus / en-dessous de l'axe
zéro), la couleur ne faisant que renforcer ; chaque poste de dépense est
étiqueté en toutes lettres à côté de sa pastille.

**Rôles.** Deux rôles sans RBAC : `Trésorier` (écriture complète) et
`Président / Secrétaire` (lecture seule — les boutons de modification
disparaissent). Le sélecteur est dans l'en-tête, pour démontrer les deux vues en
réunion.

**Impression.** Règles `@media print` dans [`src/index.css`](src/index.css),
format A4. Le rapport d'AG et le relevé individuel s'impriment seuls, sans la
navigation.

The app is built and verified. Dev server is running at http://localhost:5177 — open it and click "Explorer la démo".

