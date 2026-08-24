-- =============================================================================
-- TradingCorp — Livre audio du chapitre 2.2 : la source est une vidéo YouTube
--
-- La ressource existait déjà, désactivée, et pointait vers un fichier
-- Cloudinary (`.../bases-de-la-monnaie-livre-audio`) qui n'a jamais été
-- téléversé. Le livre audio est en fait hébergé sur YouTube.
--
-- On RÉUTILISE la ligne plutôt que d'en créer une seconde : deux ressources
-- portant le même nom sur le même chapitre laisseraient l'apprenant choisir
-- entre un lien mort et un lien valide.
--
-- cloudinary_public_id est vidé : le lecteur donne la priorité à `url`, donc
-- l'identifiant subsistant ne servirait plus qu'à faire croire qu'un fichier
-- existe quelque part. est_active passe à true — la contrainte
-- ressources_source_coherente exige justement qu'une ressource active ait une
-- source, ce qui est désormais le cas.
-- =============================================================================

update public.ressources r
   set url = 'https://www.youtube.com/watch?v=ONrCHaGLKIg',
       cloudinary_public_id = null,
       type_mime = null,
       est_active = true
  from public.lecons l
 where l.id_lecon = r.id_lecon
   and l.titre = '2.2 Les bases de la monnaie'
   and r.nom = 'Les bases de la monnaie — livre audio';
