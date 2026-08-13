-- =============================================================================
-- TradingCorp — Retour à Bunny.net comme fournisseur vidéo
--
-- Annule 20260802174432_retrait_bunny_cloudflare_officiel et
-- 20260802174559_retrait_ressource_bunny_tradingview : le passage à Cloudflare
-- est abandonné.
--
-- Ces migrations avaient vidé video_url / video_provider_id / video_metadata et
-- dépublié les 64 chapitres vidéo. L'état d'avant est reconstruit :
--   - « 1.1 Le processus » : seule vidéo réellement tournée, son flux HLS est
--     rétabli (identifiant retrouvé, bibliothèque Bunny 708929).
--   - les 63 autres : placeholder de seed_chapitres.sql, qui était bien leur
--     valeur avant la bascule — le tournage n'a pas encore eu lieu.
--
-- Les données sont converties AVANT que la contrainte ne soit reposée : poser
-- d'abord la contrainte la ferait échouer sur les lignes encore 'cloudflare'.
-- =============================================================================

alter table public.lecons drop constraint lecons_video_provider_check;

update public.lecons
   set video_provider = 'bunny',
       video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
       est_publiee = true
 where video_provider = 'cloudflare' and type = 'video';

update public.lecons
   set video_url = 'https://vz-8e333926-6ea.b-cdn.net/366a949b-cd21-4ef6-a2e0-0384d327d901/playlist.m3u8',
       video_provider_id = '366a949b-cd21-4ef6-a2e0-0384d327d901'
 where titre = '1.1 Le processus' and type = 'video';

update public.lecons
   set video_provider = 'bunny'
 where video_provider = 'cloudflare';

alter table public.lecons add constraint lecons_video_provider_check
  check (video_provider in ('youtube', 'cloudinary', 'bunny'));

alter table public.lecons alter column video_provider set default 'bunny';

comment on column public.lecons.video_provider is
  'Fournisseur vidéo. Bunny Stream est le fournisseur du projet — youtube et cloudinary restent acceptés pour des cas particuliers.';

comment on column public.lecons.video_url is
  'URL de lecture externe (HLS Bunny, MP4 ou YouTube selon video_provider). Le lecteur la consomme telle quelle : hls.js prend la main sur les flux .m3u8.';

comment on column public.lecons.video_provider_id is
  'Identifiant de la vidéo chez le fournisseur (GUID Bunny Stream). Permet de reconstruire une autre URL (embed, résolution) sans redemander l''identifiant.';

update public.ressources
   set est_active = true,
       url = 'https://iframe.mediadelivery.net/embed/708929/475152ff-da6c-47ac-8b91-5935798783eb'
 where nom = 'Faire une option sur TradingView';
