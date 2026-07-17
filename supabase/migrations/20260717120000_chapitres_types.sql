-- =============================================================================
-- TradingCorp — Chapitres TYPÉS (article / vidéo / quiz)
--
-- ÉVOLUTION du modèle pédagogique pour coller à la structure réelle de la
-- formation : un module est une liste ORDONNÉE de chapitres, chacun d'un type.
--
--   • Chapitre 1 d'un module = sa PAGE DE PRÉSENTATION, portée par la section
--     (accroche/introduction/objectifs) — inchangé, ce n'est pas une leçon.
--   • Chapitres suivants = leçons (`lecons`) désormais TYPÉES :
--       - 'video'   : une vidéo (hébergeur agnostique) + PDF optionnel.
--       - 'quiz'    : un quiz est un chapitre À PART ENTIÈRE (quiz.id_lecon).
--       - 'article' : un contenu texte (lecons.contenu), sans vidéo ni quiz.
--
-- VALIDATION par type (pose de terminee_le, qui gouverne le déblocage
-- séquentiel) :
--   • 'quiz'            → uniquement via l'Edge Function corriger-quiz (déjà en
--                          place) : impossible de valider sans réussir le quiz.
--   • 'video'/'article' → via la RPC terminer_lecon() ci-dessous (SECURITY
--                          DEFINER) : le client ne peut toujours PAS écrire
--                          terminee_le en direct (colonne révoquée), il passe
--                          par cette fonction qui vérifie le déblocage.
-- =============================================================================

-- 1. Type de chapitre ---------------------------------------------------------
alter table lecons add column if not exists type text not null default 'video'
  check (type in ('article', 'video', 'quiz'));

-- 2. Validation d'un chapitre non-quiz (vidéo / article) ----------------------
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

  insert into progression_lecons (id_profil, id_lecon, terminee_le)
  values (auth.uid(), p_id_lecon, now())
  on conflict (id_profil, id_lecon)
  do update set terminee_le = coalesce(progression_lecons.terminee_le, now());
end;
$$;

grant execute on function public.terminer_lecon(uuid) to authenticated;

-- =============================================================================
-- 3. RLS quiz : un chapitre quiz est lisible dès qu'il est déverrouillé
--    (plus de condition « vidéo terminée » : le quiz EST le chapitre).
-- =============================================================================
drop policy if exists "quiz_select_gated" on quiz;
create policy "quiz_select_gated" on quiz for select
  using (
    is_formateur_ou_admin()
    or (
      a_inscription_active(id_formation)
      and (id_lecon is null or lecon_debloquee(id_lecon))
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
        and (q.id_lecon is null or lecon_debloquee(q.id_lecon))
    )
  );

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
        and (z.id_lecon is null or lecon_debloquee(z.id_lecon))
      )
    );
$$;

-- =============================================================================
-- 4. etats_lecons : expose le type du chapitre (badges Article/Vidéo/Quiz)
--    Type de retour modifié → drop obligatoire.
-- =============================================================================
drop function if exists public.etats_lecons(uuid);

create or replace function public.etats_lecons(p_id_section uuid)
returns table (
  id_lecon uuid,
  titre text,
  type text,
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
    l.type,
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
-- 5. lecon_contenu : expose le type ; le quiz d'un chapitre quiz est révélé
--    dès le déverrouillage (le PDF d'une vidéo reste révélé après visionnage).
--    Type de retour modifié → drop obligatoire.
-- =============================================================================
drop function if exists public.lecon_contenu(uuid);

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
    l.type,
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
    q.id_quiz                       -- non nul seulement pour un chapitre quiz
  from lecons l
  left join progression_lecons pl
    on pl.id_lecon = l.id_lecon and pl.id_profil = auth.uid()
  left join quiz q
    on q.id_lecon = l.id_lecon
  where l.id_lecon = p_id_lecon;
end;
$$;

grant execute on function public.lecon_contenu(uuid) to authenticated;
