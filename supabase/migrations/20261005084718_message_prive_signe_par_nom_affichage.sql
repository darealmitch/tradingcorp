-- =============================================================================
-- Message privé d'un élève : signé comme les autres notifications des admins
--
-- `repondre_en_prive` (20261005083456) recomposait le nom de l'élève à la main,
-- avec « Un élève » pour repli. Les autres notifications adressées aux
-- administrateurs — nouveau compte, achat, module terminé — passent par
-- `nom_affichage`, qui retombe sur l'adresse e-mail quand le nom manque : le
-- cas des élèves repris de Wix, souvent arrivés sans identité. On reprend la
-- même fonction ; le reste est inchangé.
-- =============================================================================

create or replace function public.repondre_en_prive(
  p_id_commentaire uuid,
  p_contenu        text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_message   commentaires%rowtype;
  v_contenu   text := btrim(coalesce(p_contenu, ''));
  v_id        uuid;
  v_formation uuid;
  v_lecon     text;
begin
  if v_contenu = '' then
    raise exception 'Le message est vide';
  end if;
  if length(v_contenu) > 5000 then
    raise exception 'Le message dépasse 5000 caractères';
  end if;

  select * into v_message from commentaires where id_commentaire = p_id_commentaire;
  if not found then
    raise exception 'Ce message n''existe plus';
  end if;
  if v_message.id_parent is not null then
    raise exception 'On répond au message d''origine, pas à une réponse';
  end if;
  if v_message.id_profil is distinct from auth.uid() then
    raise exception 'Seul l''auteur du message peut écrire dans cet échange privé';
  end if;
  if not (v_message.est_prive or exists (
    select 1 from commentaires r
    where r.id_parent = v_message.id_commentaire and r.par_equipe and r.est_prive
  )) then
    raise exception 'Aucun échange privé n''est ouvert sur ce message';
  end if;

  select s.id_formation, l.titre into v_formation, v_lecon
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.id_lecon = v_message.id_lecon;
  if not a_inscription_active(v_formation) then
    raise exception 'Ton accès à cette formation n''est plus actif';
  end if;

  insert into commentaires (id_profil, id_lecon, id_parent, contenu, statut, par_equipe, est_prive)
  values (auth.uid(), v_message.id_lecon, v_message.id_commentaire, v_contenu, 'approuve', false, true)
  returning id_commentaire into v_id;

  perform notifier_admins(
    'Message privé d''un élève',
    nom_affichage(auth.uid()) || ' a répondu en privé sous la leçon « ' || v_lecon || ' ».',
    'info',
    '/espace/moderation?onglet=prives',
    'message_prive:' || v_id,
    'information'
  );

  return v_id;
end;
$$;
