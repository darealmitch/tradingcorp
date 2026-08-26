-- =============================================================================
-- TradingCorp — La progression se mesure sur le programme, pas sur ce qui est
-- déjà déverrouillé
--
-- Audit du 31/07/2026, P-24. Le front comptait les leçons avec un simple
-- `count(*)` sur `lecons`. Or la policy `lecons_select_gated` ne rend visibles
-- que les leçons DÉBLOQUÉES : le dénominateur grandissait au fur et à mesure de
-- l'avancement. Un apprenant ayant terminé 3 étapes sur 4 visibles lisait 75 %
-- alors que le programme en compte 103. Le pourcentage ne mesurait pas
-- l'avancement dans la formation, mais l'avancement dans ce qui était déjà
-- ouvert — il restait haut et ne bougeait presque pas.
--
-- Le comptage descend donc en base, dans une fonction SECURITY DEFINER qui voit
-- le programme entier. Elle reste bornée à ce que l'appelant a le droit de
-- savoir : seules comptent les formations où il a une inscription active
-- (`a_inscription_active`, qui accorde aussi l'accès aux comptes de test).
--
-- `total` ne dépend plus de la progression : deux apprenants inscrits à la même
-- formation voient le même dénominateur, quel que soit leur avancement.
-- =============================================================================

create or replace function public.ma_progression()
returns table (terminees bigint, total bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    (
      select count(*)
      from progression_lecons p
      join lecons l   on l.id_lecon   = p.id_lecon
      join sections s on s.id_section = l.id_section
      where p.id_profil = auth.uid()
        and p.terminee_le is not null
        and l.est_publiee
        and s.est_publiee
        and a_inscription_active(s.id_formation)
    ),
    (
      select count(*)
      from lecons l
      join sections s on s.id_section = l.id_section
      where l.est_publiee
        and s.est_publiee
        and a_inscription_active(s.id_formation)
    );
$function$;

comment on function public.ma_progression() is
  'Avancement de l''apprenant connecté : étapes terminées et total du programme auquel il est inscrit. Le total porte sur les leçons publiées, pas sur les leçons débloquées — sans quoi le dénominateur suivrait la progression (P-24).';

revoke execute on function public.ma_progression() from public, anon;
grant  execute on function public.ma_progression() to authenticated;
