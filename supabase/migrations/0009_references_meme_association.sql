-- =============================================================================
-- AssoCaisse — une reference du grand livre ne sort plus de son association
--
-- Constat du 15 septembre 2026. Les cles etrangeres internes au grand livre
-- portaient sur le seul identifiant :
--
--   members.category_id        -> categories(id)  on delete set null
--   due_payments.member_id     -> members(id)     on delete cascade
--   contributions.campaign_id  -> campaigns(id)   on delete cascade
--   contributions.member_id    -> members(id)     on delete set null
--
-- Or le controle d'une cle etrangere IGNORE la RLS. Une association pouvait
-- donc enregistrer un versement sur le membre d'une autre, une contribution a
-- la campagne d'une autre, un membre dans la categorie d'une autre — il suffit
-- de connaitre l'identifiant, et une sauvegarde les contient tous. Trois
-- consequences :
--
--   1. Destruction croisee. `admin_delete_association(A)` supprime les membres
--      de A ; la cascade supprimait avec eux les versements de B qui les
--      visaient, et vidait le `member_id` des contributions de B.
--   2. Oracle d'existence. L'insertion reussit ou echoue selon que
--      l'identifiant existe chez un autre locataire.
--   3. Trou dans 0006. Un compte d'essai dont les membres restaures sont
--      ignores, mais dont l'essai herite n'est pas encore echu, pouvait encore
--      saisir des versements sur les membres de l'originale.
--
-- Correctif : chaque cle etrangere porte AUSSI `association_id`. La reference
-- doit alors designer une ligne de la meme association — c'est la base qui le
-- garantit, quelle que soit la requete.
--
-- `on delete set null (colonne)` (Postgres 15+) : la suppression du parent ne
-- vide que la colonne de reference, jamais `association_id`, qui est NOT NULL.
-- Une reference NULL (donateur externe, membre sans categorie) n'est pas
-- controlee (MATCH SIMPLE), comme avant.
--
-- Hors perimetre : l'oracle d'existence par la CLE PRIMAIRE, globale, subsiste
-- — inserer un identifiant deja pris ailleurs echoue sur la contrainte
-- d'unicite. Les identifiants sont des UUID tires cote client : a moins de les
-- detenir deja, on ne les devine pas. Rendre les cles primaires composites
-- toucherait l'upsert du moteur de synchronisation (`onConflict: 'id'`).
--
-- Sans effet cote client : l'application ne relie jamais que des lignes de sa
-- propre association. A appliquer apres 0008. Rejouable.
-- =============================================================================

-- =============================================================================
-- 1. Cibles : (id, association_id) unique sur les tables referencees
--
-- `id` etant deja cle primaire, ces index ne refusent rien de plus ; ils
-- existent parce qu'une cle etrangere composite exige une contrainte d'unicite
-- sur exactement ses colonnes.
-- =============================================================================

do $mig$
declare
  c record;
begin
  for c in
    select * from (values
      ('categories', 'categories_id_association_key'),
      ('members',    'members_id_association_key'),
      ('campaigns',  'campaigns_id_association_key')
    ) as t(tbl, name)
  loop
    if not exists (
      select 1 from pg_constraint where conname = c.name and conrelid = c.tbl::regclass
    ) then
      execute format('alter table %I add constraint %I unique (id, association_id)', c.tbl, c.name);
    end if;
  end loop;
end $mig$;

-- =============================================================================
-- 2. Cles etrangeres composites
--
-- Posees NOT VALID : elles s'appliquent a toute ecriture des la migration, sans
-- que la pose echoue sur une reference croisee deja presente. La section 3
-- valide ensuite l'existant.
-- =============================================================================

do $mig$
declare
  c record;
begin
  for c in
    select * from (values
      ('members',       'members_category_id_fkey',       'members_category_same_assoc_fkey',
       'foreign key (category_id, association_id) references categories (id, association_id) on delete set null (category_id)'),
      ('due_payments',  'due_payments_member_id_fkey',    'due_payments_member_same_assoc_fkey',
       'foreign key (member_id, association_id) references members (id, association_id) on delete cascade'),
      ('contributions', 'contributions_campaign_id_fkey', 'contributions_campaign_same_assoc_fkey',
       'foreign key (campaign_id, association_id) references campaigns (id, association_id) on delete cascade'),
      ('contributions', 'contributions_member_id_fkey',   'contributions_member_same_assoc_fkey',
       'foreign key (member_id, association_id) references members (id, association_id) on delete set null (member_id)')
    ) as t(tbl, old_name, new_name, def)
  loop
    if not exists (
      select 1 from pg_constraint where conname = c.new_name and conrelid = c.tbl::regclass
    ) then
      execute format('alter table %I drop constraint if exists %I', c.tbl, c.old_name);
      execute format('alter table %I add constraint %I %s not valid', c.tbl, c.new_name, c.def);
    end if;
  end loop;
end $mig$;

-- =============================================================================
-- 3. Validation de l'existant
--
-- Meme principe que 0005 §6 : une reference croisee deja en base fait echouer
-- la validation — c'est precisement l'information recherchee. Le bloc la
-- signale et poursuit : corriger une donnee comptable ne se fait pas d'office.
-- La contrainte reste alors NOT VALID, mais continue de refuser toute nouvelle
-- reference croisee. Pour lister les lignes en cause :
--
--   select d.id, d.association_id, m.association_id as membre_chez
--     from due_payments d join members m on m.id = d.member_id
--    where m.association_id <> d.association_id;   (idem pour les trois autres)
-- =============================================================================

do $mig$
declare
  c record;
  restant int := 0;
begin
  for c in
    select conrelid::regclass as tbl, conname
      from pg_constraint
     where conname in ('members_category_same_assoc_fkey', 'due_payments_member_same_assoc_fkey',
                       'contributions_campaign_same_assoc_fkey', 'contributions_member_same_assoc_fkey')
       and not convalidated
  loop
    begin
      execute format('alter table %s validate constraint %I', c.tbl, c.conname);
    exception
      when foreign_key_violation then
        restant := restant + 1;
        raise notice 'References croisees a corriger avant validation : %.%', c.tbl, c.conname;
    end;
  end loop;

  if restant > 0 then
    raise notice '% cle(s) etrangere(s) non validee(s) : des references croisees existent deja.', restant;
  end if;
end $mig$;

-- =============================================================================
-- 4. Verification finale — doit rendre `true`
-- =============================================================================

select bool_and(ok) as references_meme_association
  from (values
    -- Les quatre cles composites sont posees et validees.
    ((select count(*) from pg_constraint
       where contype = 'f' and convalidated
         and conname in ('members_category_same_assoc_fkey', 'due_payments_member_same_assoc_fkey',
                         'contributions_campaign_same_assoc_fkey', 'contributions_member_same_assoc_fkey')) = 4),
    -- Les anciennes cles sur le seul identifiant ont disparu.
    ((select count(*) from pg_constraint
       where conname in ('members_category_id_fkey', 'due_payments_member_id_fkey',
                         'contributions_campaign_id_fkey', 'contributions_member_id_fkey')) = 0),
    -- Plus aucune cle etrangere du grand livre ne vise un parent sans passer par
    -- association_id.
    ((select count(*) from pg_constraint k
       where k.contype = 'f'
         and k.conrelid::regclass::text in ('categories', 'members', 'due_payments', 'campaigns',
                                            'contributions', 'expenses')
         and k.confrelid::regclass::text <> 'associations'
         and not exists (
           select 1 from pg_attribute a
            where a.attrelid = k.conrelid and a.attnum = any (k.conkey)
              and a.attname = 'association_id')) = 0)
  ) as t(ok);
