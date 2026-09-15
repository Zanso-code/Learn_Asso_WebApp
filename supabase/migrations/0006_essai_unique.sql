-- =============================================================================
-- AssoCaisse — une periode d'essai par ASSOCIATION, et non par compte
--
-- Constat du 15 septembre 2026. L'essai gratuit se recycle a l'infini :
--
--   1. exporter le grand livre (Excel ou JSON) peu avant la fin de l'essai ;
--   2. inscrire un nouveau compte, qui recoit `current_date + 30` (0001) ;
--   3. restaurer la sauvegarde ; recommencer trente jours plus tard.
--
-- Cause : rien ne rattache un compte neuf a l'association dont il transporte
-- les donnees. L'essai appartient au LOGIN.
--
-- Ce que la base fait deja, par accident : les identifiants du grand livre sont
-- des cles primaires GLOBALES, et le moteur pousse en `upsert(onConflict: 'id')`.
-- Tant que l'ancienne association existe, la restauration heurte les lignes
-- d'un autre locataire, la RLS la refuse et l'operation part en file morte —
-- mais l'appareil qui a restaure garde tout dans son miroir IndexedDB, et
-- continue de s'en servir. Une fois l'ancien compte supprime par la console, ou
-- les identifiants regeneres, plus rien ne s'y oppose.
--
-- Ce fichier donne a l'essai une identite qui survit au changement de compte :
--
--   §2  un registre des essais et des empreintes, SANS cle etrangere, pour
--       qu'il survive a admin_delete_association() ;
--   §4  a la creation d'un compte, l'empreinte du fondateur (e-mail, telephone)
--       — signalee a l'admin, jamais bloquante : une meme personne tient
--       souvent plusieurs tontines, et le telephone n'est pas verifie ;
--   §5  sur `members`, trois gardes : identifiants venus d'une sauvegarde d'une
--       autre association, plafond de membres pendant l'essai, et
--       comparaison de l'effectif avec les associations plus anciennes ;
--   §6  l'heritage : une association reconnue reprend la date de fin d'essai
--       de l'originale — lecture seule immediate si elle est passee ;
--   §7  deux RPC pour la console : lister les signalements, trancher.
--
-- Principe inchange : les donnees ne sont jamais prises en otage. Export et
-- lecture restent ouverts ; seule l'ECRITURE qu'accorde un essai est en jeu.
--
-- A appliquer apres 0005_cloison_tresorier.sql, AVANT de deployer le client
-- qui lit `associations.essai_herite` (sinon 42703 a la connexion). Rejouable.
-- =============================================================================

-- =============================================================================
-- 1. Schema `private`
--
-- PostgREST n'expose que `public`. Les tables et fonctions internes vivent ici :
-- une fonction comme `inherit_trial()`, appelable en RPC, permettrait a
-- n'importe quel locataire de mettre fin a l'essai d'un autre.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- =============================================================================
-- 2. Registre des essais, empreintes, signalements
--
-- Aucune cle etrangere vers `associations` : c'est tout l'objet. Une
-- association supprimee doit rester reconnaissable, sinon supprimer les essais
-- expires rouvrirait la faille.
-- =============================================================================

create table if not exists private.trial_registry (
  association_id uuid primary key,
  -- Ordre d'anciennete : l'originale est toujours la plus ancienne des deux.
  created_at     timestamptz not null default now(),
  -- Fin de l'essai propre a cette association, reduite si elle en a herite.
  -- La console peut prolonger `date_expiration_acces` : ce champ-ci, lui, ne
  -- bouge pas, et c'est lui qu'une copie herite.
  trial_ends     date not null,
  inherited_from uuid
);

-- `digest` : SHA-256 hexadecimal de la valeur normalisee (§3). Les telephones
-- et e-mails n'y figurent jamais en clair.
create table if not exists private.association_fingerprints (
  association_id uuid not null,
  kind           text not null
                   check (kind in ('member_id', 'member_phone', 'founder_email', 'founder_phone')),
  digest         text not null,
  created_at     timestamptz not null default now(),
  primary key (association_id, kind, digest)
);

create index if not exists association_fingerprints_lookup
  on private.association_fingerprints (kind, digest);

create table if not exists private.trial_flags (
  id             bigint generated always as identity primary key,
  association_id uuid not null,
  origin_id      uuid not null,
  signal         text not null
                   check (signal in ('ids_sauvegarde', 'copie_effectif', 'sous_ensemble',
                                     'fondateur_email', 'fondateur_phone')),
  -- Pourcentage : Jaccard pour une copie, taux d'inclusion pour un sous-ensemble.
  score          numeric(5, 2),
  -- `essai_herite` : l'heritage a ete applique d'office.
  -- `a_verifier`   : rien n'a change, l'admin tranche.
  action         text not null check (action in ('essai_herite', 'a_verifier')),
  status         text not null default 'ouvert'
                   check (status in ('ouvert', 'confirme', 'legitime')),
  detected_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  -- Une paire n'est signalee qu'une fois par motif : c'est ce qui empeche une
  -- nouvelle saisie de re-couper un essai que l'admin vient de prolonger.
  unique (association_id, origin_id, signal)
);

alter table private.trial_registry           enable row level security;
alter table private.association_fingerprints enable row level security;
alter table private.trial_flags              enable row level security;

-- Aucune politique : seules les fonctions `security definer` ci-dessous, qui
-- s'executent en proprietaire, lisent et ecrivent ces tables.
revoke all on private.trial_registry, private.association_fingerprints, private.trial_flags
  from public, anon, authenticated;

-- Deux colonnes visibles du locataire (le GRANT SELECT de `associations` porte
-- sur la table entiere), inscriptibles par personne : absentes des GRANT
-- INSERT/UPDATE par colonne de 0002 §8.
--
-- `essai_herite` permet a l'ecran « acces expire » de dire pourquoi.
alter table associations add column if not exists essai_herite boolean not null default false;

-- `plafond_membres_essai` : membres autorises tant que l'association est en
-- essai. Ajoutee SANS valeur par defaut, puis dotee de celle-ci : les
-- associations existantes restent a NULL (aucun plafond, pas de changement de
-- regle en cours de route), les nouvelles recoivent 30. Le client la lit
-- (`plafondMembresEssai`) pour prevenir avant que la base ne refuse.
alter table associations add column if not exists plafond_membres_essai int;
alter table associations alter column plafond_membres_essai set default 30;

-- =============================================================================
-- 3. Normalisation et empreintes
-- =============================================================================

-- Indicatif + numero national, chiffres seuls. Rattrape les saisies courantes :
-- « 70 12 34 56 », « +226 70123456 », « 0022670123456 ». NULL sous 8 chiffres
-- nationaux : un numero incomplet ne doit rien rapprocher.
create or replace function private.norm_phone(dial text, num text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare
  d text := regexp_replace(coalesce(dial, ''), '\D', '', 'g');
  n text := regexp_replace(coalesce(num, ''), '\D', '', 'g');
begin
  if n like '00%' then
    n := substr(n, 3);
  end if;
  if d <> '' and n like d || '%' and length(n) - length(d) >= 8 then
    n := substr(n, length(d) + 1);
  end if;
  if length(n) < 8 then
    return null;
  end if;
  return d || n;
end $$;

-- Minuscules, sans sous-adresse (`bureau+essai2@…` = `bureau@…`), et sans les
-- points que Gmail ignore. Le sous-adressage n'est pas qu'une astuce de
-- contournement : l'application s'en sert elle-meme pour le compte Tresorier.
create or replace function private.norm_email(email text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare
  e      text := lower(trim(coalesce(email, '')));
  at     int  := position('@' in e);
  local  text;
  domain text;
begin
  if at <= 1 then
    return nullif(e, '');
  end if;
  local  := split_part(substr(e, 1, at - 1), '+', 1);
  domain := substr(e, at + 1);
  if domain in ('gmail.com', 'googlemail.com') then
    local  := replace(local, '.', '');
    domain := 'gmail.com';
  end if;
  if local = '' then
    return null;
  end if;
  return local || '@' || domain;
end $$;

create or replace function private.digest_of(v text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case when v is null or v = '' then null
              else encode(sha256(convert_to(v, 'UTF8')), 'hex') end
$$;

-- =============================================================================
-- 6. Heritage de l'essai
--
-- (Place avant §4 et §5, qui l'appellent.)
-- =============================================================================

-- Vrai si le signalement est NOUVEAU. Faux s'il existait deja, quel qu'en soit
-- le statut : une decision de l'admin ne doit pas etre defaite par la saisie
-- suivante.
create or replace function private.flag_trial(
  target uuid, origin uuid, sig text, sc numeric, act text
) returns boolean
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  insert into private.trial_flags (association_id, origin_id, signal, score, action)
  values (target, origin, sig, sc, act)
  on conflict (association_id, origin_id, signal) do nothing;
  return found;
end $$;

-- Ramene la fin d'essai de `target` a celle de `origin`. Ne touche qu'un essai :
-- une association qui paie n'est jamais concernee. `trial_ends` de l'originale
-- est deja reduit si elle-meme avait herite — les chaines se resolvent seules.
create or replace function private.apply_inherited_end(target uuid, origin uuid) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  origin_end date;
begin
  select trial_ends into origin_end from private.trial_registry where association_id = origin;
  if origin_end is null then
    return;
  end if;

  update associations
     set date_expiration_acces = least(date_expiration_acces, origin_end),
         essai_herite          = true
   where id = target
     and statut_abonnement = 'essai';

  if found then
    update private.trial_registry
       set trial_ends     = least(trial_ends, origin_end),
           inherited_from = coalesce(inherited_from, origin)
     where association_id = target;
  end if;
end $$;

create or replace function private.inherit_trial(
  target uuid, origin uuid, sig text, sc numeric
) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if private.flag_trial(target, origin, sig, sc, 'essai_herite') then
    perform private.apply_inherited_end(target, origin);
  end if;
end $$;

-- =============================================================================
-- 4. Fondateur : empreinte a l'inscription, signalement seul
-- =============================================================================

-- Enregistre une empreinte de fondateur et, si `flag`, signale chaque
-- association PLUS ANCIENNE qui porte la meme. Jamais d'heritage ici.
create or replace function private.record_founder(
  target uuid, k text, normalized text, flag boolean
) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  d         text := private.digest_of(normalized);
  t_created timestamptz;
  other     uuid;
begin
  if d is null then
    return;
  end if;

  if flag then
    select created_at into t_created from private.trial_registry where association_id = target;

    for other in
      select distinct f.association_id
        from private.association_fingerprints f
        join private.trial_registry r on r.association_id = f.association_id
       where f.kind = k
         and f.digest = d
         and f.association_id <> target
         and r.created_at < coalesce(t_created, now())
    loop
      perform private.flag_trial(
        target, other,
        case k when 'founder_email' then 'fondateur_email' else 'fondateur_phone' end,
        null, 'a_verifier'
      );
    end loop;
  end if;

  insert into private.association_fingerprints (association_id, kind, digest)
  values (target, k, d)
  on conflict do nothing;
end $$;

create or replace function private.associations_after_insert() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  insert into private.trial_registry (association_id, trial_ends)
  values (new.id, new.date_expiration_acces)
  on conflict (association_id) do nothing;

  perform private.record_founder(new.id, 'founder_email', private.norm_email(new.email), true);
  perform private.record_founder(
    new.id, 'founder_phone', private.norm_phone(new.dial_code, new.telephone), true);
  return null;
end $$;

-- Le telephone du fondateur reste modifiable par le locataire (0002 §8) : un
-- numero fantaisiste a l'inscription, corrige ensuite, doit laisser sa trace.
create or replace function private.associations_after_phone_update() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.record_founder(
    new.id, 'founder_phone', private.norm_phone(new.dial_code, new.telephone), true);
  return null;
end $$;

drop trigger if exists associations_trial_registry on associations;
create trigger associations_trial_registry after insert on associations
  for each row execute function private.associations_after_insert();

drop trigger if exists associations_founder_update on associations;
create trigger associations_founder_update after update of telephone, dial_code on associations
  for each row execute function private.associations_after_phone_update();

-- =============================================================================
-- 5. Gardes sur `members`
--
-- Le registre des membres est ce qui fait la valeur d'une association — celui
-- qui recycle un essai doit forcement l'emporter avec lui. C'est donc ici que
-- la copie se reconnait.
-- =============================================================================

-- Compare l'effectif de `target` a celui des associations plus anciennes,
-- supprimees comprises. `apply = false` : signaler sans rien couper (reprise de
-- l'existant, §8).
create or replace function private.evaluate_trial_recycling(target uuid, apply boolean)
returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  -- Seuils. Une copie reprend l'effectif presque entier (Jaccard eleve) ; une
  -- section de jeunes ou un bureau reprend une PARTIE d'une grande association
  -- (inclusion elevee, Jaccard faible) — cas legitime, signale seulement.
  min_shared   constant int     := 5;
  copy_jaccard constant numeric := 0.6;
  subset_ratio constant numeric := 0.8;

  t_created   timestamptz;
  t_size      int;
  m           record;
  jaccard     numeric;
  containment numeric;
begin
  if not exists (
    select 1 from associations where id = target and statut_abonnement = 'essai'
  ) then
    return;
  end if;

  select created_at into t_created from private.trial_registry where association_id = target;
  if t_created is null then
    return;
  end if;

  select count(*) into t_size
    from private.association_fingerprints
   where association_id = target and kind = 'member_phone';
  if t_size < min_shared then
    return;
  end if;

  for m in
    with mine as (
      select digest
        from private.association_fingerprints
       where association_id = target and kind = 'member_phone'
    ), shared as (
      select f.association_id as origin, count(*) as n
        from private.association_fingerprints f
        join mine on mine.digest = f.digest
       where f.kind = 'member_phone'
         and f.association_id <> target
       group by f.association_id
      having count(*) >= min_shared
    )
    select s.origin,
           s.n,
           (select count(*)
              from private.association_fingerprints o
             where o.association_id = s.origin and o.kind = 'member_phone') as origin_size
      from shared s
      join private.trial_registry r on r.association_id = s.origin
     where r.created_at < t_created
  loop
    jaccard     := m.n::numeric / (t_size + m.origin_size - m.n);
    containment := m.n::numeric / t_size;

    if jaccard >= copy_jaccard then
      if apply then
        perform private.inherit_trial(target, m.origin, 'copie_effectif', round(jaccard * 100, 2));
      else
        perform private.flag_trial(
          target, m.origin, 'copie_effectif', round(jaccard * 100, 2), 'a_verifier');
      end if;
    elsif containment >= subset_ratio then
      perform private.flag_trial(
        target, m.origin, 'sous_ensemble', round(containment * 100, 2), 'a_verifier');
    end if;
  end loop;
end $$;

-- BEFORE INSERT, et BEFORE UPDATE OF deleted_at pour le plafond.
--
-- (a) Identifiants de sauvegarde. Un membre dont l'identifiant a deja ete
--     enregistre par une AUTRE association ne peut venir que d'une sauvegarde
--     de celle-ci. L'essai est herite, et la ligne IGNOREE (`return null`)
--     plutot que refusee : lever une exception annulerait aussi l'heritage et
--     le signalement. Un trigger BEFORE ROW passe avant la RLS et avant la
--     detection de conflit de l'upsert — la collision de cle n'a donc plus lieu.
--     Une association qui PAIE n'est pas concernee : sa restauration suit le
--     chemin ordinaire.
--
-- (b) Plafond de membres pendant l'essai. Compte les membres non supprimes, hors
--     la ligne elle-meme (un upsert qui met a jour ne s'ajoute pas). Le
--     « desarchivage » d'une pierre tombale est compte aussi : sans quoi
--     supprimer puis restaurer par lots contournerait le plafond.
create or replace function private.members_guard() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  statut text;
  cap    int;
  origin uuid;
  n      int;
begin
  select a.statut_abonnement, a.plafond_membres_essai
    into statut, cap
    from associations a
   where a.id = new.association_id;

  if statut is distinct from 'essai' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select f.association_id into origin
      from private.association_fingerprints f
     where f.kind = 'member_id'
       and f.digest = private.digest_of(new.id)
       and f.association_id <> new.association_id
     order by f.created_at
     limit 1;

    if origin is not null then
      perform private.inherit_trial(new.association_id, origin, 'ids_sauvegarde', 100);
      return null;
    end if;
  end if;

  if cap is null or new.deleted_at is not null then
    return new;
  end if;

  -- Un UPDATE n'ajoute un membre que s'il sort d'une pierre tombale. `OLD` n'est
  -- lu que dans cette branche : un OR SQL ne garantit pas l'ordre d'evaluation.
  if tg_op = 'UPDATE' then
    if old.deleted_at is null then
      return new;
    end if;
  end if;

  select count(*) into n
    from members
   where association_id = new.association_id
     and deleted_at is null
     and id <> new.id;

  if n >= cap then
    raise exception 'Version d''essai : % membres au maximum', cap
      using errcode = 'AC001';
  end if;

  return new;
end $$;

-- Empreintes de chaque membre ecrit : son identifiant, son telephone. Registre
-- en ajout seul — un numero corrige laisse aussi l'ancien.
create or replace function private.members_fingerprint() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  phone text := private.norm_phone(new.dial_code, new.phone);
begin
  if tg_op = 'INSERT' then
    insert into private.association_fingerprints (association_id, kind, digest)
    values (new.association_id, 'member_id', private.digest_of(new.id))
    on conflict do nothing;
  end if;

  if phone is not null then
    insert into private.association_fingerprints (association_id, kind, digest)
    values (new.association_id, 'member_phone', private.digest_of(phone))
    on conflict do nothing;
  end if;

  return null;
end $$;

-- Une evaluation par instruction, pas par ligne : vingt membres saisis d'un
-- coup = une comparaison. Les triggers AFTER ROW ont deja depose les empreintes
-- quand celui-ci s'execute.
create or replace function private.members_evaluate() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  target uuid := current_association_id();
begin
  if target is not null then
    perform private.evaluate_trial_recycling(target, true);
  end if;
  return null;
end $$;

-- `members_guard` precede `members_touch` dans l'ordre alphabetique : une ligne
-- ignoree ne passe par aucun autre trigger BEFORE.
drop trigger if exists members_guard on members;
create trigger members_guard before insert or update of deleted_at on members
  for each row execute function private.members_guard();

drop trigger if exists members_fingerprint on members;
create trigger members_fingerprint after insert or update of phone, dial_code on members
  for each row execute function private.members_fingerprint();

drop trigger if exists members_evaluate on members;
create trigger members_evaluate after insert or update of phone, dial_code on members
  for each statement execute function private.members_evaluate();

-- Ces fonctions ne s'appellent que par trigger, ou entre elles en proprietaire.
revoke all on all functions in schema private from public, anon, authenticated;

-- =============================================================================
-- 7. Console : lister et trancher
-- =============================================================================

create or replace function admin_trial_flags()
returns table (
  id                   bigint,
  association_id       uuid,
  association_nom      text,
  origin_id            uuid,
  origin_nom           text,
  origin_date_creation date,
  signal               text,
  score                numeric,
  action               text,
  status               text,
  detected_at          timestamptz,
  resolved_at          timestamptz
)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
#variable_conflict use_column
begin
  if not is_platform_admin() then
    raise exception 'Reserve a l''administrateur de la plateforme'
      using errcode = '42501';
  end if;

  -- `origin_nom` NULL : l'originale a ete supprimee. Sa date d'inscription
  -- survit dans le registre.
  return query
    select f.id, f.association_id, a.nom, f.origin_id, o.nom,
           coalesce(o.date_creation, r.created_at::date),
           f.signal, f.score::numeric, f.action, f.status, f.detected_at, f.resolved_at
      from private.trial_flags f
      left join associations o on o.id = f.origin_id
      left join associations a on a.id = f.association_id
      left join private.trial_registry r on r.association_id = f.origin_id
     order by f.detected_at desc;
end $$;

-- `confirme` : c'est bien la meme association. L'heritage est applique s'il ne
--              l'etait pas (signalement « a verifier »).
-- `legitime` : fausse alerte. Si plus aucun motif ne tient, l'association
--              retrouve son propre essai — sans jamais raccourcir une
--              prolongation accordee entre-temps.
create or replace function admin_resolve_trial_flag(flag_id bigint, verdict text)
returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  f private.trial_flags%rowtype;
begin
  if not is_platform_admin() then
    raise exception 'Reserve a l''administrateur de la plateforme'
      using errcode = '42501';
  end if;

  if verdict not in ('confirme', 'legitime') then
    raise exception 'Verdict invalide : %', verdict using errcode = '22023';
  end if;

  update private.trial_flags t
     set status = verdict, resolved_at = now()
   where t.id = flag_id
  returning t.* into f;

  if not found then
    raise exception 'Signalement introuvable' using errcode = 'P0002';
  end if;

  if verdict = 'confirme' then
    perform private.apply_inherited_end(f.association_id, f.origin_id);
    return;
  end if;

  if exists (
    select 1 from private.trial_flags t
     where t.association_id = f.association_id
       and t.status <> 'legitime'
       and (t.action = 'essai_herite' or t.status = 'confirme')
  ) then
    return;
  end if;

  update private.trial_registry r
     set trial_ends = a.date_creation + 30, inherited_from = null
    from associations a
   where a.id = r.association_id
     and r.association_id = f.association_id
     and a.statut_abonnement = 'essai'
     and a.essai_herite;

  update associations
     set date_expiration_acces = greatest(date_expiration_acces, date_creation + 30),
         essai_herite          = false
   where id = f.association_id
     and statut_abonnement = 'essai'
     and essai_herite;
end $$;

revoke all on function admin_trial_flags()                      from public, anon;
revoke all on function admin_resolve_trial_flag(bigint, text)   from public, anon;
grant execute on function admin_trial_flags()                    to authenticated;
grant execute on function admin_resolve_trial_flag(bigint, text) to authenticated;

-- =============================================================================
-- 8. Reprise de l'existant
--
-- Les associations deja inscrites entrent au registre avec leur essai d'origine
-- (inscription + 30 jours) — et sans plafond de membres, voir §2. Les
-- rapprochements entre comptes existants sont SIGNALES, jamais appliques : pas
-- de coupure retroactive, l'admin examine la liste.
-- =============================================================================

insert into private.trial_registry (association_id, created_at, trial_ends)
select id, date_creation::timestamptz, date_creation + 30
  from associations
on conflict (association_id) do nothing;

insert into private.association_fingerprints (association_id, kind, digest, created_at)
select association_id, 'member_id', private.digest_of(id), updated_at
  from members
on conflict do nothing;

insert into private.association_fingerprints (association_id, kind, digest, created_at)
select association_id, 'member_phone', private.digest_of(private.norm_phone(dial_code, phone)), updated_at
  from members
 where private.norm_phone(dial_code, phone) is not null
on conflict do nothing;

do $mig$
declare
  a record;
begin
  -- Du plus ancien au plus recent : chaque fondateur n'est compare qu'a ceux
  -- deja enregistres.
  for a in
    select s.id, s.email, s.dial_code, s.telephone
      from associations s
      join private.trial_registry r on r.association_id = s.id
     order by r.created_at, s.id
  loop
    perform private.record_founder(a.id, 'founder_email', private.norm_email(a.email), true);
    perform private.record_founder(
      a.id, 'founder_phone', private.norm_phone(a.dial_code, a.telephone), true);
  end loop;

  for a in select s.id from associations s where s.statut_abonnement = 'essai' loop
    perform private.evaluate_trial_recycling(a.id, false);
  end loop;
end $mig$;

-- =============================================================================
-- 9. Verification finale — doit rendre `true`
-- =============================================================================

select bool_and(ok) as essai_unique_en_place
  from (values
    -- Les cinq triggers sont poses.
    ((select count(*) from pg_trigger
       where not tgisinternal
         and tgname in ('associations_trial_registry', 'associations_founder_update',
                        'members_guard', 'members_fingerprint', 'members_evaluate')) = 5),
    -- Chaque association a son entree au registre.
    ((select count(*) from associations a
       where not exists (select 1 from private.trial_registry r where r.association_id = a.id)) = 0),
    -- `essai_herite` n'est inscriptible par personne.
    (not has_column_privilege('authenticated', 'associations', 'essai_herite', 'UPDATE')),
    (not has_column_privilege('authenticated', 'associations', 'essai_herite', 'INSERT')),
    (not has_column_privilege('authenticated', 'associations', 'plafond_membres_essai', 'UPDATE')),
    (not has_column_privilege('authenticated', 'associations', 'plafond_membres_essai', 'INSERT')),
    -- Le schema interne est hors d'atteinte des locataires.
    (not has_schema_privilege('authenticated', 'private', 'USAGE')),
    (not has_function_privilege('authenticated', 'private.inherit_trial(uuid,uuid,text,numeric)', 'EXECUTE')),
    (not has_function_privilege('authenticated', 'private.apply_inherited_end(uuid,uuid)', 'EXECUTE')),
    -- Les RPC de console : authenticated oui, anon non.
    (has_function_privilege('authenticated', 'admin_trial_flags()', 'EXECUTE')),
    (not has_function_privilege('anon', 'admin_trial_flags()', 'EXECUTE')),
    (has_function_privilege('authenticated', 'admin_resolve_trial_flag(bigint,text)', 'EXECUTE')),
    (not has_function_privilege('anon', 'admin_resolve_trial_flag(bigint,text)', 'EXECUTE')),
    -- Le paywall n'a pas bouge.
    (not has_column_privilege('authenticated', 'associations', 'date_expiration_acces', 'UPDATE')),
    (not has_column_privilege('authenticated', 'associations', 'statut_abonnement', 'UPDATE'))
  ) as t(ok);
