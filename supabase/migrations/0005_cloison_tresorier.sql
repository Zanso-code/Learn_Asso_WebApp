-- =============================================================================
-- AssoCaisse — la cloison Tresorier / lecture seule
--
-- Audit de securite du 2 septembre 2026. Trois chemins independants
-- permettaient au compte du BUREAU — celui que l'application decrit comme
-- « lecture seule : consultation des tableaux de bord, releves et rapports,
-- sans possibilite de modification » — d'obtenir l'ecriture sur tout le grand
-- livre. Les corriger un par un ne servirait a rien : chacun suffit seul.
--
--   1. set_treasurer_identity() acceptait d'ECRASER un tresorier deja designe.
--      Le titulaire du compte du bureau pouvait donc s'inscrire un second
--      compte Auth, se l'attribuer comme tresorier, et se connecter avec.
--      Le mot de passe Tresorier n'etait jamais demande, et le tresorier
--      legitime se retrouvait evince.               <- corrige en §1 ici
--
--   2. La politique de lecture de `treasurer_secrets` n'exigeait que
--      l'appartenance au locataire, pas le role. Le compte du bureau
--      telechargeait donc le condensat PBKDF2 du mot de passe Tresorier —
--      lequel est AUSSI le mot de passe du compte Auth du tresorier — et
--      pouvait le casser hors ligne, sans limitation de frequence.
--                                                    <- corrige en §2 ici
--
--   3. openTreasurerSession() renvoyait un succes des qu'une session Tresorier
--      dormait sur l'appareil, sans jamais redemander au serveur.
--                                                    <- corrige cote client
--                                                       (src/lib/platform.tsx)
--
-- Le reste du fichier ferme les constats de moindre gravite du meme audit :
-- colonnes texte sans borne (§4), `email` inutilement inscriptible (§5),
-- contraintes restees NOT VALID (§6).
--
-- A appliquer apres 0004_reparation_droits.sql. Rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. set_treasurer_identity() : AMORCAGE UNIQUEMENT
--
-- La fonction ecrit `associations.treasurer_user_id`, la colonne dont depend
-- tout `can_write()` et donc `may_write_ledger()`. Aucun GRANT ne l'accorde :
-- cette fonction est son seul chemin d'ecriture, et c'est bien ainsi.
--
-- Ce qui manquait, c'est la garde d'ETAT. La fonction ne s'autorise qu'au
-- titulaire du compte du bureau (`auth_user_id = auth.uid()`) — precisement le
-- role en lecture seule — et n'exige aucune preuve de connaissance du mot de
-- passe Tresorier. Tant que la colonne est vide, c'est sans danger : personne
-- n'a encore l'ecriture, il faut bien la donner une premiere fois. Des qu'elle
-- est remplie, la meme operation devient une prise de pouvoir.
--
-- Le `= treasurer_uid` de l'exception laisse passer le rejeu a l'identique :
-- une creation de compte interrompue apres le signUp mais avant le lien doit
-- pouvoir etre reprise, et le client la retente effectivement.
-- =============================================================================

create or replace function set_treasurer_identity(treasurer_uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  own_id   uuid;
  existing uuid;
begin
  select id, treasurer_user_id into own_id, existing
    from associations where auth_user_id = auth.uid();

  if own_id is null then
    raise exception 'Aucune association rattachee a ce compte'
      using errcode = '42501';
  end if;

  -- La garde qui manquait.
  if existing is not null and existing <> treasurer_uid then
    raise exception 'Un Tresorier est deja designe pour cette association'
      using errcode = '42501';
  end if;

  -- Un compte deja titulaire d'une association ne peut pas devenir le tresorier
  -- d'une autre : ce serait le scenario de confusion que `coalesce` neutralise
  -- deja dans current_association_id(), autant le refuser a la source.
  if exists (select 1 from associations where auth_user_id = treasurer_uid) then
    raise exception 'Ce compte est deja titulaire d''une association'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from associations
     where treasurer_user_id = treasurer_uid and id <> own_id
  ) then
    raise exception 'Ce compte est deja tresorier d''une autre association'
      using errcode = '42501';
  end if;

  update associations set treasurer_user_id = treasurer_uid where id = own_id;
end $$;

revoke all on function set_treasurer_identity(uuid) from public, anon;
grant execute on function set_treasurer_identity(uuid) to authenticated;

-- --- Passation ---------------------------------------------------------------
--
-- L'amorcage ne pouvant plus servir a remplacer un tresorier, il faut un
-- chemin pour le cas legitime : le tresorier change de compte, ou passe la
-- main. Reserve au TRESORIER EN EXERCICE — sa session Auth est la preuve qu'il
-- detient le mot de passe Tresorier, ce que le compte du bureau ne peut pas
-- produire.
--
-- L'application ne l'appelle pas encore ; elle existe pour que la restriction
-- posee en §1 n'enferme personne, et pour que le support ait autre chose a
-- proposer qu'un acces direct a la base.

create or replace function rotate_treasurer_identity(new_uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  own_id uuid;
begin
  select id into own_id from associations where treasurer_user_id = auth.uid();

  if own_id is null then
    raise exception 'Reserve au Tresorier en exercice'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from associations
     where auth_user_id = new_uid
        or (treasurer_user_id = new_uid and id <> own_id)
  ) then
    raise exception 'Ce compte est deja rattache a une association'
      using errcode = '42501';
  end if;

  update associations set treasurer_user_id = new_uid where id = own_id;
end $$;

revoke all on function rotate_treasurer_identity(uuid) from public, anon;
grant execute on function rotate_treasurer_identity(uuid) to authenticated;

-- =============================================================================
-- 2. Le condensat Tresorier suit le ROLE, plus seulement le locataire
--
-- `current_association_id()` rend la meme valeur pour la session du bureau que
-- pour celle du tresorier : la politique de 0002 ouvrait donc la lecture aux
-- deux. Or ce condensat protege un mot de passe qui est aussi celui du compte
-- Auth du tresorier — le lire, c'est pouvoir le casser hors ligne, sans que
-- GoTrue ne compte les essais.
--
-- Le deverrouillage hors ligne n'en souffre pas. Le tout PREMIER
-- deverrouillage sur un appareil exige deja le reseau et s'appuie sur le
-- serveur ; a ce moment-la la session Tresorier existe, lit la ligne
-- elle-meme, et le client la met en cache pour les ouvertures suivantes. La
-- session du bureau n'a jamais eu besoin de la voir.
-- =============================================================================

drop policy if exists treasurer_secrets_select on treasurer_secrets;

create policy treasurer_secrets_select on treasurer_secrets for select to authenticated
  using (association_id = current_association_id() and can_write());

-- INSERT reste ouvert au titulaire du compte : il a lieu a la creation de
-- l'association, avant que la moindre identite Tresorier n'existe. La cle
-- primaire `association_id` interdit d'y revenir pour ecraser.
-- UPDATE reste une action Tresorier (`can_write()`), inchange depuis 0002.

-- =============================================================================
-- 3. Verification du lot Tresorier
--
-- A executer SEUL, connecte comme un compte de BUREAU dont l'association a
-- deja un tresorier. Les trois doivent echouer.
--
--   select set_treasurer_identity('00000000-0000-0000-0000-000000000001');
--     -> 42501  « Un Tresorier est deja designe pour cette association »
--   select * from treasurer_secrets;
--     -> 0 ligne  (et non plus le condensat de sa propre association)
--   select rotate_treasurer_identity('00000000-0000-0000-0000-000000000001');
--     -> 42501  « Reserve au Tresorier en exercice »
-- =============================================================================

-- =============================================================================
-- 4. Bornes de colonnes — ce que la section 9 de 0002 avait laisse passer
--
-- Meme raisonnement qu'en 0002 : il n'existe aucune couche serveur entre le
-- navigateur et Postgres, donc une requete forgee ecrit ce qu'elle veut dans
-- son propre locataire. La RLS tient — rien ne fuit d'une association a
-- l'autre — mais le quota de la base est COMMUN a tous les locataires, et une
-- seule association suffit alors a interrompre le service pour toutes.
--
-- Restaient sans borne : neuf colonnes de `associations` presentes au
-- GRANT UPDATE, les cles primaires `id` des six tables du grand livre (que le
-- client fournit lui-meme, ce qui en fait le vecteur le plus direct), et
-- quelques colonnes d'enumeration.
--
-- Meme forme idempotente qu'en 0002 : `add constraint` n'a pas d'`if not
-- exists`, et le fichier doit pouvoir etre rejoue.
-- =============================================================================

do $mig$
declare
  c record;
begin
  for c in
    select * from (values
      -- --- associations : les neuf colonnes inscriptibles restees libres ----
      ('associations',  'assoc_ville_len',     'length(ville) <= 100'),
      ('associations',  'assoc_pays_len',      'length(pays) <= 60'),
      ('associations',  'assoc_resp_len',      'length(responsable) <= 150'),
      ('associations',  'assoc_dial_len',      'length(dial_code) <= 6'),
      ('associations',  'assoc_tel_len',       'length(telephone) <= 30'),
      ('associations',  'assoc_treso_len',     'length(treasurer_name) <= 150'),
      ('associations',  'assoc_presid_len',    'length(president_name) <= 150'),
      ('associations',  'assoc_currency_len',  'length(currency) <= 12'),
      ('associations',  'assoc_fiscal_fmt',
        'fiscal_start = '''' or fiscal_start ~ ''^[0-9]{4}-[0-9]{2}$'''),

      -- --- cles primaires du grand livre ------------------------------------
      -- Elles sont produites par uid() cote client : un prefixe court suivi
      -- d'un UUID, soit 40 caracteres au plus. 64 laisse de la marge sans
      -- laisser la porte ouverte.
      ('categories',    'cat_id_len',          'length(id) <= 64'),
      ('members',       'members_id_len',      'length(id) <= 64'),
      ('due_payments',  'due_id_len',          'length(id) <= 64'),
      ('campaigns',     'camp_id_len',         'length(id) <= 64'),
      ('contributions', 'contrib_id_len',      'length(id) <= 64'),
      ('expenses',      'expenses_id_len',     'length(id) <= 64'),

      -- --- enumerations ------------------------------------------------------
      -- `method` et `category` sont fermees : le client ne produit jamais
      -- autre chose, y compris a la restauration Excel ou les libelles
      -- inconnus retombent sur 'especes' / 'autre'. Les deux methodes
      -- retirees du selecteur (mtn_momo, virement) restent acceptees : des
      -- versements anterieurs les portent.
      ('due_payments',  'due_method_enum',
        'method in (''especes'',''orange_money'',''moov_money'',''wave'','
        || '''telecel_money'',''sank_money'',''mtn_momo'',''virement'')'),
      ('contributions', 'contrib_method_enum',
        'method in (''especes'',''orange_money'',''moov_money'',''wave'','
        || '''telecel_money'',''sank_money'',''mtn_momo'',''virement'')'),
      ('expenses',      'expenses_cat_enum',
        'category in (''logistique'',''restauration'',''solidarite'','
        || '''fournitures'',''transport'',''honoraires'',''autre'')'),

      -- `categories.color` reste une BORNE et non une enumeration : la
      -- restauration Excel recopie la colonne telle quelle depuis le classeur,
      -- qu'un tresorier peut avoir edite a la main. Fermer la liste ferait
      -- echouer une restauration legitime ; borner la longueur suffit a
      -- couper l'abus.
      ('categories',    'cat_color_len',       'length(color) <= 24'),
      ('members',       'members_dial_len',    'length(dial_code) <= 6')
    ) as t(tbl, name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
       where conname = c.name and conrelid = c.tbl::regclass
    ) then
      begin
        execute format(
          'alter table %I add constraint %I check (%s) not valid',
          c.tbl, c.name, c.expr
        );
      exception
        when undefined_column then null;
      end;
    end if;
  end loop;
end $mig$;

-- =============================================================================
-- 5. `email` quitte le GRANT UPDATE
--
-- La colonne figurait dans les privileges d'ecriture du role `authenticated`
-- alors que `toAssociationPatchRow()` ne l'expose pas : l'interface ne permet
-- pas de la changer, une requete forgee si. Or `treasurerEmail()` en derive
-- l'adresse de connexion du tresorier, tandis que l'adresse Auth reelle, elle,
-- ne bouge pas — le locataire s'enfermait donc lui-meme dehors, avec pour tout
-- diagnostic un « Mot de passe Tresorier incorrect » qui n'explique rien.
--
-- L'adresse est fixee a l'inscription et sert d'ancre a l'identite Tresorier.
-- Le GRANT INSERT la conserve : elle est bien ecrite une fois, a la creation.
-- =============================================================================

revoke update (email) on associations from authenticated;

-- =============================================================================
-- 6. Validation des contraintes posees NOT VALID
--
-- 0002 et le §4 ci-dessus posent leurs contraintes `not valid` : elles
-- s'appliquent a tout ce qui est ecrit desormais, sans faire echouer la
-- migration sur des lignes anterieures. Les lignes anterieures, elles,
-- resteraient hors bornes indefiniment si personne ne validait.
--
-- Chaque VALIDATE prend un verrou court et rejette si une ligne viole la
-- contrainte — ce qui est precisement l'information recherchee. Le bloc
-- signale et poursuit, plutot que d'avorter la migration entiere sur une
-- donnee ancienne.
-- =============================================================================

do $mig$
declare
  c record;
  restant int := 0;
begin
  for c in
    select conrelid::regclass as tbl, conname
      from pg_constraint
     where contype = 'c'
       and not convalidated
       and connamespace = 'public'::regnamespace
  loop
    begin
      execute format('alter table %s validate constraint %I', c.tbl, c.conname);
    exception
      when check_violation then
        restant := restant + 1;
        raise notice 'A corriger avant validation : %.%', c.tbl, c.conname;
    end;
  end loop;

  if restant > 0 then
    raise notice '% contrainte(s) non validee(s) : des lignes existantes les violent.', restant;
  else
    raise notice 'Toutes les contraintes CHECK sont validees.';
  end if;
end $mig$;

-- =============================================================================
-- 7. Verification finale — doit rendre `true`
-- =============================================================================

select bool_and(ok) as tout_est_en_place
  from (values
    -- Le condensat Tresorier exige desormais le role, pas seulement le tenant.
    ((select count(*) from pg_policies
       where tablename = 'treasurer_secrets' and policyname = 'treasurer_secrets_select'
         and qual like '%can_write()%') = 1),
    -- La passation existe et n'est ouverte qu'au role authenticated.
    (has_function_privilege('authenticated','rotate_treasurer_identity(uuid)','EXECUTE')),
    (not has_function_privilege('anon','rotate_treasurer_identity(uuid)','EXECUTE')),
    -- `email` n'est plus modifiable par le locataire.
    (not has_column_privilege('authenticated','associations','email','UPDATE')),
    -- ... mais reste ecrite a l'inscription.
    (has_column_privilege('authenticated','associations','email','INSERT')),
    -- Le paywall n'a pas bouge.
    (not has_column_privilege('authenticated','associations','statut_abonnement','UPDATE')),
    (not has_column_privilege('authenticated','associations','date_expiration_acces','UPDATE')),
    (not has_column_privilege('authenticated','associations','treasurer_user_id','UPDATE')),
    -- Les bornes du §4 sont posees.
    (exists (select 1 from pg_constraint where conname = 'members_id_len')),
    (exists (select 1 from pg_constraint where conname = 'assoc_ville_len'))
  ) as t(ok);
