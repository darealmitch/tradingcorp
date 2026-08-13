-- =============================================================================
-- TradingCorp — Dernière trace de Bunny en base : une ressource complémentaire
--
-- La démonstration TradingView du module 5.13 pointait vers un embed Bunny.
-- Même traitement que les chapitres vidéo (migration
-- retrait_bunny_cloudflare_officiel) : désactivée et son URL vidée plutôt que
-- remplacée par un identifiant Cloudflare inventé, en attendant un réupload.
--
-- ANNULÉE par 20260813031357_retour_bunny, qui réactive la ressource et lui
-- rend son URL d'embed. Conservée pour que l'historique du dépôt reflète ce
-- qui a réellement été appliqué en base.
-- =============================================================================

update public.ressources
   set est_active = false, url = null
 where url ilike '%mediadelivery.net%' or url ilike '%b-cdn.net%';
