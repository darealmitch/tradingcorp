-- =============================================================================
-- L'adresse des vidéos sort aussi du périmètre lisible par le client.
--
-- CE QUE LA MIGRATION PRÉCÉDENTE NE COUVRAIT PAS. 20260912100000 a retiré
-- `video_url` de `lecon_contenu` — mais la RPC n'est pas le seul chemin. La
-- table `lecons` est directement interrogeable par l'API REST, et le privilège
-- de colonne `select (video_url)` était accordé à `authenticated` : un simple
--
--   GET /rest/v1/lecons?select=video_url&type=eq.video
--
-- avec le jeton d'un apprenant rendait les adresses de tous ses chapitres
-- déverrouillés. Vérifié en contexte réel avant ce correctif : le compte de
-- démonstration, qui voit l'ensemble du catalogue, obtenait les 64 adresses.
-- La RLS faisait son travail (elle filtre les LIGNES) ; rien ne filtrait la
-- COLONNE.
--
-- CE QUI CHANGE. Le privilège de lecture sur `video_url` est retiré au client.
-- L'adresse ne s'obtient plus que par deux voies, toutes deux contrôlées :
-- `lecon_contenu` pour le staff (SECURITY DEFINER, donc non soumise aux
-- privilèges de colonne de l'appelant), et l'Edge Function `video-signee`, qui
-- vérifie l'accès sous RLS puis signe.
--
-- CE QUI LE REMPLACE POUR LE BACK-OFFICE. L'écran d'inventaire des contenus
-- n'avait pas besoin de l'adresse : il s'en servait pour répondre à deux
-- questions — « ce chapitre porte-t-il une vidéo ? » et « est-elle hébergée
-- chez nous, ou est-ce un remplissage provisoire ? ». La colonne générée
-- `video_hebergee` répond aux deux sans rien divulguer.
--
-- Les hôtes énumérés sont ceux de `HEBERGEURS_PROJET` (contenus.ts) : les
-- deux listes disent la même chose et doivent évoluer ensemble.
-- =============================================================================

-- 1. L'indicateur qui remplace la lecture de l'adresse -----------------------
--
-- `stored` et non `virtual` : la colonne est lue dans des listes, et une
-- expression recalculée à chaque ligne n'apporterait rien ici (64 lignes, une
-- écriture par trimestre). `generated always` garantit surtout qu'elle ne peut
-- pas mentir — personne ne peut la poser à la main.
alter table public.lecons
  add column if not exists video_hebergee boolean
  generated always as (
    video_url is not null
    and (
      video_url like '%b-cdn.net%'
      or video_url like '%mediadelivery.net%'
      or video_url like '%res.cloudinary.com%'
    )
  ) stored;

comment on column public.lecons.video_hebergee is
  'Vrai si video_url pointe vers un hébergeur du projet. Existe pour que le '
  'back-office juge l''état d''un chapitre sans lire l''adresse elle-même, '
  'devenue illisible au client (voir 20260912103000).';

-- Deux booléens et non un seul : le back-office distingue « aucune adresse »
-- (la vidéo vient alors de Cloudinary via son public_id) de « une adresse, mais
-- chez un tiers » — un remplissage provisoire, qu'il signale comme tel. Fondre
-- les deux cas ferait passer un placeholder pour un contenu en ligne, ce que
-- `videoDefinitive()` a justement été écrite pour éviter.
alter table public.lecons
  add column if not exists a_video_url boolean
  generated always as (video_url is not null) stored;

comment on column public.lecons.a_video_url is
  'Vrai si une adresse de lecture est renseignée, sans dire laquelle.';

-- 2. L'adresse sort du périmètre client --------------------------------------
--
-- ⚠️ LE PIÈGE, éprouvé sur la base avant d'écrire ces lignes : un
--
--     revoke select (video_url) on public.lecons from authenticated;
--
-- est SANS EFFET ici. Le privilège ne vient pas d'un grant de colonne mais d'un
-- `grant select` sur la TABLE — celui que Supabase pose par défaut — et un
-- grant de table couvre toutes les colonnes, présentes et futures. Postgres
-- accepte la commande sans broncher et `column_privileges` continue d'annoncer
-- SELECT. Vérifié : la lecture de `video_url` passait encore.
--
-- Le seul motif qui fonctionne est donc : révoquer SELECT sur la table, puis le
-- rendre colonne par colonne. C'est aussi celui qu'emploie 20260801182449.
revoke select on public.lecons from authenticated, anon;

-- Toutes les colonnes SAUF `video_url`, plus les deux indicateurs. `anon` est
-- aligné sur `authenticated` : la RLS ne lui montre aucune ligne, mais une
-- divergence de privilèges entre les deux rôles finit toujours par surprendre.
--
-- ⚠️ CETTE LISTE EST DÉSORMAIS EXCLUSIVE. Une colonne ajoutée plus tard à
-- `lecons` ne sera PAS lisible par le client tant qu'elle n'est pas ajoutée
-- ici — l'erreur se présentera comme « permission denied for column … » sur
-- une requête qui marchait la veille. C'est le prix du durcissement, et c'est
-- volontaire : le défaut penche vers le silence plutôt que vers la fuite.
grant select (
  id_lecon,
  id_section,
  titre,
  contenu,
  duree_s,
  video_provider,
  video_provider_id,
  "position",
  date_creation,
  date_modification,
  description,
  est_publiee,
  pdf_public_id,
  video_metadata,
  type,
  a_video_url,
  video_hebergee
) on public.lecons to authenticated, anon;

-- 3. Écriture inchangée -------------------------------------------------------
--
-- `update (video_url)` reste accordé : le rattachement d'une vidéo se fait
-- depuis l'administration, et la policy `lecons_update_staff` le réserve déjà
-- au staff. Retirer ce privilège casserait le back-office sans rien protéger —
-- écrire une adresse n'est pas la lire.
