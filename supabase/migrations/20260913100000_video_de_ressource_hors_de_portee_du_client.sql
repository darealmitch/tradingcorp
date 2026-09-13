-- =============================================================================
-- La vidéo complémentaire de la 5.13 rejoint le régime des chapitres.
--
-- CE QUI N'ALLAIT PAS. « Faire une option sur TradingView » est une vidéo de
-- formation, mais elle était servie autrement que les 64 chapitres : par une
-- URL d'EMBED Bunny, ouverte dans un nouvel onglet. Mesuré avant ce
-- changement, cet embed répondait 200 SANS AUCUNE AUTHENTIFICATION — n'importe
-- qui disposant du lien regardait la vidéo, sans compte ni inscription. Le
-- durcissement précédent (20260912100000 / 103000) ne la couvrait pas : il
-- portait sur `lecons`, elle vit dans `ressources`.
--
-- CE QUI CHANGE. Son adresse quitte `url` — colonne lisible par le client, et
-- qui doit le rester pour les liens externes (TradingView, YouTube) — pour une
-- colonne `video_url` que le client ne peut pas lire, sur le modèle de
-- `lecons`. La vidéo se lit désormais DANS la page, par le même chemin que les
-- chapitres : une adresse signée délivrée par `video-signee`.
--
-- Elle reste une RESSOURCE : pas de chapitre supplémentaire, donc aucun
-- déplacement de position et aucune incidence sur le déblocage séquentiel ni
-- sur la progression des apprenants déjà inscrits.
-- =============================================================================

-- 1. L'adresse, et l'indicateur qui la remplace côté client ------------------

alter table public.ressources
  add column if not exists video_url text;

comment on column public.ressources.video_url is
  'Adresse HLS d''une vidéo hébergée par le projet. Volontairement illisible '
  'par le client : elle ne s''obtient que signée, via video-signee.';

alter table public.ressources
  add column if not exists a_video_hebergee boolean
  generated always as (video_url is not null) stored;

comment on column public.ressources.a_video_hebergee is
  'Vrai si la ressource porte une vidéo servie par nous — donc lisible dans la '
  'page plutôt que par un lien. Ne divulgue pas l''adresse.';

-- 2. `video_url` devient une source recevable --------------------------------
--
-- `ressources_source_coherente` exige qu'une ressource ACTIVE porte une source :
-- un contenu, une URL, un public_id Cloudinary ou un chemin de stockage. Vider
-- `url` sans étendre cette contrainte la viole — relevé en éprouvant la
-- migration sur la base avant de l'écrire ici, et l'erreur serait survenue en
-- production, au milieu de la migration.
--
-- La contrainte est reprise à l'identique, `video_url` ajoutée à la branche par
-- défaut (celle des médias : pdf, audio, video, fichier).
alter table public.ressources drop constraint ressources_source_coherente;

alter table public.ressources add constraint ressources_source_coherente check (
  (not est_active) or
  case type
    when 'documentation' then contenu is not null
    when 'code' then contenu is not null
    when 'lien' then url is not null
    when 'partenaire' then url is not null
    else (
      cloudinary_public_id is not null
      or url is not null
      or chemin_storage is not null
      or video_url is not null
    )
  end
);

-- 3. Bascule de la ressource -------------------------------------------------
--
-- `url` passe à null : le gabarit n'a plus de lien à ouvrir, et l'adresse
-- d'embed cesse d'être distribuée. L'identifiant de la vidéo est le même,
-- seule la forme de l'URL change (embed -> HLS), comme pour les chapitres.
update public.ressources
set video_url = 'https://vz-8e333926-6ea.b-cdn.net/475152ff-da6c-47ac-8b91-5935798783eb/playlist.m3u8',
    url = null
where id_ressource = 'a38220c3-d394-4d2f-8567-da282958430d';

-- 4. L'adresse sort du périmètre client --------------------------------------
--
-- Même motif qu'en 20260912103000, et pour la même raison : un
-- `revoke select (video_url)` serait SANS EFFET derrière le `grant select` de
-- table que Supabase pose par défaut. Il faut révoquer sur la table, puis
-- rendre colonne par colonne.
--
-- ⚠️ Liste EXCLUSIVE : une colonne ajoutée plus tard à `ressources` devra y
-- être inscrite, sans quoi le front échouera sur « permission denied for
-- column … ».
revoke select on public.ressources from authenticated, anon;

grant select (
  id_ressource,
  id_lecon,
  nom,
  type_mime,
  chemin_storage,
  taille,
  date_creation,
  date_modification,
  cloudinary_public_id,
  type,
  url,
  description,
  contenu,
  langage,
  est_active,
  "position",
  a_video_hebergee
) on public.ressources to authenticated, anon;
