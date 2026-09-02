-- =============================================================================
-- AssoCaisse — les notes internes quittent la table `associations`
--
-- La console d'administration annonce ce champ comme « visible ici seulement ».
-- Ce n'etait pas vrai : `grant select on associations to authenticated` porte
-- sur TOUTES les colonnes, et la politique de lecture laisse chaque association
-- lire sa propre ligne. Le client du locataire telechargeait donc la note que
-- l'Admin Plateforme avait ecrite a son sujet — « mauvais payeur », reference de
-- paiement, historique de relance — et la recopiait dans son cache IndexedDB.
--
-- Meme remede que pour `tresorier_secret` en 0002 : une table a part, dont la
-- politique exige `is_platform_admin()`. La solution alternative — des GRANT par
-- colonne sur `associations` — casserait les `select('*')` du moteur de
-- synchronisation, qui echouent des qu'une seule colonne echappe au role.
--
-- A appliquer apres 0002_durcissement.sql. Rejouable sans dommage.
-- =============================================================================

create table if not exists association_notes (
  association_id uuid primary key references associations(id) on delete cascade,
  notes          text not null default '',
  updated_at     timestamptz not null default now()
);

drop trigger if exists association_notes_touch on association_notes;
create trigger association_notes_touch before insert or update on association_notes
  for each row execute function touch_updated_at();

-- Reprise des notes existantes avant de supprimer la colonne d'origine.
-- `if exists` sur la colonne : la migration doit pouvoir etre rejouee une fois
-- que `associations.notes` a deja disparu.
do $mig$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'associations'
       and column_name = 'notes'
  ) then
    execute $sql$
      insert into association_notes (association_id, notes)
        select id, notes from associations where notes <> ''
        on conflict (association_id) do nothing
    $sql$;
  end if;
end $mig$;

alter table associations drop column if exists notes;

-- --- RLS : l'Admin Plateforme, et personne d'autre -------------------------
--
-- Aucune politique ne mentionne l'association concernee : le locataire n'a
-- aucune ligne visible ici, pas meme la sienne. C'est tout l'objet du
-- changement.

alter table association_notes enable row level security;

drop policy if exists association_notes_select on association_notes;
drop policy if exists association_notes_write  on association_notes;

create policy association_notes_select on association_notes for select to authenticated
  using (is_platform_admin());

create policy association_notes_write on association_notes for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

revoke all on association_notes from anon, authenticated;
grant select, insert, update, delete on association_notes to authenticated;

-- --- Ecriture par la console ------------------------------------------------
--
-- `admin_set_subscription` ecrivait `notes` sur la ligne `associations`. Elle
-- vise desormais la nouvelle table ; sa garde `is_platform_admin()` est
-- inchangee, et reste le seul chemin d'ecriture de l'abonnement.

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
         date_expiration_acces = new_expiry
   where id = target_id;

  if not found then
    raise exception 'Association introuvable' using errcode = 'P0002';
  end if;

  -- `null` signifie « ne touche pas a la note », pas « efface-la » : la console
  -- envoie ce parametre a vide quand elle ne fait que prolonger un abonnement.
  if new_notes is not null then
    insert into association_notes (association_id, notes)
    values (target_id, new_notes)
    on conflict (association_id) do update set notes = excluded.notes;
  end if;
end $$;

revoke all on function admin_set_subscription(uuid, text, date, text) from public, anon;
grant execute on function admin_set_subscription(uuid, text, date, text) to authenticated;

-- --- Borne de taille --------------------------------------------------------
--
-- Reprend `assoc_notes_len`, disparue avec la colonne qu'elle protegeait.

do $mig$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'association_notes_len'
       and conrelid = 'association_notes'::regclass
  ) then
    alter table association_notes
      add constraint association_notes_len check (length(notes) <= 2000) not valid;
  end if;
end $mig$;
