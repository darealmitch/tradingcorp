-- =============================================================================
-- Nom des auteurs sous les messages publiés : « Prénom I. »
--
-- Un élève ne lit que son propre profil (`profils_select_self_ou_staff`) : la
-- jointure `profils(prenom, nom)` du fil lui revenait vide pour tout autre
-- auteur, et l'écran affichait « Compte supprimé » sous le message d'un
-- camarade bien vivant.
--
-- Plutôt que d'ouvrir les profils, cette fonction rend le seul nom à
-- afficher, au format déjà retenu pour la vérification publique d'un
-- certificat (P-18) : le prénom, et l'initiale du nom — « Jean D. ». Et
-- seulement pour les auteurs de messages que tout inscrit peut lire dans la
-- leçon : publiés, non privés, hors d'un fil privé. Un membre de l'équipe
-- signe « Équipe TradingCorp », comme ses réponses.
-- =============================================================================

create or replace function public.noms_publics_commentaires(p_id_lecon uuid)
returns table (id_profil uuid, nom_public text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct
    p.id_profil,
    case
      when p.role in ('formateur', 'admin') then 'Équipe TradingCorp'
      -- `left()` sur une chaîne vide rend une chaîne vide, jamais NULL : un
      -- nom absent n'affiche pas de point orphelin.
      else nullif(btrim(
        coalesce(p.prenom, '') || ' '
        || coalesce(nullif(left(btrim(p.nom), 1), '') || '.', '')
      ), '')
    end
  from commentaires c
  join profils p on p.id_profil = c.id_profil
  where c.id_lecon = p_id_lecon
    and c.statut = 'approuve'
    and not c.est_prive
    and (c.id_parent is null or not est_message_prive(c.id_parent));
$$;

comment on function public.noms_publics_commentaires(uuid) is
  'Nom affichable (« Prénom I. », ou « Équipe TradingCorp ») des auteurs de messages publiés dans une leçon. N''ouvre aucun profil.';

revoke execute on function public.noms_publics_commentaires(uuid) from public, anon;
grant  execute on function public.noms_publics_commentaires(uuid) to authenticated;
