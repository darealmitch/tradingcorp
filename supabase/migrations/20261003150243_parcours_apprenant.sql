-- =============================================================================
-- Parcours détaillé d'un élève, lu par l'équipe
--
-- La page Apprenants ne montre qu'un total par élève (`suivi_apprenants`) :
-- « 29 / 103 ». Pour dire où il en est — module en cours, prochaine leçon, ce
-- qui reste, quiz qui bloque —, il faut l'état de chaque leçon. Les fonctions
-- qui le calculent déjà (`etats_modules`, `etats_lecons`) le font pour la
-- personne CONNECTÉE : appelées par un administrateur, elles rendraient sa
-- propre progression. Celle-ci reçoit l'élève en paramètre et vérifie que
-- l'appelant fait partie de l'équipe, comme `suivi_apprenants`.
--
-- Aucune règle nouvelle, les définitions qui servent à l'élève :
--   • le programme = les leçons publiées des modules publiés (`ma_progression`) ;
--   • une leçon est terminée quand `terminee_le` est posé ;
--   • elle est entamée quand sa vidéo a été vue jusqu'au bout (`etats_lecons`).
-- Le regroupement par module, la prochaine leçon et le pourcentage se font à
-- l'affichage, à partir de ces lignes.
--
-- Bornée aux formations où l'élève a une inscription, active ou non : un accès
-- révoqué n'efface pas ce qui a été fait.
-- =============================================================================

create or replace function public.parcours_apprenant(p_id_profil uuid)
returns table (
  id_section        uuid,
  titre_module      text,
  position_module   integer,
  id_lecon          uuid,
  titre_lecon       text,
  position_lecon    integer,
  type_lecon        text,
  video_terminee_le timestamp with time zone,
  terminee_le       timestamp with time zone,
  nombre_tentatives integer,
  meilleur_score    integer,
  score_requis      integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_formateur_ou_admin() then
    raise exception 'Réservé au staff';
  end if;

  return query
  select
    s.id_section,
    s.titre,
    s.position,
    l.id_lecon,
    l.titre,
    l.position,
    l.type,
    pl.video_terminee_le,
    pl.terminee_le,
    coalesce(qz.tentatives, 0)::integer,
    qz.meilleur::integer,
    qz.requis::integer
  from sections s
  join lecons l on l.id_section = s.id_section and l.est_publiee
  left join progression_lecons pl
    on pl.id_lecon = l.id_lecon and pl.id_profil = p_id_profil
  -- Une ligne par leçon, quiz ou non : l'agrégat rend toujours une ligne,
  -- vide de sens hors quiz (aucune tentative, aucun score requis).
  left join lateral (
    select
      max(q.score_requis)   as requis,
      count(t.id_tentative) as tentatives,
      max(t.score)          as meilleur
    from quiz q
    left join tentatives_quiz t on t.id_quiz = q.id_quiz and t.id_profil = p_id_profil
    where q.id_lecon = l.id_lecon
  ) qz on true
  where s.est_publiee
    and s.id_formation in (
      select i.id_formation from inscriptions i where i.id_profil = p_id_profil
    )
  order by s.position, l.position;
end;
$function$;

comment on function public.parcours_apprenant(uuid) is
  'État de chaque leçon du programme pour un élève donné (terminée, vidéo vue, tentatives de quiz), selon les règles de ma_progression et etats_lecons. Réservée au staff.';

revoke execute on function public.parcours_apprenant(uuid) from public, anon;
grant  execute on function public.parcours_apprenant(uuid) to authenticated;
