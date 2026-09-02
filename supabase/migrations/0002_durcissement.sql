-- =============================================================================
-- AssoCaisse — durcissement de securite
--
-- Cette migration deplace vers la base trois controles qui ne vivaient que dans
-- le navigateur, et qu'une ligne de console suffisait donc a contourner :
--
--   1. Le role Tresorier      — etait un champ de localStorage.
--   2. L'abonnement (paywall) — etait un `if` dans un composant React.
--   3. L'ecriture Admin       — etait bloquee par les privileges de colonnes,
--                               au point que la console ne pouvait plus rien
--                               ecrire du tout.
--
-- Principe directeur inchange : une politique RLS filtre des LIGNES, un GRANT
-- filtre des COLONNES, et une fonction `security definer` est le seul chemin
-- par lequel un role peut ecrire ce que ni l'un ni l'autre ne lui accorde.
--
-- A appliquer apres 0001_init.sql, dans le SQL Editor de Supabase.
-- =============================================================================

-- =============================================================================
-- 1. search_path fige sur la fonction de trigger
--
-- `updated_at` est le curseur de synchronisation : un `now()` detourne via un
-- search_path hostile ferait reculer ce curseur et disparaitre des lignes de la
-- vue des autres appareils. Les deux fonctions `security definer` de 0001
-- etaient deja protegees ; celle-ci avait ete oubliee.
-- =============================================================================

create or replace function touch_updated_at() returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =============================================================================
-- 2. Le secret Tresorier quitte la table `associations`
--
-- `grant select on associations to authenticated` porte sur TOUTES les
-- colonnes, et la politique de lecture laisse passer l'Admin Plateforme : le
-- condensat PBKDF2 du mot de passe Tresorier de chaque association lui etait
-- donc lisible, et atterrissait dans l'etat React de la console.
--
-- Dans sa propre table, il redevient lisible par la seule association
-- concernee — l'Admin Plateforme, dont `current_association_id()` vaut NULL,
-- n'y a acces a aucune ligne.
-- =============================================================================

create table if not exists treasurer_secrets (
  association_id uuid primary key references associations(id) on delete cascade,
  -- {salt, hash} PBKDF2-SHA256 produit par src/lib/auth.ts. Sert uniquement au
  -- deverrouillage HORS LIGNE ; l'autorite d'ecriture, elle, vient desormais de
  -- l'identite Supabase Auth du Tresorier (section 3).
  secret         jsonb not null,
  updated_at     timestamptz not null default now()
);

drop trigger if exists treasurer_secrets_touch on treasurer_secrets;
create trigger treasurer_secrets_touch before insert or update on treasurer_secrets
  for each row execute function touch_updated_at();

-- Reprise des secrets existants avant de supprimer la colonne d'origine.
insert into treasurer_secrets (association_id, secret)
  select id, tresorier_secret from associations
  on conflict (association_id) do nothing;

alter table associations drop column if exists tresorier_secret;

-- =============================================================================
-- 3. Le role Tresorier devient une identite Supabase Auth
--
-- Une association porte desormais DEUX comptes Auth :
--
--   auth_user_id       — le bureau. Lecture seule. C'est le mot de passe
--                        partage, celui qui ouvre l'application.
--   treasurer_user_id  — le Tresorier. Seul a pouvoir ecrire.
--
-- Le deverrouillage hors ligne reste possible : la session Tresorier est
-- persistee sur l'appareil et le condensat PBKDF2 mis en cache sert de garde
-- d'affichage. Ce qui change, c'est que basculer le drapeau local ne suffit
-- plus — c'est Postgres qui refuse l'ecriture.
-- =============================================================================

alter table associations
  add column if not exists treasurer_user_id uuid unique
    references auth.users(id) on delete set null;

-- L'association du porteur du jeton, quel que soit son role.
--
-- Le `coalesce` n'est pas cosmetique : il rend la fonction DETERMINISTE. Sans
-- lui, une association qui designerait comme « son » tresorier le compte d'une
-- autre association ferait renvoyer deux lignes a la sous-requete, et le
-- client de la victime pourrait se retrouver pointe sur le grand livre de
-- l'attaquant. La ligne dont on est proprietaire l'emporte toujours.
create or replace function current_association_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select id from associations where auth_user_id      = auth.uid()),
    (select id from associations where treasurer_user_id = auth.uid())
  )
$$;

-- Droit d'ecriture = etre le Tresorier de l'association courante.
--
-- La comparaison avec `current_association_id()` est indispensable : sans elle,
-- etre tresorier de n'importe quelle association suffirait a ecrire dans celle
-- que le jeton designe.
create or replace function can_write() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from associations
     where treasurer_user_id = auth.uid()
       and id = current_association_id()
  )
$$;

-- =============================================================================
-- 4. L'abonnement devient une regle de base de donnees
--
-- Lecture toujours ouverte — « vos donnees sont conservees et resteront
-- consultables » est la promesse commerciale. Seule l'ECRITURE est coupee.
-- =============================================================================

create or replace function has_active_access() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from associations
     where id = current_association_id()
       and statut_abonnement in ('actif','essai')
       and date_expiration_acces >= current_date
  )
$$;

-- Predicat d'ecriture du grand livre, en un seul endroit : appartenance au
-- locataire, role Tresorier, abonnement valide.
create or replace function may_write_ledger(row_association_id uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select row_association_id = current_association_id()
     and can_write()
     and has_active_access()
$$;

-- =============================================================================
-- 5. Designation du Tresorier
--
-- `treasurer_user_id` n'est accorde par aucun GRANT : cette fonction est le
-- seul chemin d'ecriture. Elle n'accepte d'etre appelee que par le titulaire du
-- compte de l'association — celui qui detient le mot de passe du bureau.
-- =============================================================================

create or replace function set_treasurer_identity(treasurer_uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  own_id uuid;
begin
  select id into own_id from associations where auth_user_id = auth.uid();
  if own_id is null then
    raise exception 'Aucune association rattachee a ce compte'
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

-- =============================================================================
-- 6. Ecritures de l'Admin Plateforme
--
-- Les privileges de colonnes de 0001 protegent le paywall — et bloquaient du
-- meme coup son seul operateur legitime, qui se connecte lui aussi avec le role
-- `authenticated` : renouvellement, suspension et suppression echouaient tous
-- en « permission denied ». Aucun `grant delete on associations` n'avait par
-- ailleurs ete accorde.
--
-- La reponse n'est SURTOUT PAS d'elargir les GRANT : cela offrirait a chaque
-- locataire un abonnement illimite en libre-service. C'est un chemin dedie, qui
-- verifie lui-meme son autorisation.
-- =============================================================================

create or replace function admin_set_subscription(
  target_id  uuid,
  new_statut text,
  new_expiry date,
  new_notes  text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_platform_admin() then
    raise exception 'Reserve a l''administrateur de la plateforme'
      using errcode = '42501';
  end if;

  if new_statut not in ('actif','essai','suspendu','expire') then
    raise exception 'Statut d''abonnement invalide : %', new_statut
      using errcode = '22023';
  end if;

  if new_expiry is null then
    raise exception 'Date d''expiration obligatoire' using errcode = '22023';
  end if;

  update associations
     set statut_abonnement     = new_statut,
         date_expiration_acces = new_expiry,
         notes                 = coalesce(new_notes, notes)
   where id = target_id;

  if not found then
    raise exception 'Association introuvable' using errcode = 'P0002';
  end if;
end $$;

revoke all on function admin_set_subscription(uuid, text, date, text) from public, anon;
grant execute on function admin_set_subscription(uuid, text, date, text) to authenticated;

create or replace function admin_delete_association(target_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_platform_admin() then
    raise exception 'Reserve a l''administrateur de la plateforme'
      using errcode = '42501';
  end if;

  delete from associations where id = target_id;

  if not found then
    raise exception 'Association introuvable' using errcode = 'P0002';
  end if;
end $$;

revoke all on function admin_delete_association(uuid) from public, anon;
grant execute on function admin_delete_association(uuid) to authenticated;

-- =============================================================================
-- 7. Politiques RLS
--
-- Le grand livre passe d'une politique unique `for all` a un couple
-- lecture / ecriture. Les politiques etant combinees en OU, la lecture reste
-- ouverte aux deux roles tandis que l'ecriture exige les trois conditions.
-- =============================================================================

-- --- associations ------------------------------------------------------------

drop policy if exists associations_select on associations;
create policy associations_select on associations for select to authenticated
  using (
    auth_user_id      = auth.uid()
    or treasurer_user_id = auth.uid()
    or is_platform_admin()
  );

-- Les parametres de l'association (nom, signataires du rapport d'AG, logo)
-- sont des actions Tresorier : meme exigence que le grand livre.
drop policy if exists associations_update on associations;
create policy associations_update on associations for update to authenticated
  using (
    (id = current_association_id() and can_write() and has_active_access())
    or is_platform_admin()
  )
  with check (
    (id = current_association_id() and can_write() and has_active_access())
    or is_platform_admin()
  );

-- --- grand livre -------------------------------------------------------------

drop policy if exists categories_all    on categories;
drop policy if exists members_all       on members;
drop policy if exists due_payments_all  on due_payments;
drop policy if exists campaigns_all     on campaigns;
drop policy if exists contributions_all on contributions;
drop policy if exists expenses_all      on expenses;

drop policy if exists categories_read     on categories;
drop policy if exists categories_write    on categories;
drop policy if exists members_read        on members;
drop policy if exists members_write       on members;
drop policy if exists due_payments_read   on due_payments;
drop policy if exists due_payments_write  on due_payments;
drop policy if exists campaigns_read      on campaigns;
drop policy if exists campaigns_write     on campaigns;
drop policy if exists contributions_read  on contributions;
drop policy if exists contributions_write on contributions;
drop policy if exists expenses_read       on expenses;
drop policy if exists expenses_write      on expenses;

create policy categories_read on categories for select to authenticated
  using (association_id = current_association_id());
create policy categories_write on categories for all to authenticated
  using (may_write_ledger(association_id))
  with check (may_write_ledger(association_id));

create policy members_read on members for select to authenticated
  using (association_id = current_association_id());
create policy members_write on members for all to authenticated
  using (may_write_ledger(association_id))
  with check (may_write_ledger(association_id));

create policy due_payments_read on due_payments for select to authenticated
  using (association_id = current_association_id());
create policy due_payments_write on due_payments for all to authenticated
  using (may_write_ledger(association_id))
  with check (may_write_ledger(association_id));

create policy campaigns_read on campaigns for select to authenticated
  using (association_id = current_association_id());
create policy campaigns_write on campaigns for all to authenticated
  using (may_write_ledger(association_id))
  with check (may_write_ledger(association_id));

create policy contributions_read on contributions for select to authenticated
  using (association_id = current_association_id());
create policy contributions_write on contributions for all to authenticated
  using (may_write_ledger(association_id))
  with check (may_write_ledger(association_id));

create policy expenses_read on expenses for select to authenticated
  using (association_id = current_association_id());
create policy expenses_write on expenses for all to authenticated
  using (may_write_ledger(association_id))
  with check (may_write_ledger(association_id));

-- --- secret Tresorier --------------------------------------------------------

alter table treasurer_secrets enable row level security;

drop policy if exists treasurer_secrets_select on treasurer_secrets;
drop policy if exists treasurer_secrets_insert on treasurer_secrets;
drop policy if exists treasurer_secrets_update on treasurer_secrets;

create policy treasurer_secrets_select on treasurer_secrets for select to authenticated
  using (association_id = current_association_id());

-- L'insertion appartient au titulaire du compte : elle a lieu a la creation de
-- l'association, avant que la moindre identite Tresorier n'existe.
create policy treasurer_secrets_insert on treasurer_secrets for insert to authenticated
  with check (association_id = current_association_id());

-- La modification, elle, est une action Tresorier a part entiere.
create policy treasurer_secrets_update on treasurer_secrets for update to authenticated
  using (association_id = current_association_id() and can_write())
  with check (association_id = current_association_id() and can_write());

revoke all on treasurer_secrets from anon, authenticated;
grant select, insert, update on treasurer_secrets to authenticated;

-- --- justificatifs (Supabase Storage) ---------------------------------------
--
-- La lecture suit l'association ; deposer et supprimer une photo sont des
-- ecritures comptables, soumises aux memes conditions que le grand livre.

drop policy if exists receipts_select on storage.objects;
drop policy if exists receipts_insert on storage.objects;
drop policy if exists receipts_update on storage.objects;
drop policy if exists receipts_delete on storage.objects;

create policy receipts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
  );

create policy receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
    and can_write()
    and has_active_access()
  );

create policy receipts_update on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
    and can_write()
    and has_active_access()
  );

create policy receipts_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
    and can_write()
    and has_active_access()
  );

-- =============================================================================
-- 8. Privileges de colonnes
--
-- `tresorier_secret` a disparu de la table ; `treasurer_user_id` n'est
-- volontairement accorde nulle part — seule set_treasurer_identity() l'ecrit.
-- Les colonnes d'abonnement restent, elles aussi, hors de portee.
-- =============================================================================

revoke all on associations from anon, authenticated;

grant select on associations to authenticated;

grant insert (id, auth_user_id, nom, sigle, ville, pays, responsable, dial_code,
              telephone, email, treasurer_name, president_name, currency,
              fiscal_start, logo)
  on associations to authenticated;

grant update (nom, sigle, ville, pays, responsable, dial_code, telephone, email,
              treasurer_name, president_name, currency, fiscal_start, logo)
  on associations to authenticated;

-- =============================================================================
-- 9. Bornes sur les donnees
--
-- Il n'existe aucune couche serveur entre le navigateur et Postgres : sans ces
-- contraintes, une requete forgee peut ecrire un libelle de 100 Mo ou un
-- montant negatif dans son propre locataire. La RLS tient (rien ne fuit d'un
-- locataire a l'autre), mais le quota de la base, lui, est commun.
--
-- `not valid` : les contraintes s'appliquent a tout ce qui est ecrit ou modifie
-- desormais, sans que la migration puisse echouer sur des lignes existantes.
-- Une fois les donnees verifiees :
--   alter table expenses validate constraint expenses_label_len;  (etc.)
-- =============================================================================

-- Pose idempotente : la migration doit pouvoir etre rejouee sans echouer sur
-- une contrainte deja presente (`add constraint` n'a pas d'`if not exists`).
do $mig$
declare
  c record;
begin
  for c in
    select * from (values
      ('associations',  'assoc_nom_len',            'length(nom) <= 150'),
      ('associations',  'assoc_sigle_len',          'length(sigle) <= 30'),
      ('associations',  'assoc_email_len',          'length(email) <= 254'),
      ('associations',  'assoc_notes_len',          'length(notes) <= 2000'),
      -- Le logo voyage en data URL dans la ligne. compressLogo vise 40 Ko
      -- binaires, soit ~55 Ko une fois encode en base64 : 80 000 laisse marge.
      ('associations',  'assoc_logo_size',          'logo is null or length(logo) <= 80000'),

      ('categories',    'cat_name_len',             'length(name) <= 60'),
      ('categories',    'cat_amount_range',         'monthly_amount between 0 and 100000000'),

      ('members',       'members_name_len',         'length(full_name) <= 150'),
      ('members',       'members_phone_len',        'length(phone) <= 30'),
      ('members',       'members_note_len',         'note is null or length(note) <= 1000'),

      ('due_payments',  'due_amount_range',         'amount between 0 and 1000000000'),
      ('due_payments',  'due_period_fmt',           'period ~ ''^[0-9]{4}-[0-9]{2}$'''),
      ('due_payments',  'due_note_len',             'note is null or length(note) <= 1000'),

      ('campaigns',     'camp_title_len',           'length(title) <= 150'),
      ('campaigns',     'camp_desc_len',            'length(description) <= 2000'),
      ('campaigns',     'camp_target_range',        'target_amount between 0 and 1000000000'),

      ('contributions', 'contrib_amount_range',     'amount between 0 and 1000000000'),
      ('contributions', 'contrib_donor_len',        'donor_name is null or length(donor_name) <= 150'),
      ('contributions', 'contrib_note_len',         'note is null or length(note) <= 1000'),

      ('expenses',      'expenses_label_len',       'length(label) <= 200'),
      ('expenses',      'expenses_beneficiary_len', 'length(beneficiary) <= 200'),
      ('expenses',      'expenses_amount_range',    'amount between 0 and 1000000000'),
      ('expenses',      'expenses_note_len',        'note is null or length(note) <= 1000'),
      -- Les cles de justificatif sont produites par uid('rcpt') : un UUID prefixe.
      ('expenses',      'expenses_receipt_key_fmt', 'receipt_key is null or receipt_key ~ ''^rcpt_[0-9a-f-]{36}$'''),

      ('platform_settings', 'platform_nom_len',     'length(nom) <= 100'),
      ('platform_settings', 'platform_email_len',   'length(email) <= 254'),
      ('platform_settings', 'platform_tel_len',     'length(telephone) <= 30')
    ) as t(tbl, name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
       where conname = c.name and conrelid = c.tbl::regclass
    ) then
      -- Une migration ulterieure peut avoir deplace la colonne visee ailleurs
      -- (0003 sort `associations.notes` dans sa propre table). Rejouer ce
      -- fichier ne doit pas echouer pour autant.
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
