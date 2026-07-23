-- =============================================================================
-- TradingCorp — Les options de réponse ne trahissent plus la bonne réponse
--
-- FAILLE CORRIGÉE : reponses_publiques ne précisait aucun ORDER BY. Postgres
-- renvoyait donc les options dans leur ordre d'insertion — or un quiz saisi
-- avec la bonne réponse en premier (cas du gabarit) la rendait devinable en
-- lisant simplement l'ordre du DOM, sans rien connaître au sujet.
--
-- CORRECTIF : ordre dérivé de l'identifiant de chaque réponse (md5 de l'uuid).
--   • mélangé   : sans corrélation avec l'ordre de saisie ni avec `correcte` ;
--   • stable    : identique à chaque affichage et pour tous les apprenants —
--                 les options ne sautent pas d'une position à l'autre au
--                 rechargement, contrairement à un random() par requête.
--
-- Le gating (inscription active + chapitre déverrouillé, staff exempté) est
-- repris À L'IDENTIQUE : seule la clause ORDER BY est ajoutée. La colonne
-- `correcte` reste, elle, hors de portée du client.
-- =============================================================================

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
    )
  order by md5(r.id_reponse::text);
$$;
