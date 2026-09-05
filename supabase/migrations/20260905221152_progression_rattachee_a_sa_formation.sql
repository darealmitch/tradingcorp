-- Le numérateur doit compter les leçons terminées DE CETTE formation, et non
-- toutes celles de l'apprenant : le schéma prévoit plusieurs formations, et le
-- jour où le catalogue s'élargira, chaque ligne aurait porté le total général.
--
-- La jointure passe par `lecons`, donc par les RLS — sans perte : une leçon
-- terminée est nécessairement débloquée, donc visible de qui l'a faite.

create or replace view public.progression_formation
with (security_invoker = true)
as
select i.id_profil,
       i.id_formation,
       coalesce(
         round(
           100.0 * count(pl.id_progression_lecon) filter (where pl.terminee_le is not null)::numeric
           / nullif(nombre_lecons_publiees(i.id_formation), 0)::numeric
         ),
         0::numeric
       )::integer as pourcentage_termine
from inscriptions i
left join sections s on s.id_formation = i.id_formation
left join lecons l on l.id_section = s.id_section
left join progression_lecons pl
       on pl.id_lecon = l.id_lecon
      and pl.id_profil = i.id_profil
group by i.id_profil, i.id_formation;

comment on view public.progression_formation is
  'Avancement d''un apprenant sur sa formation, en pourcentage des leçons publiées — et non des seules leçons qu''il a débloquées.';
