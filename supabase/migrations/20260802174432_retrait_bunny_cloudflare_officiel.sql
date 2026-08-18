-- =============================================================================
-- TradingCorp — Cloudflare devient le fournisseur vidéo officiel
--
-- Bunny.net est abandonné. Ses 64 chapitres vidéo (63 réels + 1 déjà en
-- attente) sont réinitialisés et DÉPUBLIÉS : leurs fichiers ne seront pas
-- transférés (décision produit), donc les laisser publiés afficherait un
-- lecteur vide à des apprenants qui ont payé pour ce contenu. L'écran de
-- remplacement existe déjà (« Aucune vidéo n'est encore associée à ce
-- chapitre ») — c'est le même que pour un chapitre jamais tourné.
--
-- video_url reste la source de vérité pour le lecteur, agnostique par
-- construction : ce changement de fournisseur ne touche donc aucune ligne de
-- code Angular, seulement les données et la contrainte qui les valide.
--
-- ANNULÉE par 20260813031357_retour_bunny : le passage à Cloudflare a été
-- abandonné et Bunny.net redevient le fournisseur du projet. Ce fichier est
-- conservé parce que la migration a réellement été appliquée en base — le
-- retirer laisserait un trou dans l'historique.
--
-- RECTIFICATION — « 64 chapitres vidéo (63 réels + 1 déjà en attente) »
-- ci-dessus est FAUX, et ce commentaire a coûté cher : il a fait croire, au
-- moment d'annuler cette migration, que 63 vidéos tournées venaient d'être
-- détruites, et failli déclencher une restauration de sauvegarde inutile.
-- La mesure en base disait l'inverse : 63 chapitres portaient le placeholder
-- de seed_chapitres.sql et UN SEUL avait une vraie vidéo Bunny (« 1.1 Le
-- processus »). L'affirmation avait été écrite sans être vérifiée.
-- Un commentaire de migration se lit comme un constat : n'y écrire que ce
-- qu'une requête a montré.
-- =============================================================================

alter table public.lecons drop constraint lecons_video_provider_check;

-- Vidé plutôt que réécrit avec un identifiant Cloudflare inventé : personne
-- n'a encore téléversé ces vidéos, un faux identifiant mentirait sur l'état
-- réel du contenu.
update public.lecons
   set video_provider = 'cloudflare',
       video_provider_id = null,
       video_url = null,
       video_metadata = '{}'::jsonb,
       est_publiee = false
 where video_provider = 'bunny' and type = 'video';

-- Chapitres non vidéo (article, intro, quiz) : le provider ne leur sert à
-- rien, mais la colonne existe et portait 'bunny' par défaut. Alignée pour
-- qu'aucune ligne de la base ne mentionne plus un fournisseur abandonné.
update public.lecons
   set video_provider = 'cloudflare'
 where video_provider = 'bunny' and type <> 'video';

alter table public.lecons add constraint lecons_video_provider_check
  check (video_provider in ('youtube', 'cloudinary', 'cloudflare'));

alter table public.lecons alter column video_provider set default 'cloudflare';

comment on column public.lecons.video_provider is
  'Fournisseur vidéo. Cloudflare Stream est le fournisseur officiel du projet — youtube et cloudinary restent acceptés pour des cas particuliers (voir VIDEOS-CLOUDFLARE.md).';

comment on column public.lecons.video_url is
  'URL de lecture externe (HLS Cloudflare Stream, ou MP4/YouTube selon video_provider). Le lecteur la consomme telle quelle, sans transformation — changer de fournisseur ne demande aucune modification du code Angular.';

comment on column public.lecons.video_provider_id is
  'Identifiant de la vidéo chez le fournisseur (UID Cloudflare Stream). Permet de reconstruire une autre URL (iframe, résolution) sans redemander l''identifiant.';
