-- =============================================================================
-- AssoCaisse — schema initial
--
-- Un « tenant » = une association = une ligne dans `associations`, liee a un
-- utilisateur Supabase Auth. Toutes les tables du grand livre portent une
-- `association_id` et sont isolees par RLS : une association est dans
-- l'incapacite technique de lire les donnees d'une autre.
--
-- Colonnes de synchronisation presentes sur chaque table du grand livre :
--   updated_at  — posee par trigger, jamais par le client (horloges des
--                 telephones non fiables ; le curseur de pull en depend).
--   deleted_at  — pierre tombale. Les suppressions ne sont jamais physiques,
--                 sinon un appareil hors ligne ne pourrait pas apprendre
--                 qu'une ligne a disparu.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- utilitaires

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -------------------------------------------------------------- associations

create table associations (
  id                    uuid primary key default gen_random_uuid(),
  auth_user_id          uuid unique not null references auth.users(id) on delete cascade,

  -- Identite. Anciennement AssociationAccount + DB.association, fusionnes :
  -- les deux dupliquaient nom/sigle/ville/pays, ce que `syncAccountIdentity`
  -- passait son temps a rattraper cote client.
  nom                   text not null,
  sigle                 text not null default '',
  ville                 text not null default '',
  pays                  text not null default 'Burkina Faso',
  responsable           text not null default '',
  dial_code             text not null default '226',
  telephone             text not null default '',
  email                 text not null,

  -- Parametres du grand livre.
  treasurer_name        text not null default '',
  president_name        text not null default '',
  currency              text not null default 'F CFA',
  fiscal_start          text not null default '',
  logo                  text,

  -- Mot de passe Tresorier : PBKDF2 {salt,hash} produit par src/lib/auth.ts.
  -- Lisible seulement par la session de l'association elle-meme, qui le met en
  -- cache local pour permettre le deverrouillage hors ligne.
  tresorier_secret      jsonb not null,

  -- Abonnement : propriete de l'Admin Plateforme. Le locataire ne doit JAMAIS
  -- pouvoir ecrire ces colonnes — applique par les GRANT de colonnes plus bas,
  -- pas par une politique (une politique ne sait pas filtrer par colonne).
  statut_abonnement     text not null default 'essai'
                          check (statut_abonnement in ('actif','essai','suspendu','expire')),
  date_expiration_acces date not null default (current_date + 30),
  date_creation         date not null default current_date,
  notes                 text not null default '',

  updated_at            timestamptz not null default now()
);

create trigger associations_touch before insert or update on associations
  for each row execute function touch_updated_at();

-- L'association de l'utilisateur courant. `security definer` est indispensable :
-- la fonction doit lire `associations` en contournant la RLS, sinon la politique
-- qui l'appelle se rappellerait elle-meme (recursion infinie).
create or replace function current_association_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from associations where auth_user_id = auth.uid()
$$;

create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- Coordonnees affichees sur /contact et /acces-expire — deux pages atteintes
-- SANS session valide, d'ou la lecture anonyme.
create table platform_settings (
  id         boolean primary key default true check (id),
  nom        text not null default 'AssoCaisse',
  dial_code  text not null default '226',
  telephone  text not null default '',
  email      text not null default '',
  updated_at timestamptz not null default now()
);
insert into platform_settings (id) values (true);

create trigger platform_settings_touch before insert or update on platform_settings
  for each row execute function touch_updated_at();

-- ------------------------------------------------------ tables du grand livre

create table categories (
  id             text primary key,
  association_id uuid not null references associations(id) on delete cascade,
  name           text not null default '',
  monthly_amount integer not null default 0,
  color          text not null default 'brand',
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table members (
  id             text primary key,
  association_id uuid not null references associations(id) on delete cascade,
  full_name      text not null default '',
  dial_code      text not null default '226',
  phone          text not null default '',
  category_id    text references categories(id) on delete set null,
  join_date      date,
  active         boolean not null default true,
  note           text,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table due_payments (
  id             text primary key,
  association_id uuid not null references associations(id) on delete cascade,
  member_id      text references members(id) on delete cascade,
  period         text not null default '',
  amount         integer not null default 0,
  date           date,
  method         text not null default 'especes',
  note           text,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table campaigns (
  id             text primary key,
  association_id uuid not null references associations(id) on delete cascade,
  title          text not null default '',
  description    text not null default '',
  target_amount  integer not null default 0,
  deadline       date,
  status         text not null default 'open' check (status in ('open','closed')),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table contributions (
  id             text primary key,
  association_id uuid not null references associations(id) on delete cascade,
  campaign_id    text references campaigns(id) on delete cascade,
  -- null => donateur externe. C'est aussi l'etat d'une contribution dont le
  -- membre a ete supprime : l'argent a bien ete recu, il reste au total.
  member_id      text references members(id) on delete set null,
  donor_name     text,
  amount         integer not null default 0,
  date           date,
  method         text not null default 'especes',
  note           text,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table expenses (
  id             text primary key,
  association_id uuid not null references associations(id) on delete cascade,
  label          text not null default '',
  beneficiary    text not null default '',
  amount         integer not null default 0,
  category       text not null default 'autre',
  date           date,
  receipt_key    text,
  note           text,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- Index du curseur de synchronisation : chaque pull est exactement
-- `where association_id = ? and updated_at > ? order by updated_at`.
create index categories_sync_idx    on categories    (association_id, updated_at);
create index members_sync_idx       on members       (association_id, updated_at);
create index due_payments_sync_idx  on due_payments  (association_id, updated_at);
create index campaigns_sync_idx     on campaigns     (association_id, updated_at);
create index contributions_sync_idx on contributions (association_id, updated_at);
create index expenses_sync_idx      on expenses      (association_id, updated_at);

create trigger categories_touch    before insert or update on categories
  for each row execute function touch_updated_at();
create trigger members_touch       before insert or update on members
  for each row execute function touch_updated_at();
create trigger due_payments_touch  before insert or update on due_payments
  for each row execute function touch_updated_at();
create trigger campaigns_touch     before insert or update on campaigns
  for each row execute function touch_updated_at();
create trigger contributions_touch before insert or update on contributions
  for each row execute function touch_updated_at();
create trigger expenses_touch      before insert or update on expenses
  for each row execute function touch_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

alter table associations      enable row level security;
alter table platform_admins   enable row level security;
alter table platform_settings enable row level security;
alter table categories        enable row level security;
alter table members           enable row level security;
alter table due_payments      enable row level security;
alter table campaigns         enable row level security;
alter table contributions     enable row level security;
alter table expenses          enable row level security;

-- --- associations ------------------------------------------------------------

-- Chaque association voit sa propre ligne ; l'Admin Plateforme les voit toutes.
create policy associations_select on associations for select to authenticated
  using (auth_user_id = auth.uid() or is_platform_admin());

-- Inscription : on ne peut creer QUE sa propre ligne. `unique(auth_user_id)`
-- garantit qu'un compte ne peut pas s'en fabriquer une deuxieme.
create policy associations_insert on associations for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy associations_update on associations for update to authenticated
  using (auth_user_id = auth.uid() or is_platform_admin())
  with check (auth_user_id = auth.uid() or is_platform_admin());

create policy associations_delete on associations for delete to authenticated
  using (is_platform_admin());

-- --- grand livre : une seule regle, la meme partout --------------------------

create policy categories_all on categories for all to authenticated
  using (association_id = current_association_id())
  with check (association_id = current_association_id());

create policy members_all on members for all to authenticated
  using (association_id = current_association_id())
  with check (association_id = current_association_id());

create policy due_payments_all on due_payments for all to authenticated
  using (association_id = current_association_id())
  with check (association_id = current_association_id());

create policy campaigns_all on campaigns for all to authenticated
  using (association_id = current_association_id())
  with check (association_id = current_association_id());

create policy contributions_all on contributions for all to authenticated
  using (association_id = current_association_id())
  with check (association_id = current_association_id());

create policy expenses_all on expenses for all to authenticated
  using (association_id = current_association_id())
  with check (association_id = current_association_id());

-- --- plateforme --------------------------------------------------------------

create policy platform_admins_select on platform_admins for select to authenticated
  using (user_id = auth.uid());

-- Lecture anonyme volontaire : /contact doit s'afficher sans session.
create policy platform_settings_select on platform_settings for select
  to anon, authenticated using (true);

create policy platform_settings_update on platform_settings for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- =============================================================================
-- Privileges de colonnes — c'est ici que vit le paywall
--
-- Une politique RLS filtre des LIGNES, pas des COLONNES. Sans les GRANT qui
-- suivent, une association authentifiee pourrait parfaitement s'auto-prolonger
-- son abonnement : la ligne lui appartient, la politique la laisse passer.
-- =============================================================================

revoke all on associations from anon, authenticated;

grant select on associations to authenticated;

-- statut_abonnement / date_expiration_acces / date_creation / notes sont
-- volontairement absents : ils prennent les valeurs par defaut de la table
-- (essai, +30 jours) et seul l'Admin Plateforme peut les changer ensuite.
grant insert (id, auth_user_id, nom, sigle, ville, pays, responsable, dial_code,
              telephone, email, treasurer_name, president_name, currency,
              fiscal_start, logo, tresorier_secret)
  on associations to authenticated;

grant update (nom, sigle, ville, pays, responsable, dial_code, telephone, email,
              treasurer_name, president_name, currency, fiscal_start, logo,
              tresorier_secret)
  on associations to authenticated;

-- L'Admin Plateforme passe par le role `service_role` (cle de service, jamais
-- expedie au navigateur d'un locataire), qui ignore RLS et privileges.

revoke all on platform_admins, platform_settings from anon, authenticated;
grant select on platform_admins to authenticated;
grant select on platform_settings to anon, authenticated;
grant update (nom, dial_code, telephone, email) on platform_settings to authenticated;

-- Tables du grand livre : aucune colonne sensible, la RLS suffit.
grant select, insert, update, delete
  on categories, members, due_payments, campaigns, contributions, expenses
  to authenticated;

-- =============================================================================
-- Realtime — un pull cible declenche par les changements des autres appareils
-- =============================================================================

alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table due_payments;
alter publication supabase_realtime add table campaigns;
alter publication supabase_realtime add table contributions;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table associations;

-- =============================================================================
-- Stockage des recus
--
-- Chemin : <association_id>/<receiptKey>.jpg — le premier segment porte
-- l'isolation, exactement comme `association_id` la porte en base.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
  );

create policy receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
  );

create policy receipts_update on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
  );

create policy receipts_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = current_association_id()::text
  );
