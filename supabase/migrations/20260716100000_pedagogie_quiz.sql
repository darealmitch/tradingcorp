-- =============================================================================
-- TradingCorp — Mécanique pédagogique : vidéo → PDF → quiz → validation
--
-- ANALYSE de l'existant : les 4 tables nécessaires existent déjà en intégralité
-- (lecons, ressources, quiz, questions, reponses, tentatives_quiz,
-- progression_lecons). Aucune recréation. Évolutions MINIMALES :
--
--   • quiz.id_lecon (nullable) : rattache un quiz à UNE étape vidéo. Les
--     quiz d'examen final (sans leçon) continuent de fonctionner via
--     id_formation, inchangé.
--   • progression_lecons.video_terminee_le : distingue « vidéo visionnée »
--     (déverrouille PDF + quiz) de « étape validée » (terminee_le, posé
--     uniquement après un quiz réussi — inchangé dans son usage par
--     etats_modules/roadmap).
--
-- SÉCURITÉ — faille corrigée au passage : progression_lecons n'avait AUCUNE
-- restriction de colonnes ; un client pouvait poser terminee_le en direct et
-- valider une étape sans passer le quiz. Désormais : terminee_le n'est écrit
-- QUE par le service_role (Edge Function corriger-quiz, cf. commentaire
-- d'origine sur tentatives_quiz). Le client ne peut plus écrire que
-- position_video_s (reprise) et video_terminee_le (signal UX, non
-- sécuritaire — même modèle de confiance que la reprise vidéo existante).
--
-- Le VERROU réellement infalsifiable est le déblocage séquentiel entre
-- étapes : porté par lecon_debloquee(), utilisé dans les RLS de lecture
-- (lecons, ressources, quiz, questions, reponses) — un client ne peut donc
-- jamais LIRE le contenu (vidéo/PDF/quiz) d'une étape non déverrouillée,
-- quoi qu'il envoie côté écriture.
-- =============================================================================

-- 1. Rattachement d'un quiz à une étape ---------------------------------------
alter table quiz add column if not exists id_lecon uuid references lecons (id_lecon) on delete cascade;
create unique index if not exists quiz_id_lecon_unique on quiz (id_lecon) where id_lecon is not null;

-- 2. Vidéo terminée (distinct de l'étape validée) -----------------------------
alter table progression_lecons add column if not exists video_terminee_le timestamptz;

-- 3. Verrou de colonnes : terminee_le réservé au service_role -----------------
revoke insert, update on progression_lecons from authenticated;
grant insert (id_profil, id_lecon, position_video_s, video_terminee_le) on progression_lecons to authenticated;
grant update (position_video_s, video_terminee_le) on progression_lecons to authenticated;

-- =============================================================================
-- 4. Fonctions de déverrouillage (SECURITY DEFINER, seule autorité)
-- =============================================================================

-- Une étape est déverrouillée si l'apprenant est inscrit ET si toutes les
-- étapes publiées qui la précèdent dans le même module sont validées
-- (terminee_le) — déblocage strictement séquentiel.
create or replace function public.lecon_debloquee(p_id_lecon uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_formateur_ou_admin()
    or (
      exists (
        select 1 from lecons l
        join sections s on s.id_section = l.id_section
        where l.id_lecon = p_id_lecon and a_inscription_active(s.id_formation)
      )
      and not exists (
        select 1
        from lecons l
        join lecons prev
          on prev.id_section = l.id_section
          and prev.est_publiee
          and prev.position < l.position
        left join progression_lecons pl
          on pl.id_lecon = prev.id_lecon
          and pl.id_profil = auth.uid()
          and pl.terminee_le is not null
        where l.id_lecon = p_id_lecon
          and pl.id_progression_lecon is null
      )
    );
$$;

-- La vidéo de l'étape a été visionnée (déverrouille PDF + quiz).
create or replace function public.video_lecon_terminee(p_id_lecon uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_formateur_ou_admin()
    or exists (
      select 1 from progression_lecons
      where id_lecon = p_id_lecon and id_profil = auth.uid() and video_terminee_le is not null
    );
$$;

-- =============================================================================
-- 5. RLS : lecture gouvernée par le déblocage séquentiel (contenu + quiz)
-- =============================================================================

drop policy if exists "lecons_select_gated" on lecons;
create policy "lecons_select_gated" on lecons for select
  using (
    is_formateur_ou_admin()
    or (
      est_publiee
      and (
        apercu_gratuit
        or exists (
          select 1 from sections s
          where s.id_section = lecons.id_section and a_inscription_active(s.id_formation)
        )
      )
      and lecon_debloquee(lecons.id_lecon)
    )
  );

drop policy if exists "ressources_select_gated" on ressources;
create policy "ressources_select_gated" on ressources for select
  using (
    is_formateur_ou_admin()
    or exists (
      select 1 from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = ressources.id_lecon
        and l.est_publiee
        and (l.apercu_gratuit or a_inscription_active(s.id_formation))
        and lecon_debloquee(l.id_lecon)
    )
  );

drop policy if exists "quiz_select_gated" on quiz;
create policy "quiz_select_gated" on quiz for select
  using (
    is_formateur_ou_admin()
    or (
      a_inscription_active(id_formation)
      and (id_lecon is null or (lecon_debloquee(id_lecon) and video_lecon_terminee(id_lecon)))
    )
  );

drop policy if exists "questions_select_gated" on questions;
create policy "questions_select_gated" on questions for select
  using (
    is_formateur_ou_admin()
    or exists (
      select 1 from quiz q
      where q.id_quiz = questions.id_quiz
        and a_inscription_active(q.id_formation)
        and (q.id_lecon is null or (lecon_debloquee(q.id_lecon) and video_lecon_terminee(q.id_lecon)))
    )
  );

-- Options de réponse sans la colonne `correcte` — même gating que les questions.
create or replace function public.reponses_publiques(p_id_question uuid)
returns table (id_reponse uuid, id_question uuid, contenu text)
language sql stable security definer set search_path = public
as $$
  select r.id_reponse, r.id_question, r.contenu
  from reponses r
  join questions q on q.id_question = r.id_question
  join quiz z on z.id_quiz = q.id_quiz
  where r.id_question = p_id_question
    and (
      is_formateur_ou_admin()
      or (
        a_inscription_active(z.id_formation)
        and (z.id_lecon is null or (lecon_debloquee(z.id_lecon) and video_lecon_terminee(z.id_lecon)))
      )
    );
$$;

-- =============================================================================
-- 6. RPC etats_lecons : liste des étapes d'un module avec leur état
--    (pour un stepper/timeline — mêmes principes que etats_modules)
-- =============================================================================

create or replace function public.etats_lecons(p_id_section uuid)
returns table (
  id_lecon uuid,
  titre text,
  "position" integer,
  duree_s integer,
  a_pdf boolean,
  video_termine boolean,
  etat text
)
language sql stable security definer set search_path = public
as $$
  select
    l.id_lecon,
    l.titre,
    l.position,
    l.duree_s,
    (l.pdf_public_id is not null),
    (pl.video_terminee_le is not null),
    case
      when not lecon_debloquee(l.id_lecon) then 'verrouille'
      when pl.terminee_le is not null then 'termine'
      when pl.video_terminee_le is not null then 'en_cours'
      else 'debloque'
    end
  from lecons l
  left join progression_lecons pl
    on pl.id_lecon = l.id_lecon and pl.id_profil = auth.uid()
  where l.id_section = p_id_section
    and (l.est_publiee or is_formateur_ou_admin())
  order by l.position;
$$;

grant execute on function public.etats_lecons(uuid) to authenticated;

-- =============================================================================
-- 7. RPC lecon_contenu : contenu jouable d'UNE étape, avec redaction serveur
--    - aucune ligne si l'étape n'est pas déverrouillée (accès jamais possible)
--    - pdf_public_id et id_quiz masqués tant que la vidéo n'est pas terminée
-- =============================================================================

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
