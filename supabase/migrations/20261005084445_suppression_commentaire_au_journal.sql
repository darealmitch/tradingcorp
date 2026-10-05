-- =============================================================================
-- Suppression d'un commentaire au journal : la forme des autres entrées
--
-- La première version (20261005083456) inscrivait l'identifiant du message en
-- `cible` : illisible dans l'écran Journal, et hors de portée de
-- `anonymiser_journal_personne`, qui retrouve les entrées d'une personne par
-- `id_profil_cible` et son adresse par `cible`. L'entrée suit désormais la
-- forme d'un changement de rôle : la personne visée en `id_profil_cible`, son
-- adresse en `cible`. Le texte supprimé n'y est toujours pas recopié.
-- =============================================================================

create or replace function public.supprimer_commentaire(p_id_commentaire uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_message  commentaires%rowtype;
  v_reponses integer;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  select * into v_message from commentaires where id_commentaire = p_id_commentaire;
  if not found then
    raise exception 'Ce message n''existe plus';
  end if;
  if v_message.statut <> 'rejete' then
    raise exception 'Rejette d''abord ce message : seul un message rejeté se supprime définitivement';
  end if;

  select count(*) into v_reponses from commentaires where id_parent = p_id_commentaire;

  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta)
  values (
    auth.uid(),
    v_message.id_profil,
    'suppression_commentaire',
    (select u.email from auth.users u where u.id = v_message.id_profil),
    jsonb_build_object(
      'id_commentaire', p_id_commentaire,
      'lecon', (select l.titre from lecons l where l.id_lecon = v_message.id_lecon),
      'ecrit_le', v_message.date_creation,
      'reponses_supprimees', v_reponses
    )
  );

  delete from commentaires where id_commentaire = p_id_commentaire;
end;
$$;
