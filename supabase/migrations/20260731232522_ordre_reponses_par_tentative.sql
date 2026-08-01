-- Ordre des options d'un quiz : variable par apprenant et par tentative.
--
-- L'ordre était déjà mélangé (md5 de l'identifiant de la réponse), mais FIGÉ :
-- identique pour tous les apprenants et identique à chaque essai. Deux
-- conséquences, l'une et l'autre contraires à ce que le mélange cherchait :
--
--   • une réponse peut se transmettre par sa position (« c'est la 3e »), sans
--     rien connaître de la question ;
--   • un apprenant qui rejoue un quiz retrouve son écran à l'identique, ce qui
--     rend la mémorisation d'un enchaînement de clics aussi efficace que la
--     compréhension.
--
-- La graine mêle donc l'identifiant de l'apprenant et son nombre de tentatives
-- sur ce quiz. L'ordre reste stable pendant une passation — le compteur ne
-- bouge qu'à la soumission — et change à la suivante.

create or replace function public.reponses_publiques(p_id_question uuid)
returns table(id_reponse uuid, id_question uuid, contenu text)
language sql
stable
security definer
set search_path = public
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
    )
  order by md5(
    r.id_reponse::text
    || coalesce(auth.uid()::text, '')
    || (
      select count(*)
      from tentatives_quiz t
      where t.id_profil = auth.uid() and t.id_quiz = z.id_quiz
    )::text
  );
$$;
