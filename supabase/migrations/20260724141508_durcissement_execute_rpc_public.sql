-- =============================================================================
-- TradingCorp — Durcissement des droits d'exécution (suite)
--
-- Complément de 20260724141418_durcissement_execute_rpc : Postgres accorde par
-- défaut EXECUTE à PUBLIC sur toute fonction créée. Le rôle PUBLIC englobe anon
-- ET authenticated : révoquer d'abord, puis accorder explicitement au seul rôle
-- légitime, est la seule façon de fermer réellement l'accès anonyme.
--
-- Les fonctions ci-dessous vérifient déjà is_admin() en interne : cette couche
-- est une défense en profondeur, pas la protection principale.
--
-- ⚠️ FICHIER RECONSTITUÉ le 31/07/2026 depuis
--    supabase_migrations.schema_migrations.statements (colonne qui conserve le
--    SQL réellement exécuté). La migration avait été appliquée en production
--    sans que son fichier source soit versionné — écart relevé par l'audit de
--    pré-production (P-01). Le SQL est reproduit à l'identique, à une exception
--    documentée plus bas.
-- =============================================================================

revoke execute on function public.changer_role(uuid, text) from public;
grant execute on function public.changer_role(uuid, text) to authenticated;

revoke execute on function public.definir_compte_test(uuid, boolean) from public;
grant execute on function public.definir_compte_test(uuid, boolean) to authenticated;

revoke execute on function public.corriger_identite(uuid, text, text) from public;
grant execute on function public.corriger_identite(uuid, text, text) to authenticated;

revoke execute on function public.lister_profils_admin() from public;
grant execute on function public.lister_profils_admin() to authenticated;

-- Seule adaptation par rapport au SQL d'origine : la révocation sur
-- changer_surnom(text) était écrite en dur. Cette fonction a été supprimée par
-- 20260717130000_retrait_surnom, antérieure à la présente migration : rejouée
-- telle quelle sur une base neuve, la ligne échouerait et bloquerait la
-- reconstruction du schéma. Le garde ci-dessous préserve l'intention d'origine
-- tout en rendant le fichier rejouable.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'changer_surnom'
  ) then
    execute 'revoke execute on function public.changer_surnom(text) from public';
  end if;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.set_date_modification() from public;
