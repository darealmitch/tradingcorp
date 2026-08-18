-- =============================================================================
-- TradingCorp — Dernier chapitre sans vidéo : « 5.11 Les liquidités - Partie 3 »
--
-- Seul chapitre resté dépublié après 20260815013819, faute de fichier chez
-- Bunny. La vidéo a été téléversée depuis (5.11.3.mp4), encodage terminé.
-- Lisibilité vérifiée avant écriture : manifeste servi, quatre qualités
-- (240p → 720p), segment vidéo réellement téléchargé.
--
-- duree_s passe de 3600 — le forfait du seed, jamais mis à jour — à la durée
-- réelle du fichier. Le parcours vidéo est complet à partir d'ici.
-- =============================================================================

update public.lecons
   set video_provider    = 'bunny',
       video_provider_id = '06b39366-0b6f-4eb2-95f9-8cdf221aaf17',
       video_url         = 'https://vz-8e333926-6ea.b-cdn.net/06b39366-0b6f-4eb2-95f9-8cdf221aaf17/playlist.m3u8',
       duree_s           = 1533,
       est_publiee       = true
 where titre = '5.11 Les liquidités - Partie 3' and type = 'video';
