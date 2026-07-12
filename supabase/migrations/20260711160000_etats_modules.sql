-- =============================================================================
-- TradingCorp — États des modules du parcours (calcul CÔTÉ SERVEUR)
--
-- Le frontend ne doit JAMAIS pouvoir débloquer un module. Cette RPC est la
-- seule autorité : elle calcule, pour l'utilisateur courant, l'état de chaque
-- module d'une formation à partir de progression_lecons (déjà en place) et de
-- la règle de déblocage séquentiel. Le client ne fait qu'afficher le résultat.
--
--   verrouille : non inscrit, OU un module précédent n'est pas terminé
--   debloque   : accessible mais pas encore commencé (ou staff)
--   en_cours   : au moins une étape terminée, pas toutes
--   termine    : toutes les étapes publiées du module sont terminées
--
-- Un module sans étape publiée n'est jamais « terminé » (rien à valider) et
-- verrouille donc les suivants — cohérent tant que le contenu n'existe pas.
--
-- N.B. `position` est un mot réservé SQL : échappé dans la signature pour que
-- l'API continue d'exposer la clé `position` attendue par le client.
-- =============================================================================

create or replace function public.etats_modules(p_id_formation uuid)
returns table (
  id_section uuid,
  titre text,
  description text,
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
    group by s.id_section, s.titre, s.description, s.position
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
