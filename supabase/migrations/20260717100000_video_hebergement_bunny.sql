-- =============================================================================
-- TradingCorp — Hébergement vidéo agnostique (préparation Bunny.net / Stream)
--
-- OBJECTIF : ne plus dépendre de Cloudinary pour les vidéos. Le schéma décrit
-- déjà `video_provider` / `video_provider_id` ; on complète avec le strict
-- nécessaire pour accueillir un hébergeur tiers (Bunny Stream), notamment des
-- vidéos très longues (> 50 min) servies en streaming :
--
--   • lecons.video_url       : URL de lecture externe (HLS/MP4 direct fournie
--                              par l'hébergeur). Le lecteur la consomme telle
--                              quelle — aucune transformation côté app.
--   • lecons.video_metadata  : métadonnées libres du lecteur (durée réelle,
--                              résolutions, id de bibliothèque Bunny, poster…),
--                              en jsonb pour évoluer sans migration.
--
-- Le changement d'hébergeur se limite donc à : renseigner video_provider,
-- video_provider_id (id chez l'hébergeur) et/ou video_url. Le code Angular
-- privilégie video_url quand elle existe, ce qui rend Cloudinary optionnel.
--
-- Aucune donnée existante n'est perdue : les colonnes sont ajoutées, le défaut
-- de provider passe à 'bunny' pour les futures leçons, la contrainte conserve
-- youtube / bunny / cloudinary.
-- =============================================================================

alter table lecons add column if not exists video_url text;
alter table lecons add column if not exists video_metadata jsonb not null default '{}'::jsonb;

-- Nouveau défaut : Bunny. Cloudinary reste accepté (contenu déjà en place).
alter table lecons alter column video_provider set default 'bunny';

-- =============================================================================
-- RPC lecon_contenu : exposer video_url / video_metadata (redaction inchangée)
-- Le type de retour change → drop obligatoire avant recréation.
-- =============================================================================
drop function if exists public.lecon_contenu(uuid);

create or replace function public.lecon_contenu(p_id_lecon uuid)
returns table (
  id_lecon uuid,
  id_section uuid,
  titre text,
  description text,
  contenu text,
  duree_s integer,
  video_provider text,
  video_provider_id text,
  video_url text,
  video_metadata jsonb,
  pdf_public_id text,
  "position" integer,
  position_video_s integer,
  video_terminee_le timestamptz,
  terminee_le timestamptz,
  id_quiz uuid
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_video_termine boolean;
begin
  if not lecon_debloquee(p_id_lecon) then
    return;
  end if;

  v_video_termine := is_formateur_ou_admin() or video_lecon_terminee(p_id_lecon);

  return query
  select
    l.id_lecon,
    l.id_section,
    l.titre,
    l.description,
    l.contenu,
    l.duree_s,
    l.video_provider,
    l.video_provider_id,
    l.video_url,
    l.video_metadata,
    case when v_video_termine then l.pdf_public_id else null end,
    l.position,
    coalesce(pl.position_video_s, 0),
    pl.video_terminee_le,
    pl.terminee_le,
    case when v_video_termine then q.id_quiz else null end
  from lecons l
  left join progression_lecons pl
    on pl.id_lecon = l.id_lecon and pl.id_profil = auth.uid()
  left join quiz q
    on q.id_lecon = l.id_lecon
  where l.id_lecon = p_id_lecon;
end;
$$;

grant execute on function public.lecon_contenu(uuid) to authenticated;
