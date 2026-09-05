-- Le pourcentage d'avancement se calculait sur les leçons VISIBLES par
-- l'apprenant, non sur la formation entière.
--
-- `progression_formation` est en `security_invoker` — à raison : chacun ne doit
-- lire que sa propre ligne. Mais le dénominateur, lui, subissait aussi les
-- règles de visibilité : la policy `lecons_select_gated` ne montre que les
-- leçons débloquées, c'est-à-dire celles dont toutes les précédentes de la même
-- section sont achevées. Un apprenant qui avait fait 29 leçons sur 103 n'en
-- voyait que 34 — ses 29, la suivante, et la première de chaque section à
-- venir — et lisait donc « 85 % » au lieu de 28 %.
--
-- L'effet était d'autant plus trompeur que la personne avait peu avancé : le
-- compte de test affichait 53 % pour 8 leçons faites. Un ancien élève repris de
-- Wix aurait cru avoir presque terminé une formation suivie au quart.
--
-- Le dénominateur passe donc par une fonction `security definer` : il compte
-- toutes les leçons publiées de la formation, sans égard aux droits de qui
-- interroge. Le numérateur, lui, reste soumis aux RLS — c'est ce qui garantit
-- que personne ne lit la progression d'autrui.

create or replace function public.nombre_lecons_publiees(p_id_formation uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from lecons l
  join sections s on s.id_section = l.id_section
  where s.id_formation = p_id_formation and l.est_publiee;
$$;

revoke all on function public.nombre_lecons_publiees(uuid) from public;
grant execute on function public.nombre_lecons_publiees(uuid) to anon, authenticated, service_role;

comment on function public.nombre_lecons_publiees(uuid) is
  'Nombre de leçons publiées d''une formation, indépendamment des leçons débloquées pour qui interroge. Sert de dénominateur à progression_formation.';

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
left join progression_lecons pl on pl.id_profil = i.id_profil
group by i.id_profil, i.id_formation;

comment on view public.progression_formation is
  'Avancement d''un apprenant sur sa formation, en pourcentage des leçons publiées — et non des seules leçons qu''il a débloquées.';
