-- =============================================================================
-- L'adresse des vidéos ne sort plus avec le contenu d'une étape.
--
-- CE QUI N'ALLAIT PAS. `lecon_contenu` renvoyait `video_url` telle quelle :
-- l'URL HLS de Bunny, permanente, identique pour tout le monde et valable
-- indéfiniment. Le contrôle d'accès portait donc sur le PREMIER accès et sur
-- lui seul — une fois l'adresse relevée dans l'onglet Réseau, elle se
-- partageait, se rejouait, se téléchargeait. Mesuré avant ce changement :
-- `curl -H "Referer: https://tradingcorp.fr/" <url>` rendait la playlist, ses
-- rendus, ses segments, et jusqu'au MP4 dont l'adresse se devine à partir de
-- l'identifiant de la vidéo. Le réglage Bunny « Block direct url file access »
-- ne refuse que les requêtes SANS `Referer` : un en-tête suffisait.
--
-- CE QUI CHANGE. L'apprenant ne reçoit plus d'adresse ici. Il la demande à
-- l'Edge Function `video-signee`, qui vérifie l'accès sous la RLS de `lecons`
-- puis signe une URL datée, propre à cette vidéo. Le contrôle d'accès cesse
-- d'être un portillon franchi une fois : il se rejoue à chaque lecture.
--
-- Le staff garde l'adresse nue : le back-office affiche l'inventaire média
-- d'une étape (`contenus.ts`) et doit pouvoir constater ce qui est rattaché.
--
-- `video_provider_id` reste communiqué. Il ne donne accès à rien — sans
-- signature, une adresse reconstruite à partir de lui est refusée — mais il
-- dit au lecteur qu'une vidéo existe, donc qu'il doit en demander l'adresse
-- plutôt qu'afficher « aucune vidéo ».
--
-- ⚠️ ORDRE D'APPLICATION. Cette migration suppose le front à jour : un ancien
-- bundle attend `video_url` et n'appellerait pas `video-signee`. Publier le
-- site AVANT de l'appliquer, sans quoi les chapitres paraissent vides.
--
-- Signature de retour inchangée : `create or replace` suffit, aucun `drop`
-- (qui casserait les droits `execute` posés en 20260818121104).
-- =============================================================================

create or replace function public.lecon_contenu(p_id_lecon uuid)
returns table (
  id_lecon uuid,
  id_section uuid,
  titre text,
  type text,
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
  v_staff boolean;
begin
  if not lecon_debloquee(p_id_lecon) then
    return;
  end if;

  -- Évalué une fois : la fonction est appelée à chaque ouverture d'étape.
  v_staff := is_formateur_ou_admin();
  v_video_termine := v_staff or video_lecon_terminee(p_id_lecon);

  return query
  select
    l.id_lecon,
    l.id_section,
    l.titre,
    l.type,
    l.description,
    l.contenu,
    l.duree_s,
    l.video_provider,
    l.video_provider_id,
    case when v_staff then l.video_url else null end,
    l.video_metadata,
    case when v_video_termine then l.pdf_public_id else null end,
    l.position,
    coalesce(pl.position_video_s, 0),
    pl.video_terminee_le,
    pl.terminee_le,
    q.id_quiz                       -- non nul seulement pour un chapitre quiz
  from lecons l
  left join progression_lecons pl
    on pl.id_lecon = l.id_lecon and pl.id_profil = auth.uid()
  left join quiz q
    on q.id_lecon = l.id_lecon
  where l.id_lecon = p_id_lecon;
end;
$$;

comment on function public.lecon_contenu(uuid) is
  'Contenu d''une étape déverrouillée. L''adresse de la vidéo n''est rendue '
  'qu''au staff : les apprenants la demandent à l''Edge Function video-signee, '
  'qui délivre une URL signée et périssable.';
