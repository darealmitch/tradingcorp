-- =============================================================================
-- TradingCorp — La politique de conservation s'applique toute seule
--
-- Audit RGPD, §3.4. Une durée de conservation qui n'est appliquée par personne
-- n'est pas une politique : c'est une déclaration inexacte de plus, et une
-- déclaration inexacte est plus grave qu'un silence. `appliquer_retention()`
-- doit donc s'exécuter sans qu'on y pense.
--
-- pg_cron plutôt qu'un workflow GitHub, pour une raison de fond : la purge
-- opère sur des données personnelles. La faire déclencher depuis l'extérieur
-- supposerait d'exposer un point d'entrée ou de confier un secret de connexion
-- à un tiers — exactement ce que l'audit reproche déjà aux sauvegardes. Ici,
-- rien ne sort de la base.
--
-- EXÉCUTION DÉFENSIVE : tout est enveloppé dans un bloc qui absorbe l'échec.
-- La CI reconstruit une base éphémère à partir de ces migrations ; si pg_cron
-- n'y est pas disponible, la migration doit passer quand même — sans quoi un
-- détail d'infrastructure ferait échouer la vérification du schéma. La purge
-- reste alors appelable à la main.
-- =============================================================================

do $$
begin
  create extension if not exists pg_cron;

  -- Idempotence : une migration rejouée ne doit pas empiler les planifications.
  perform cron.unschedule('retention_rgpd')
  where exists (select 1 from cron.job where jobname = 'retention_rgpd');

  -- 03h15 chaque nuit — hors des heures de consultation, et décalé de l'heure
  -- ronde où se pressent les tâches planifiées de la plateforme.
  perform cron.schedule(
    'retention_rgpd',
    '15 3 * * *',
    $tache$ select public.appliquer_retention(); $tache$
  );

  raise notice 'Rétention RGPD planifiée quotidiennement à 03h15 (pg_cron).';
exception when others then
  raise notice 'pg_cron indisponible ici (%) — la rétention reste appelable manuellement : select public.appliquer_retention();', sqlerrm;
end $$;

-- Trace de ce qui doit tourner, lisible même là où pg_cron n'existe pas.
comment on function public.appliquer_retention() is
  'Applique la politique de conservation (table politique_conservation). Planifiée par pg_cron sous le nom « retention_rgpd », chaque nuit à 03h15. Là où pg_cron est absent (base de test), à appeler manuellement. Rend un compte rendu chiffré.';
