-- =============================================================================
-- Suppression définitive : l'administrateur supprime le message qu'il veut
--
-- `supprimer_commentaire` (20261005084445) exigeait qu'un message soit d'abord
-- rejeté. Demande du titulaire (09/10/2026) : supprimer directement n'importe
-- quel message — publié, en attente ou rejeté, réponse d'un élève ou de
-- l'équipe, public ou privé.
--
-- Le reste ne change pas : réservé aux administrateurs, inscrit au journal
-- sans recopier le texte supprimé, réponses emportées avec le message. Le
-- journal garde désormais l'état du message au moment de sa suppression :
-- supprimer un message publié n'est pas le même geste que supprimer un
-- message déjà rejeté.
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
      'statut', v_message.statut,
      'prive', v_message.est_prive,
      'par_equipe', v_message.par_equipe,
      'reponse', v_message.id_parent is not null,
      'reponses_supprimees', v_reponses
    )
  );

  delete from commentaires where id_commentaire = p_id_commentaire;
end;
$$;
