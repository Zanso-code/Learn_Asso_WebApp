-- =============================================================================
-- AssoCaisse — EXECUTE sur les predicats de RLS
--
-- Symptome observe : dans /admin, les boutons rapides « +1m / +3m / +12m »
-- fonctionnent, mais toute modification directe d'une fiche echoue en
--
--     permission denied for function can_write   (SQLSTATE 42501)
--
-- Cause. Une politique RLS n'est pas evaluee avec les droits du proprietaire de
-- la table : elle s'execute avec ceux de l'appelant. Appeler une fonction dans
-- un `using` exige donc que l'appelant ait EXECUTE dessus — et un refus n'est
-- pas « la politique rend faux », c'est une ERREUR qui remonte au client.
--
-- 0002 accorde explicitement EXECUTE sur ses trois RPC (set_treasurer_identity,
-- admin_set_subscription, admin_delete_association) mais PAS sur les quatre
-- predicats qu'elle introduit : elle s'en remet au privilege par defaut de
-- Postgres, `EXECUTE to PUBLIC`. Sur un projet ou ce defaut a ete retire, les
-- fonctions de 0001 restent appelables (`create or replace` en 0002 conserve
-- leurs privileges) tandis que celles nees en 0002 ne le sont pas. D'ou l'ecart
-- exact que l'on observe :
--
--   is_platform_admin()      0001  -> appelable  -> la console LIT les fiches
--   current_association_id() 0001  -> appelable
--   can_write()              0002  -> REFUSEE    -> tout UPDATE direct echoue
--   has_active_access()      0002  -> REFUSEE
--   may_write_ledger()       0002  -> REFUSEE    -> tout le grand livre est mort
--
-- La portee depasse la console : `may_write_ledger()` garde l'ecriture de
-- members, due_payments, categories, campaigns, contributions et expenses, et
-- `can_write()` / `has_active_access()` gardent le bucket `receipts`. Un
-- Tresorier ne pouvait rien enregistrer du tout.
--
-- Ne rien elargir d'autre : ces cinq fonctions ne renvoient que des faits sur la
-- session APPELANTE (son association, son role, son abonnement). Les rendre
-- appelables n'expose aucune donnee d'un autre locataire — c'est exactement ce
-- que les politiques faisaient deja, indirectement.
--
-- A appliquer apres 0003_notes_admin.sql. Rejouable sans dommage.
-- NE PAS rejouer 0002 seul : il lit `associations.tresorier_secret` et
-- `associations.notes`, deux colonnes que 0002 et 0003 suppriment.
-- =============================================================================

-- --- Diagnostic --------------------------------------------------------------
--
-- A executer SEUL (selectionner ce bloc, puis Ctrl+Entree) : l'editeur SQL de
-- Supabase n'affiche que le resultat de la derniere requete d'un lot. Tout doit
-- rendre `true` ; ce sont `exec_can_write`, `exec_has_active_access` et
-- `exec_may_write_ledger` qui sont attendus a `false` avant reparation.

select has_function_privilege('authenticated','can_write()','EXECUTE')             as exec_can_write,
       has_function_privilege('authenticated','has_active_access()','EXECUTE')      as exec_has_active_access,
       has_function_privilege('authenticated','may_write_ledger(uuid)','EXECUTE')   as exec_may_write_ledger,
       has_function_privilege('authenticated','current_association_id()','EXECUTE') as exec_current_assoc,
       has_function_privilege('authenticated','is_platform_admin()','EXECUTE')      as exec_is_admin,
       has_function_privilege(
         'authenticated','admin_set_subscription(uuid,text,date,text)','EXECUTE')   as exec_rpc_abonnement,
       has_column_privilege('authenticated','associations','responsable','UPDATE')  as upd_responsable,
       has_column_privilege('authenticated','associations','telephone','UPDATE')    as upd_telephone,
       has_table_privilege ('authenticated','association_notes','INSERT')           as ins_notes;

-- --- Le correctif ------------------------------------------------------------
--
-- `revoke ... from public, anon` d'abord : aligner les fonctions sur le meme
-- etat explicite, quel que soit celui dont elles partaient. Aucune politique
-- n'est ecrite `to anon`, et aucune de ces fonctions n'a de sens hors session —
-- `anon` n'en a donc aucun besoin.

revoke all on function current_association_id() from public, anon;
revoke all on function is_platform_admin()      from public, anon;
revoke all on function can_write()              from public, anon;
revoke all on function has_active_access()      from public, anon;
revoke all on function may_write_ledger(uuid)   from public, anon;

grant execute on function current_association_id() to authenticated;
grant execute on function is_platform_admin()      to authenticated;
grant execute on function can_write()              to authenticated;
grant execute on function has_active_access()      to authenticated;
grant execute on function may_write_ledger(uuid)   to authenticated;

-- Les trois RPC de 0002/0003 : deja accordees a leur creation, reaffirmees ici
-- pour que ce seul fichier suffise a remettre une base d'aplomb.

revoke all on function set_treasurer_identity(uuid)                   from public, anon;
revoke all on function admin_set_subscription(uuid, text, date, text) from public, anon;
revoke all on function admin_delete_association(uuid)                 from public, anon;

grant execute on function set_treasurer_identity(uuid)                   to authenticated;
grant execute on function admin_set_subscription(uuid, text, date, text) to authenticated;
grant execute on function admin_delete_association(uuid)                 to authenticated;

-- --- Privileges de colonnes, par precaution ----------------------------------
--
-- Recopie a l'identique de 0002 §8. `statut_abonnement`,
-- `date_expiration_acces`, `date_creation` et `treasurer_user_id` sont
-- volontairement ABSENTS : c'est la que vit le paywall. Les ajouter offrirait a
-- chaque association un abonnement illimite en libre-service.

grant select on associations to authenticated;

grant update (nom, sigle, ville, pays, responsable, dial_code, telephone, email,
              treasurer_name, president_name, currency, fiscal_start, logo)
  on associations to authenticated;

grant select, insert, update, delete on association_notes to authenticated;
revoke all on association_notes from anon;

-- --- Verification ------------------------------------------------------------
--
-- Seule requete affichee quand le fichier est joue d'un bloc. Doit rendre vrai.

select bool_and(ok) as tout_est_repare
  from (values
    (has_function_privilege('authenticated','can_write()','EXECUTE')),
    (has_function_privilege('authenticated','has_active_access()','EXECUTE')),
    (has_function_privilege('authenticated','may_write_ledger(uuid)','EXECUTE')),
    (has_function_privilege('authenticated','current_association_id()','EXECUTE')),
    (has_function_privilege('authenticated','is_platform_admin()','EXECUTE')),
    (has_function_privilege('authenticated','admin_set_subscription(uuid,text,date,text)','EXECUTE')),
    (has_column_privilege('authenticated','associations','responsable','UPDATE')),
    (has_table_privilege ('authenticated','association_notes','INSERT'))
  ) as t(ok);
