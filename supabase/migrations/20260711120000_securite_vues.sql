-- =============================================================================
-- TradingCorp — Durcissement des vues (linter Supabase : security_definer_view)
--
-- Une vue Postgres s'exécute par défaut avec les droits de son créateur
-- (SECURITY DEFINER) et contourne donc la RLS de l'appelant — signalé en ERREUR
-- par le linter. On corrige selon l'intention réelle de chaque vue :
--
--   • progression_formation : chacun ne doit voir QUE sa progression
--       -> security_invoker (la RLS de l'appelant s'applique).
--   • certificats_verification : la vue, ouverte à `anon`, permettait
--       d'ÉNUMÉRER tous les certificats (noms + formations). Remplacée par une
--       fonction qui ne renvoie qu'un certificat, recherché par son numéro.
--   • reponses_publiques : options de quiz sans la colonne `correcte`.
--       Remplacée par une fonction (definer) filtrée par inscription active,
--       qui n'expose jamais `correcte`.
--
-- Aucune de ces vues n'est consommée par l'application aujourd'hui.
-- =============================================================================

-- 1. progression_formation : respecte la RLS de l'appelant --------------------
alter view public.progression_formation set (security_invoker = true);
grant select on public.progression_formation to authenticated;

-- 2. certificats_verification : vue publique -> fonction par numéro -----------
drop view if exists public.certificats_verification;

create or replace function public.verifier_certificat(p_numero text)
returns table (
  numero text,
  titre_formation text,
  prenom text,
  nom text,
  date_obtention timestamptz
)
language sql stable security definer set search_path = public
as $$
  select c.numero, f.titre, p.prenom, p.nom, c.date_obtention
  from certificats c
  join formations f on f.id_formation = c.id_formation
  join profils p on p.id_profil = c.id_profil
  where c.numero = p_numero;
$$;

grant execute on function public.verifier_certificat(text) to anon, authenticated;

-- 3. reponses_publiques : vue -> fonction (definer) filtrée par inscription ---
drop view if exists public.reponses_publiques;

create or replace function public.reponses_publiques(p_id_question uuid)
returns table (id_reponse uuid, id_question uuid, contenu text)
language sql stable security definer set search_path = public
as $$
  select r.id_reponse, r.id_question, r.contenu
  from reponses r
  join questions q on q.id_question = r.id_question
  join quiz z on z.id_quiz = q.id_quiz
  where r.id_question = p_id_question
    and (is_formateur_ou_admin() or a_inscription_active(z.id_formation));
$$;

grant execute on function public.reponses_publiques(uuid) to authenticated;
