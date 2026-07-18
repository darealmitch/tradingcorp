-- =============================================================================
-- TradingCorp — Validation d'une leçon vidéo conditionnée au visionnage
--
-- Durcissement de terminer_lecon (introduite par 20260717120000_chapitres_types) :
-- un chapitre 'video' ne peut être validé que si sa vidéo a été signalée comme
-- terminée (video_terminee_le, posé en fin de lecture). Empêche la validation
-- directe d'une leçon vidéo sans l'avoir visionnée, en complément du garde
-- côté lecteur (bouton actif seulement en fin de vidéo + anti-avance).
--
-- Les chapitres 'article' se valident librement (aucune vidéo). Les chapitres
-- 'quiz' restent validés uniquement par corriger-quiz. Le staff est exempté.
-- Réutilise video_lecon_terminee() (déjà en place) — aucune table modifiée.
-- =============================================================================

create or replace function public.terminer_lecon(p_id_lecon uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_type text;
begin
  select type into v_type from lecons where id_lecon = p_id_lecon;
  if v_type is null then
    raise exception 'Chapitre introuvable';
  end if;
  if v_type = 'quiz' then
    raise exception 'Un chapitre quiz se valide via corriger-quiz';
  end if;
  if not lecon_debloquee(p_id_lecon) then
    raise exception 'Chapitre verrouillé';
  end if;
  if v_type = 'video'
     and not (is_formateur_ou_admin() or video_lecon_terminee(p_id_lecon)) then
    raise exception 'La vidéo doit être visionnée jusqu''à la fin avant de valider la leçon';
  end if;

  insert into progression_lecons (id_profil, id_lecon, terminee_le)
  values (auth.uid(), p_id_lecon, now())
  on conflict (id_profil, id_lecon)
  do update set terminee_le = coalesce(progression_lecons.terminee_le, now());
end;
$$;
