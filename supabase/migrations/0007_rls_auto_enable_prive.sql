-- =============================================================================
-- AssoCaisse — `rls_auto_enable()` n'est plus appelable par l'API
--
-- Supabase installe cette fonction avec le trigger d'evenement `ensure_rls`,
-- qui active la RLS sur toute table creee dans `public`. Elle vit dans `public`,
-- en `security definer`, et heritait d'EXECUTE pour PUBLIC, `anon` et
-- `authenticated` : l'advisor la signalait appelable sans connexion via
-- `/rest/v1/rpc/rls_auto_enable`.
--
-- Hors trigger d'evenement, l'appel echoue (`pg_event_trigger_ddl_commands()`
-- n'y est pas disponible) : pas de faille exploitable, mais aucune raison de
-- l'exposer.
--
-- PUBLIC doit etre revoque AVEC `anon` et `authenticated` : les deux roles
-- heritent de PUBLIC, et ne retirer que leurs droits explicites ne changerait
-- rien. `postgres` et `service_role` gardent leur GRANT explicite.
--
-- Le trigger d'evenement, lui, n'en depend pas : Postgres ne verifie EXECUTE
-- qu'a la creation d'un trigger, pas a son declenchement. Verifie en production
-- le 15 septembre 2026, en transaction annulee : un role sans EXECUTE cree une
-- table sans erreur, et la RLS est toujours activee d'office.
--
-- Garde d'existence : la fonction est posee par Supabase, pas par ces
-- migrations — un projet recree depuis ce depot peut ne pas l'avoir. Rejouable.
-- =============================================================================

do $mig$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $mig$;

-- Verification — doit rendre `true` (ou NULL si la fonction n'existe pas).
select case
         when to_regprocedure('public.rls_auto_enable()') is null then null
         else not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE')
          and exists (select 1 from pg_event_trigger where evtname = 'ensure_rls' and evtenabled <> 'D')
       end as rls_auto_enable_prive;
