-- =============================================================================
-- TradingCorp — Accès intégral pour les comptes de DÉMONSTRATION
--
-- BUT : permettre à un compte de démo de parcourir librement toute la formation
-- (tous les modules, toutes les étapes, tous les quiz) SANS toucher aux règles
-- de progression des utilisateurs réels.
--
-- ISOLATION : tout tient dans CE fichier. Le drapeau réutilisé est
-- `profils.est_test` (déjà en place, positionnable uniquement par un admin via
-- definir_compte_test()). Une seule fonction, acces_demo(), est OR-ée dans les
-- fonctions de gating déjà existantes. Aucun compte réel (est_test = false)
-- n'est affecté.
--
-- POUR RETIRER LE BYPASS AVANT PRODUCTION : ré-exécuter les définitions
-- d'origine de a_inscription_active / lecon_debloquee / video_lecon_terminee /
-- etats_modules SANS le « or acces_demo() » (bloc de rollback en fin de
-- fichier), puis `drop function acces_demo();`. Le reste du schéma est intact.
-- =============================================================================

-- Vrai si le compte courant est un compte de démonstration (est_test).
create or replace function public.acces_demo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profils where id_profil = auth.uid() and est_test
  );
$$;

grant execute on function public.acces_demo() to authenticated;

-- 1. Inscription : un compte démo est considéré inscrit à toute formation ------
create or replace function public.a_inscription_active(p_id_formation uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select acces_demo() or exists (
    select 1 from inscriptions
    where id_profil = auth.uid() and id_formation = p_id_formation and statut = 'active'
  );
$$;

-- 2. Déblocage séquentiel des étapes : levé pour la démo ----------------------
create or replace function public.lecon_debloquee(p_id_lecon uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_formateur_ou_admin()
    or acces_demo()
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

-- 3. Vidéo terminée : PDF + quiz visibles d'emblée pour la démo ----------------
create or replace function public.video_lecon_terminee(p_id_lecon uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_formateur_ou_admin()
    or acces_demo()
    or exists (
      select 1 from progression_lecons
      where id_lecon = p_id_lecon and id_profil = auth.uid() and video_terminee_le is not null
    );
$$;

-- 4. États des modules : aucun module n'est verrouillé pour la démo -----------
--    (le déblocage séquentiel entre modules est levé ; a_inscription_active
--    couvre déjà le verrou au niveau formation via acces_demo).
create or replace function public.etats_modules(p_id_formation uuid)
returns table (
  id_section uuid,
  titre text,
  description text,
  accroche text,
  introduction text,
  objectifs text[],
  "position" integer,
  total_lecons integer,
  lecons_terminees integer,
  etat text
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select
      s.id_section,
      s.titre,
      s.description,
      s.accroche,
      s.introduction,
      s.objectifs,
      s.position as ordre,
      count(distinct l.id_lecon) as total,
      count(distinct pl.id_progression_lecon)
        filter (where pl.terminee_le is not null) as faites
    from sections s
    left join lecons l
      on l.id_section = s.id_section and l.est_publiee
    left join progression_lecons pl
      on pl.id_lecon = l.id_lecon and pl.id_profil = auth.uid()
    where s.id_formation = p_id_formation
      and (s.est_publiee or is_formateur_ou_admin())
    group by s.id_section, s.titre, s.description, s.accroche, s.introduction,
             s.objectifs, s.position
  ),
  flags as (
    select base.*,
      (base.total > 0 and base.faites >= base.total) as est_termine,
      (base.faites > 0) as est_entame
    from base
  ),
  seq as (
    select flags.*,
      coalesce(
        sum(case when not flags.est_termine then 1 else 0 end)
          over (order by flags.ordre rows between unbounded preceding and 1 preceding),
        0
      ) as predecesseurs_incomplets
    from flags
  )
  select
    seq.id_section,
    seq.titre,
    seq.description,
    seq.accroche,
    seq.introduction,
    seq.objectifs,
    seq.ordre,
    seq.total::integer,
    seq.faites::integer,
    case
      when not (is_formateur_ou_admin() or a_inscription_active(p_id_formation)) then 'verrouille'
      when seq.est_termine then 'termine'
      when seq.est_entame then 'en_cours'
      when is_formateur_ou_admin() or acces_demo() or seq.predecesseurs_incomplets = 0 then 'debloque'
      else 'verrouille'
    end as etat
  from seq
  order by seq.ordre;
$$;

grant execute on function public.etats_modules(uuid) to authenticated;

-- =============================================================================
-- ROLLBACK (à activer avant mise en production) — décommenter puis exécuter :
--
--   -- rétablir a_inscription_active sans le bypass
--   create or replace function public.a_inscription_active(p_id_formation uuid)
--   returns boolean language sql stable security definer set search_path = public
--   as $$ select exists (select 1 from inscriptions
--     where id_profil = auth.uid() and id_formation = p_id_formation and statut = 'active'); $$;
--   -- puis recréer lecon_debloquee / video_lecon_terminee / etats_modules
--   -- depuis 20260716100000_pedagogie_quiz.sql et 20260711180000_module_intro.sql
--   -- (versions sans « or acces_demo() »), et enfin :
--   drop function if exists public.acces_demo();
-- =============================================================================
