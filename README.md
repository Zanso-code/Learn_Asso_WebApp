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

## Configuration Supabase

Les données vivent côté serveur ; l'application ne démarre utilement qu'une fois
le projet Supabase branché.

1. **Créer un projet** sur [supabase.com](https://supabase.com) (le palier
   gratuit suffit largement pour un MVP).
2. **Appliquer le schéma**, dans l'ordre, en collant chaque fichier dans le SQL
   Editor :

   **a.** [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   — tables, RLS, privilèges de colonnes, publication Realtime, bucket
   `receipts`.

   **b.** [`supabase/migrations/0002_durcissement.sql`](supabase/migrations/0002_durcissement.sql)
   — déplace vers la base trois contrôles qui ne vivaient que dans le
   navigateur : le rôle Trésorier, l'abonnement, et l'écriture de la console
   d'administration (qui, sans elle, échoue en « permission denied »).

   **c.** [`supabase/migrations/0003_notes_admin.sql`](supabase/migrations/0003_notes_admin.sql)
   — sort les **notes internes** de la table `associations`, où chaque
   association pouvait lire le mémo que l'Admin Plateforme avait écrit à son
   sujet, alors que la console l'annonce « visible ici seulement ».

   **d.** [`supabase/migrations/0004_reparation_droits.sql`](supabase/migrations/0004_reparation_droits.sql)
   — accorde `EXECUTE` sur les prédicats appelés par les politiques RLS
   (`can_write`, `has_active_access`, `may_write_ledger`…). Une politique
   s'évalue avec les droits de **l'appelant** : sans ce privilège, `using
   (may_write_ledger(...))` ne rend pas « faux », il lève `permission denied for
   function` — et plus personne n'écrit, ni le Trésorier dans le grand livre, ni
   l'Admin Plateforme dans une fiche. Le correctif est intégré à `0002` pour
   toute nouvelle installation ; ce fichier existe pour les bases déjà en
   service, où `0002` ne peut plus être rejoué. Il commence par un bloc de
   diagnostic à exécuter seul (l'éditeur SQL n'affiche que le dernier résultat
   d'un lot).

   **`0002` ne doit jamais être rejoué seul après `0003`** : il lit
   `associations.tresorier_secret` et `associations.notes`, deux colonnes que
   les migrations suivantes suppriment. `0001`, `0003` et `0004` sont, eux,
   rejouables sans dommage.

   Après application, ces deux requêtes doivent confirmer l'état attendu :

   ```sql
   -- Aucune table du schéma public sans RLS.
   select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = false;   -- attendu : 0 ligne

   -- Le rôle `authenticated` ne doit rien pouvoir ÉCRIRE sur l'abonnement :
   -- toute ligne ici signifie qu'une association peut se renouveler seule.
   --
   -- Le filtre sur privilege_type est essentiel : `grant select on associations`
   -- porte sur toutes les colonnes, donc ces mêmes colonnes apparaissent
   -- normalement en SELECT. C'est voulu — l'application doit pouvoir afficher
   -- « votre accès expire dans N jours ». Seules INSERT et UPDATE sont en jeu.
   select column_name, privilege_type from information_schema.column_privileges
    where table_name = 'associations' and grantee = 'authenticated'
      and privilege_type in ('INSERT','UPDATE')
      and column_name in ('statut_abonnement','date_expiration_acces',
                          'treasurer_user_id');               -- attendu : 0 ligne

   -- Les trois colonnes sensibles ont quitté `associations` : rien de ce que
   -- l'Admin Plateforme écrit ou détient ne doit y rester lisible.
   select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'associations'
      and column_name in ('tresorier_secret','notes');        -- attendu : 0 ligne
   ```
3. **Renseigner les clés** : copier `.env.example` vers `.env.local` et y mettre
   l'URL du projet et la **Publishable key** (`sb_publishable_…`, Project
   Settings → API Keys). C'est le remplaçant direct de l'ancienne clé `anon` :
   mêmes privilèges réduits, donc la RLS se comporte à l'identique, et aucun
   changement de code. Si le projet n'affiche encore que les anciennes clés,
   `anon` convient — Supabase la déprécie fin 2026.

   Cette clé est publique par nature : elle part dans le navigateur. Ce qui
   protège les données, c'est la RLS, pas son secret. En revanche la **Secret
   key** (`sb_secret_…` / `service_role`) ne doit **jamais** figurer ici : elle
   ignore la RLS et livrerait à chaque visiteur les données de toutes les
   associations.

   **Reporter l'URL du projet dans la CSP.** [`index.html`](index.html) porte
   une `Content-Security-Policy` dont la directive `connect-src` cite l'hôte
   Supabase en dur — une CSP ne lit pas les variables d'environnement. Si votre
   projet a une autre URL que celle qui s'y trouve, remplacez-la aux deux
   endroits (`https://…` et `wss://…`, ce dernier pour le temps réel), sans quoi
   le navigateur bloquera silencieusement tous les appels. Cette politique est
   ce qui rend acceptable le stockage des jetons de session dans `localStorage`,
   seule option d'une SPA statique : même un XSS venu d'une dépendance
   compromise n'aurait aucune destination autorisée vers laquelle les exfiltrer.

   Deux protections ne peuvent **pas** passer par une balise `<meta>` et
   demandent un en-tête HTTP côté hébergeur — à ajouter si le vôtre le permet :

   ```
   Content-Security-Policy: frame-ancestors 'none'   # ou X-Frame-Options: DENY
   Strict-Transport-Security: max-age=31536000; includeSubDomains
   ```

   Le mieux reste de servir **toute** la CSP en en-tête et de retirer la balise.
4. **Désactiver la confirmation par e-mail** (Authentication → Providers →
   Email). Exiger un clic de confirmation rend l'inscription impraticable pour
   un trésorier qui a un numéro de téléphone mais pas d'habitude du courriel ;
   la réinitialisation de mot de passe passe donc par la console plateforme.
5. **Désigner l'administrateur plateforme.** C'est le compte qui gère les
   abonnements depuis `/admin`. Il est **distinct** d'un compte d'association :
   ne le créez pas via « Créer mon association » sur le site.

   **a.** Authentication → **Users** → *Add user* → *Create new user*. Saisissez
   un e-mail et un mot de passe solide, et **cochez « Auto Confirm User »** —
   sans cette case le compte reste en attente de confirmation et la connexion
   échouera avec un simple « mot de passe incorrect », sans autre explication.

   **b.** SQL Editor → *New query*, en remplaçant l'e-mail par celui de l'étape
   précédente :

   ```sql
   insert into platform_admins (user_id)
   select id from auth.users where email = 'admin@exemple.com';
   ```

   `1 row affected` confirme l'opération. `0 rows affected` signifie que
   l'e-mail ne correspond pas exactement à celui du compte créé.

   **c.** Vérifier, puis se connecter sur `/admin` :

   ```sql
   select u.email from platform_admins p join auth.users u on u.id = p.user_id;
   ```

   Le mot de passe se change ensuite depuis la console elle-même (*Paramètres de
   la plateforme*), sans repasser par le SQL.

   Cette étape est volontairement manuelle : si `/admin` pouvait s'attribuer le
   rôle, le premier visiteur prendrait la main sur toute la plateforme.

## Prise en main

1. Sur la page d'accueil, **« Créer mon association »**. Le formulaire demande
   deux mots de passe distincts (voir *Rôles* plus bas). L'association démarre
   avec **30 jours d'essai**.
2. Vous êtes connecté en lecture seule ; le bouton de rôle dans l'en-tête ouvre
   le mode Trésorier après saisie du mot de passe Trésorier.
3. La console d'administration de la plateforme vit sur **`/admin`** (aucun lien
   depuis le site). On s'y connecte avec le compte inscrit dans
   `platform_admins` (voir *Configuration Supabase*).

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

**Abonnements.** Appliqués par la base, pas par le navigateur : `has_active_access()`
conditionne toute écriture du grand livre. La lecture, elle, reste ouverte —
« vos données sont conservées et resteront consultables » est la promesse faite
à l'association. Tant que la règle n'était qu'un `if` dans un composant React,
une association expirée gardait en réalité l'accès complet à ses données, en
écriture comprise.

Bascule 100 % manuelle, sans API de paiement : la console
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

**Rôles et mots de passe.** Deux rôles sans RBAC, portés par **deux identités
Supabase Auth** par association :

| | Compte | Rôle | Peut écrire ? |
|---|---|---|---|
| Bureau | `email` | `Président / Secrétaire` | non |
| Trésorier | `email+tresorier@…` | `Trésorier` | oui |

Le **mot de passe du compte** (partagé avec le bureau) ouvre l'application en
lecture seule. Le **mot de passe Trésorier**, distinct et obligatoirement
différent, ouvre la seconde session — celle que la RLS reconnaît. Les deux
clients Supabase persistent leur jeton sous une clé distincte
([`src/lib/supabase.ts`](src/lib/supabase.ts)), si bien que déverrouiller le
rôle Trésorier ne détruit pas la session du bureau, et le reverrouiller ne
redemande pas le mot de passe du compte.

Le rôle Trésorier **n'est plus une barrière applicative**. Il l'a été : le rôle
était un champ de `localStorage`, et le passer à `treasurer` à la main suffisait
à ouvrir l'écriture sur toute la comptabilité. Désormais, c'est Postgres qui
refuse — `can_write()` dans
[`0002_durcissement.sql`](supabase/migrations/0002_durcissement.sql).

Le déverrouillage hors ligne est préservé : la session Trésorier est persistée
sur l'appareil et se rafraîchit seule, et le condensat PBKDF2
([`src/lib/auth.ts`](src/lib/auth.ts), table `treasurer_secrets`) sert à
reconnaître le mot de passe saisi sans réseau. **Seul le tout premier
déverrouillage sur un appareil donné exige une connexion Internet.** Le
condensat vit dans sa propre table : porté par la ligne `associations`, il était
lisible par l'Admin Plateforme pour *toutes* les associations.

Enfin, la frontière qui compte reste appliquée par la base : **une association
ne peut pas lire les données d'une autre.**

**Déconnexion.** Elle passe par la route dédiée `/deconnexion`
([`src/pages/Logout.tsx`](src/pages/Logout.tsx)). Vider la session depuis `/app`
re-rendrait le `Layout`, dont la garde redirigerait vers `/connexion` avant qu'un
`navigate('/')` n'aboutisse — React Router v7 navigue dans une transition, que
`flushSync` ne devance pas. Si des écritures restent en attente d'envoi, le
miroir local est **conservé** plutôt que purgé : rien de ce qui a été saisi ne
doit disparaître à la déconnexion.

**Stockage — local-first, serveur faisant autorité.** Les données vivent dans
**Postgres (Supabase)**, isolées par association via RLS
([`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)). Le
client garde en permanence une copie complète du grand livre dans **IndexedDB**
([`src/lib/idb.ts`](src/lib/idb.ts)), ce qui laisse `selectors.ts` et les neuf
pages travailler sur un objet en mémoire et rend chaque écran instantané, y
compris hors ligne.

Toute mutation s'applique d'abord en mémoire, se recopie dans le miroir, puis
dépose une opération dans une **file d'attente durable**
([`src/lib/sync/outbox.ts`](src/lib/sync/outbox.ts)). Le moteur
([`src/lib/sync/engine.ts`](src/lib/sync/engine.ts)) la vide dès que le réseau
revient, puis récupère les lignes modifiées depuis son curseur. Déclencheurs :
connexion, événement `online`, retour sur l'onglet, battement de 60 s, et
**Supabase Realtime** pour que l'appareil d'à côté apparaisse sans attendre.

*Résolution de conflit :* dernier écrivain gagne, ligne par ligne **et champ par
champ**. Les insertions (cotisations, contributions, dépenses) portent un UUID et
ne peuvent pas entrer en collision ; les modifications voyagent en *patch
partiel*, si bien que deux personnes qui éditent des champs différents du même
membre gardent chacune leur changement. `updated_at` est posé par un trigger
Postgres, jamais par le client : le décalage d'horloge des téléphones est sans
effet. Les suppressions sont des pierres tombales (`deleted_at`) et l'emportent
sur une modification concurrente.

*Hors ligne pour de bon :* un service worker
([`vite.config.ts`](vite.config.ts)) précache la coquille applicative et Space
Grotesk est auto-hébergée — sans quoi le premier rendu dépendrait encore de
`fonts.googleapis.com`. Les appels Supabase ne sont **pas** mis en cache par le
service worker : le miroir IndexedDB *est* la couche de données hors ligne.

**Justificatifs.** Photos dans **Supabase Storage** (bucket privé `receipts`,
chemin `<association_id>/<clé>.jpg`), avec IndexedDB en cache de lecture et en
tampon d'envoi ([`src/lib/receipts.ts`](src/lib/receipts.ts)). Clé locale et
chemin distant sont préfixés par l'association : l'ancien magasin partagé
laissait une association hériter des photos orphelines d'une autre sur le même
appareil.
([`src/lib/excel.ts`](src/lib/excel.ts)) : sept feuilles françaises lisibles
(Association, Catégories, Membres, Cotisations, Campagnes, Contributions,
Dépenses) qui conservent les colonnes `ID` servant à reconstituer les liens à la
restauration. `write-excel-file` / `read-excel-file` sont chargés en *import
dynamique*, donc absents du bundle principal. Les photos de justificatifs ne
tiennent pas dans un classeur : seule leur clé voyage.

**Logo d'association.** Facultatif, proposé à la création et modifiable ensuite
dans Paramètres. Réduit à 256 px / 40 Ko avant stockage, car il voyage dans la
ligne `associations` elle-même et non dans le bucket de justificatifs ; il
s'affiche dans l'en-tête et en tête du rapport d'AG.

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
