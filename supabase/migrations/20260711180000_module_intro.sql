-- =============================================================================
-- TradingCorp — Contenu d'introduction des modules
--
-- La page d'intro d'un module (accroche, texte d'introduction, objectifs) est
-- du CONTENU : elle vit en base, jamais en dur dans le code Angular. La page
-- Angular est générique et rend ce que la base contient — les 8 modules
-- partagent donc la même page, alimentée par leurs propres données.
--
-- On étend `sections` (aucun doublon) et on recrée etats_modules pour exposer
-- ces champs : la RPC reste l'unique autorité (contenu + état serveur).
-- =============================================================================

alter table sections add column if not exists accroche text;
alter table sections add column if not exists introduction text;
alter table sections add column if not exists objectifs text[];

-- Le type de retour change : il faut supprimer avant de recréer.
drop function if exists public.etats_modules(uuid);

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
      when is_formateur_ou_admin() or seq.predecesseurs_incomplets = 0 then 'debloque'
      else 'verrouille'
    end as etat
  from seq
  order by seq.ordre;
$$;

grant execute on function public.etats_modules(uuid) to authenticated;
