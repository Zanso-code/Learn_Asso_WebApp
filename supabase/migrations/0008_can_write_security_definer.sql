-- =============================================================================
-- AssoCaisse — `can_write()` redevient `security definer`, comme le veut 0002
--
-- Ecart constate le 15 septembre 2026 en comparant la production au schema que
-- decrivent 0001 -> 0007 (fonctions, politiques, triggers : 68 objets). Un seul
-- differe : `can_write()`, `security invoker` en production alors que 0002 la
-- declare `security definer`. Corps et `search_path` identiques. Le corps en
-- CRLF trahit une redefinition collee dans le SQL Editor — vraisemblablement
-- pendant l'incident « permission denied for function can_write » que 0004 a
-- repare.
--
-- Pourquoi rien ne cassait : en mode invoker, la fonction lit `associations`
-- sous la RLS de l'appelant, et `associations_select` laisse justement voir la
-- ligne ou `treasurer_user_id = auth.uid()` — exactement celles que la fonction
-- cherche. Meme resultat, mais :
--   - un resultat qui depend d'une politique qu'on pourrait durcir demain ;
--   - une evaluation de RLS (dont `is_platform_admin()`) a chaque appel, alors
--     que la fonction est evaluee ligne a ligne par `may_write_ledger()` ;
--   - un comportement different de ses voisines `current_association_id()` et
--     `has_active_access()`, toutes deux `security definer`.
--
-- Verifie en production AVANT application, en transaction annulee, sur des
-- associations de test : resultats identiques dans les deux modes (tresorier
-- vrai, bureau faux, tresorier d'une autre association vrai pour la sienne) ;
-- apres bascule, ecritures du tresorier acceptees (membres, association,
-- condensat, justificatif), ecriture croisee et ecritures du bureau refusees.
-- `associations` n'a pas FORCE ROW LEVEL SECURITY : le proprietaire la lit sans
-- filtre, comme pour les deux fonctions voisines.
--
-- Rien d'expose : la fonction ne rend qu'un booleen sur l'appelant lui-meme.
-- Rejouable ; sans effet sur une base construite depuis 0001 -> 0007.
-- =============================================================================

alter function public.can_write() security definer;
alter function public.can_write() set search_path = public, pg_temp;

-- Privileges reaffirmes a l'identique de 0004 : `create or replace` ou `alter`
-- les conservent, mais ce fichier doit suffire a lui seul.
revoke all on function public.can_write() from public, anon;
grant execute on function public.can_write() to authenticated;

-- Verification — doit rendre `true`.
select p.prosecdef
   and p.proconfig = array['search_path=public, pg_temp']
   and has_function_privilege('authenticated', p.oid, 'EXECUTE')
   and not has_function_privilege('anon', p.oid, 'EXECUTE') as can_write_conforme
  from pg_proc p
 where p.oid = 'public.can_write()'::regprocedure;
