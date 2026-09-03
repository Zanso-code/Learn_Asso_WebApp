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

   **e.** [`supabase/migrations/0005_cloison_tresorier.sql`](supabase/migrations/0005_cloison_tresorier.sql)
   — **obligatoire.** Ferme les conclusions de l'audit de sécurité. Trois
   chemins indépendants permettaient au compte du **bureau** — celui que
   l'application décrit comme « lecture seule » — d'obtenir l'écriture sur tout
   le grand livre :

   - `set_treasurer_identity()` acceptait d'**écraser** un Trésorier déjà
     désigné. Le titulaire du compte du bureau pouvait donc s'inscrire un second
     compte Auth, se l'attribuer comme trésorier et se connecter avec : le mot
     de passe Trésorier n'était jamais demandé, et le trésorier légitime se
     retrouvait évincé. La fonction est désormais réservée à l'**amorçage**, et
     `rotate_treasurer_identity()` gère la passation — réservée, elle, au
     trésorier en exercice.
   - La lecture de `treasurer_secrets` n'exigeait que l'appartenance au
     locataire, pas le rôle : le compte du bureau téléchargeait le condensat
     PBKDF2 du mot de passe Trésorier — qui est **aussi** celui du compte Auth
     du trésorier — et pouvait le casser hors ligne, sans limitation de
     fréquence. La politique exige maintenant `can_write()`.
   - Le troisième chemin était côté client (`openTreasurerSession` renvoyait un
     succès dès qu'une session dormait sur l'appareil) et se corrige par le
     code, pas par le SQL.

   Le fichier complète aussi les bornes de colonnes laissées par `0002` §9,
   retire `email` du `GRANT UPDATE`, et valide les contraintes restées
   `NOT VALID`. Il se termine par une requête de vérification qui doit rendre
   `true`.

   **`0002` ne doit jamais être rejoué seul après `0003`** : il lit
   `associations.tresorier_secret` et `associations.notes`, deux colonnes que
   les migrations suivantes suppriment. `0001`, `0003`, `0004` et `0005` sont,
   eux, rejouables sans dommage.

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

   **La CSP se génère toute seule.** Il n'y a plus rien à reporter à la main :
   `securityHeaders()`, dans [`vite.config.ts`](vite.config.ts), lit
   `VITE_SUPABASE_URL` au moment de la compilation et en dérive la directive
   `connect-src` (en `https://` et en `wss://`, ce dernier pour le temps réel).
   L'hôte était auparavant écrit en dur dans `index.html` : un déploiement vers
   un autre projet Supabase bloquait alors **silencieusement** tous les appels
   réseau, sans autre symptôme qu'une application qui semble en panne.

   Le même plugin écrit `dist/_headers`, qui porte les protections qu'une balise
   `<meta>` ne peut pas transmettre — le navigateur les ignore : `frame-ancestors
   'none'` et `Strict-Transport-Security`. **Netlify** et **Cloudflare Pages**
   lisent ce fichier tel quel.

   **Vercel, lui, ne lit pas `_headers`** — il l'ignore sans rien signaler, et
   les en-têtes de sécurité disparaîtraient en silence. C'est
   [`vercel.json`](vercel.json), à la racine, qui joue ce rôle : il reprend les
   mêmes directives, plus le `Cache-Control` du service worker et la réécriture
   SPA. Sur `nginx` (`add_header`) ou Apache (`Header set`), recopiez le contenu
   de `dist/_headers` dans la configuration correspondante.

   La CSP réduit fortement ce que vaut un XSS, mais **ne l'annule pas** : elle
   ne contraint pas la navigation, et un script injecté peut encore emporter un
   jeton dans une URL en quittant la page. Les jetons dans `localStorage` sont
   la contrainte d'une SPA statique, pas un choix confortable ; ce qui protège
   réellement les données reste la RLS et la séparation des deux identités Auth.
4. **Désactiver la confirmation par e-mail** (Authentication → Providers →
   Email). Exiger un clic de confirmation rend l'inscription impraticable pour
   un trésorier qui a un numéro de téléphone mais pas d'habitude du courriel.

   **Conséquence à connaître :** les adresses ne sont donc jamais vérifiées.
   L'adresse du compte Trésorier est pour cette raison dérivée de
   l'identifiant de l'association (`…+tresorier.<8 car.>@…`) et non du seul mot
   « trésorier » : la forme devinable permettait de **préempter** l'adresse
   qu'une association allait utiliser, ce qui rendait ensuite son rôle
   Trésorier définitivement inatteignable.

   Pour la même raison, **n'activez pas la réinitialisation de mot de passe par
   e-mail** en l'état : les liens partiraient vers des adresses jamais
   vérifiées. Il n'existe aujourd'hui aucun flux de réinitialisation, et la
   perte du mot de passe du compte exige une intervention dans Authentication →
   Users.

   **Enfin, abaissez les quotas d'inscription** (Authentication → Rate Limits)
   et activez la protection anti-abus (CAPTCHA) sur l'inscription. Chaque compte
   créé ouvre un essai de 30 jours : sans plafond, un remplissage automatisé
   noie la console d'administration et consomme le quota de la base, qui est
   commun à toutes les associations.
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

## Déploiement sur Vercel

1. **Importer le dépôt** sur vercel.com. Le préréglage *Vite* est détecté seul :
   commande `npm run build`, dossier de sortie `dist`.
2. **Déclarer les deux variables d'environnement** (Settings → Environment
   Variables), pour *Production* **et** *Preview* :

   ```
   VITE_SUPABASE_URL              https://<votre-projet>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…
   ```

   **Cette étape n'est pas optionnelle, et son oubli ne ressemble pas à un
   oubli.** Ces variables sont lues *à la compilation* : sans elles, le build
   réussit, le déploiement réussit — et le site affiche l'écran « Configuration
   incomplète », tandis que la CSP générée ne cite aucun hôte Supabase et
   bloquerait de toute façon chaque appel réseau. Après les avoir ajoutées,
   **relancez un déploiement** : Vercel ne recompile pas tout seul sur un
   changement de variable.
3. **Vérifier après le premier déploiement**, dans l'onglet Réseau du
   navigateur, sur la réponse du document HTML :
   - `content-security-policy: frame-ancestors 'none'` et
     `strict-transport-security` sont présents → [`vercel.json`](vercel.json)
     est bien pris en compte ;
   - ouvrir directement `https://…/app/membres` dans un onglet neuf renvoie
     l'application et non un 404 → la réécriture SPA fonctionne ;
   - la balise `<meta http-equiv="Content-Security-Policy">` du HTML cite votre
     hôte Supabase en `https://` **et** en `wss://` → les variables étaient bien
     présentes à la compilation.

   Si le temps réel ne fonctionne pas alors que le reste marche, c'est presque
   toujours le `wss://` manquant dans `connect-src`, donc l'étape 2 faite après
   le build.

**Pourquoi `vercel.json` ne contient aucun commentaire.** Vercel valide ce
fichier contre un schéma strict : toute clé hors schéma — y compris une clé
`_comment` — fait échouer le déploiement avec `should NOT have additional
property`. Les deux points qu'on serait tenté d'y annoter tiennent ici :

- `sw.js`, `registerSW.js` et `manifest.webmanifest` sont servis en
  `must-revalidate`. Un service worker mis en cache continuerait à servir
  l'ancienne coquille applicative après un déploiement, sans que l'utilisateur
  puisse s'en apercevoir. Les fichiers de `dist/assets/` portent un hash dans
  leur nom et restent cachés indéfiniment, ce que Vercel fait déjà.
- Le `Content-Security-Policy` d'en-tête ne reprend **que** `frame-ancestors`,
  que la balise `<meta>` ne peut pas porter. Le reste de la CSP
  (`connect-src`, `script-src`…) est généré à la compilation depuis
  `VITE_SUPABASE_URL` : le dupliquer ici réintroduirait l'hôte écrit en dur que
  cette génération a supprimé. Les deux politiques coexistent — le navigateur
  les applique en intersection, chacune ne restreignant que ce qu'elle nomme.

**Ordre de déploiement.** La base et le code doivent avancer ensemble. La
migration `0005` exige le rôle Trésorier pour lire `treasurer_secrets` ; un code
antérieur, qui lisait cette table avec la session du bureau, recevrait un
condensat vide et **refuserait tous les mots de passe Trésorier** — avec pour
seul symptôme un « Mot de passe Trésorier incorrect » parfaitement trompeur.
Déployez le code d'abord, la migration ensuite, ou les deux dans la même
fenêtre de maintenance.

## Supervision

Il n'existe aucune couche serveur entre le navigateur et Postgres : la RLS
garantit qu'aucune association ne voit les données d'une autre, mais le **quota
de la base est commun**. Une seule association peut donc, par une requête
forgée, saturer la base et interrompre le service pour toutes les autres. Les
bornes de colonnes de `0002` §9 et `0005` §4 coupent le vecteur le plus direct ;
ces trois requêtes détectent le reste. À passer une fois par mois.

```sql
-- 1. Volume de justificatifs par association. Le bucket plafonne chaque objet
--    à 1 Mo, mais pas leur NOMBRE : c'est le total qui compte.
select (storage.foldername(name))[1]                     as association_id,
       count(*)                                          as objets,
       pg_size_pretty(sum((metadata->>'size')::bigint))  as volume
  from storage.objects
 where bucket_id = 'receipts'
 group by 1
 order by sum((metadata->>'size')::bigint) desc
 limit 20;

-- 2. Vague d'inscriptions automatisées : chaque compte ouvre 30 jours d'essai.
select date_creation, count(*)
  from associations
 group by 1 order by 1 desc limit 30;

-- 3. Poids réel par table, pour repérer une anomalie que les deux premières
--    requêtes ne montreraient pas.
select relname as table,
       pg_size_pretty(pg_total_relation_size(c.oid)) as taille
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc;
```

Le type MIME des justificatifs reste **déclaré par le client** : Supabase
Storage applique la valeur annoncée, pas le contenu réel. Un client forgé peut
donc stocker jusqu'à 1 Mo d'octets quelconques étiquetés `image/jpeg`. Le risque
est assumé — bucket privé, dépôt réservé au Trésorier d'un abonnement actif,
isolation par locataire, et relecture dans une balise `<img>` où tout contenu
non-image est inerte. C'est la requête n°1 qui le surveille, pas un contrôle de
signature qui exigerait une fonction de bord.

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
