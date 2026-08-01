-- =============================================================================
-- TradingCorp — Validation d'une leçon vidéo conditionnée au signal de fin
--
-- Durcissement de terminer_lecon (introduite par 20260717120000_chapitres_types) :
-- un chapitre 'video' ne peut être validé que si sa vidéo a été signalée comme
-- terminée (video_terminee_le, posé en fin de lecture), en complément du garde
-- côté lecteur (bouton actif seulement en fin de vidéo + anti-avance).
--
-- CE QUE CE CONTRÔLE FAIT, ET CE QU'IL NE FAIT PAS
--
-- L'en-tête d'origine annonçait qu'il « empêche la validation directe d'une
-- leçon vidéo sans l'avoir visionnée ». C'était faux, et cette phrase
-- contredisait 20260716100000_pedagogie_quiz, qui qualifie exactement la même
-- colonne de « signal UX, non sécuritaire ».
--
-- La réalité : `video_terminee_le` fait partie des colonnes que le rôle
-- `authenticated` a le droit d'écrire (avec `position_video_s`). Un apprenant
-- peut donc la poser lui-même sans lire la vidéo, puis appeler cette fonction,
-- qui l'acceptera. Le contrôle serveur existe bien, mais il vérifie une
-- affirmation du client — ce n'est pas la même chose qu'une preuve.
--
-- C'est un choix assumé, pas un oubli : seul le navigateur sait où en est une
-- lecture, et aucune mesure côté client ne peut établir qu'un humain a
-- regardé une vidéo. Le visionnage est donc traité comme une intention
-- pédagogique, pas comme un contrôle d'intégrité.
--
-- Le verrou qui, lui, tient : `terminee_le`, jamais accordée au client, écrite
-- uniquement par cette fonction ou par l'Edge Function corriger-quiz. C'est
-- elle qui gouverne `lecon_debloquee()`, donc l'accès en LECTURE au contenu
-- des étapes suivantes. Un apprenant qui saute une vidéo s'ouvre la suite,
-- mais il ne contourne aucune protection de données.
--
-- Rien à changer ici tant que le certificat n'est pas opposable à un tiers.
-- Le jour où il le deviendra, il faudra que le serveur cesse de croire le
-- client sur parole : jalons de lecture réguliers, temps écoulé confronté à
-- `lecons.duree_s`, refus des sauts. Cela relèvera la barre sans jamais la
-- fermer.
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
