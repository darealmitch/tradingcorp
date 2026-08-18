-- =============================================================================
-- TradingCorp — Dépublication des chapitres dont la vidéo n'existe pas
--
-- Le placeholder posé par seed_chapitres.sql
-- (commondatastorage.googleapis.com/.../BigBuckBunny.mp4) ne répond plus :
-- Google a fermé l'accès anonyme à ce bucket d'exemples et renvoie désormais
-- un 403 AccessDenied. Vérifié le 2026-08-15 par requête directe — la réponse
-- vient de GCS (server: UploadServer), ce n'est pas un incident réseau local.
--
-- 63 chapitres publiés servaient donc un lecteur mort à des apprenants qui ont
-- payé. Ils sont dépubliés le temps que les vraies vidéos Bunny leur soient
-- rattachées : mieux vaut un chapitre absent du parcours qu'un chapitre qui
-- s'ouvre sur une erreur.
--
-- video_url est CONSERVÉE : elle documente ce qu'il reste à remplacer, et rien
-- ne la sert plus tant que le chapitre est dépublié (la RLS lecons_select_gated
-- exige est_publiee).
--
-- Ne touche pas à « 1.1 Le processus », seul chapitre réellement hébergé sur
-- Bunny — son flux HLS a été vérifié lisible (manifeste, sous-playlist 720p et
-- segment vidéo téléchargés).
-- =============================================================================

update public.lecons
   set est_publiee = false
 where type = 'video'
   and est_publiee
   and video_url like '%commondatastorage.googleapis.com%';
