-- =============================================================================
-- Échanges privés et modération retrouvable
--
-- Trois manques, relevés en recette le 05/10/2026 :
--
--   • l'élève lisait la réponse privée de l'équipe mais ne pouvait pas y
--     répondre en privé : sa réponse partait en public, après modération ;
--   • l'équipe ne pouvait rendre privé ou public que sa propre réponse, et
--     seulement en l'écrivant ;
--   • une fois approuvé ou rejeté, un message sortait de l'écran de modération
--     sans qu'aucun écran ne permette de le retrouver.
--
-- Le modèle reste à un seul niveau de réponse. Un message privé n'est lu que
-- par son auteur, par l'élève à qui il s'adresse et par l'équipe :
--
--   • réponse privée de l'équipe : son auteur, l'auteur du fil, l'équipe ;
--   • réponse privée de l'élève (dans son propre fil) : lui et l'équipe ;
--   • message d'origine rendu privé : TOUT le fil sort de la vue des autres
--     élèves. Réversible : rendu public, le fil retrouve l'affichage d'avant,
--     chaque réponse gardant son propre marqueur.
--
-- Droits resserrés au passage, sans rien retirer à l'écran de modération
-- encore en production (il change le statut par un UPDATE direct) :
--
--   • seuls `contenu` et `statut` restent modifiables par l'API : l'auteur, la
--     leçon, le fil et les marqueurs ne bougent plus qu'à travers les fonctions
--     ci-dessous ;
--   • on ne supprime plus que ses propres messages. La suppression définitive
--     du message d'un élève devient un acte d'administrateur, après rejet, et
--     laisse une trace au journal.
--
-- Le retrait du dernier droit direct de l'équipe — changer le statut sans
-- passer par `moderer_commentaire` — suivra la mise en production de l'écran
-- qui s'en sert : le retirer ici casserait l'écran encore en ligne.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Un fil privé
--
-- Même raison d'être que `est_auteur_du_message` : une policy de `commentaires`
-- ne peut pas relire `commentaires` sans récursion. La fonction ne répond qu'à
-- une question — « ce message est-il privé ? » — et ne rend rien d'autre.
-- -----------------------------------------------------------------------------
create or replace function public.est_message_prive(p_id_commentaire uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select est_prive from commentaires where id_commentaire = p_id_commentaire),
    false
  );
$$;

revoke execute on function public.est_message_prive(uuid) from public, anon;
grant  execute on function public.est_message_prive(uuid) to authenticated;

-- Un message d'origine peut désormais être privé (l'équipe l'y a placé), une
-- réponse d'élève aussi (écrite dans un échange privé). Seule reste interdite
-- la combinaison sans destinataire : un fil privé ouvert par l'équipe.
alter table public.commentaires drop constraint commentaires_prive_reponse_de_l_equipe;
alter table public.commentaires
  add constraint commentaires_prive_coherent
  check (not (est_prive and par_equipe and id_parent is null));

comment on column public.commentaires.est_prive is
  'Message privé : lu par son auteur, par l''équipe et, pour une réponse de l''équipe, par l''auteur du fil. Sur un message d''origine, rend tout le fil privé.';

-- -----------------------------------------------------------------------------
-- Lecture
--
--   1. ses propres messages, quels qu'ils soient ;
--   2. tout, pour l'équipe ;
--   3. le public : approuvé, non privé, et pas sous un fil privé. Une réponse
--      approuvée sous un message encore en modération reste lisible, comme
--      avant : seul le fil PRIVÉ masque ses réponses ;
--   4. dans son propre fil : les réponses de l'équipe, privées ou non, et les
--      réponses publiques des autres — y compris quand le fil est devenu privé.
-- -----------------------------------------------------------------------------
drop policy if exists commentaires_select_approuves_ou_soi_ou_staff on public.commentaires;
create policy commentaires_select_approuves_ou_soi_ou_staff on public.commentaires
  for select to authenticated
  using (
    id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
    or (statut = 'approuve' and not est_prive
        and (id_parent is null or not est_message_prive(id_parent)))
    or (statut = 'approuve' and id_parent is not null
        and (par_equipe or not est_prive)
        and est_auteur_du_message(id_parent))
  );

-- -----------------------------------------------------------------------------
-- Écriture par les élèves : inchangée, sauf sous un fil privé. Personne
-- d'autre que son auteur ne le lit ; lui y répond en privé, par
-- `repondre_en_prive`.
-- -----------------------------------------------------------------------------
drop policy if exists commentaires_insert_inscrits on public.commentaires;
create policy commentaires_insert_inscrits on public.commentaires
  for insert to authenticated
  with check (
    id_profil = (select auth.uid())
    and statut = 'en_attente'
    and not par_equipe
    and not est_prive
    and (id_parent is null or not est_message_prive(id_parent))
    and exists (
      select 1
      from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = commentaires.id_lecon
        and a_inscription_active(s.id_formation)
    )
  );

-- -----------------------------------------------------------------------------
-- Suppression : chacun les siens. L'élève garde son droit à l'effacement ; la
-- suppression du message d'un autre passe par `supprimer_commentaire`.
-- -----------------------------------------------------------------------------
drop policy if exists commentaires_delete_soi_ou_staff on public.commentaires;
create policy commentaires_delete_soi on public.commentaires
  for delete to authenticated
  using (id_profil = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Colonnes modifiables par l'API, même principe que `profils` et
-- `progression_lecons`. La policy de modification reste celle d'aujourd'hui :
-- elle dit QUELLES lignes, ces privilèges disent QUELLES colonnes.
-- -----------------------------------------------------------------------------
revoke update on public.commentaires from anon, authenticated;
grant update (contenu, statut) on public.commentaires to authenticated;

-- -----------------------------------------------------------------------------
-- La réponse de l'équipe : reprise à l'identique, avec deux ajouts — un fil
-- privé n'accepte qu'une réponse privée, et le lien de la notification mène
-- directement aux échanges, en bas de la leçon.
-- -----------------------------------------------------------------------------
create or replace function public.repondre_en_equipe(
  p_id_commentaire uuid,
  p_contenu        text,
  p_prive          boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_message    commentaires%rowtype;
  v_contenu    text := btrim(coalesce(p_contenu, ''));
  v_id         uuid;
  v_id_section uuid;
  v_lecon      text;
begin
  if not is_formateur_ou_admin() then
    raise exception 'Réservé à l''équipe pédagogique';
  end if;
  if v_contenu = '' then
    raise exception 'La réponse est vide';
  end if;
  if length(v_contenu) > 5000 then
    raise exception 'La réponse dépasse 5000 caractères';
  end if;

  select * into v_message from commentaires where id_commentaire = p_id_commentaire;
  if not found then
    raise exception 'Ce message n''existe plus';
  end if;
  if v_message.id_parent is not null then
    raise exception 'On répond au message d''origine, pas à une réponse';
  end if;
  if p_prive and not est_apprenant(v_message.id_profil) then
    raise exception 'Une réponse privée s''adresse à un apprenant';
  end if;
  if not p_prive and v_message.est_prive then
    raise exception 'Cet échange est privé : réponds en privé';
  end if;
  if not p_prive and v_message.statut <> 'approuve' then
    raise exception 'Ce message n''est pas encore publié : approuve-le d''abord, ou réponds en privé';
  end if;

  insert into commentaires (id_profil, id_lecon, id_parent, contenu, statut, par_equipe, est_prive)
  values (auth.uid(), v_message.id_lecon, v_message.id_commentaire, v_contenu, 'approuve', true, p_prive)
  returning id_commentaire into v_id;

  -- L'élève est prévenu : une réponse privée sous un message non publié, il
  -- n'aurait aucune raison de revenir la chercher.
  if est_apprenant(v_message.id_profil) and v_message.id_profil <> auth.uid() then
    select l.id_section, l.titre into v_id_section, v_lecon
    from lecons l where l.id_lecon = v_message.id_lecon;

    insert into notifications (id_profil, titre, message, type, lien, cle_evenement)
    values (
      v_message.id_profil,
      case when p_prive then 'Réponse privée de l''équipe' else 'Réponse de l''équipe' end,
      case when p_prive
        then 'L''équipe TradingCorp t''a répondu en privé sous la leçon « ' || v_lecon || ' ». Toi seul peux lire cette réponse.'
        else 'L''équipe TradingCorp a répondu à ton message sous la leçon « ' || v_lecon || ' ».'
      end,
      'info',
      '/parcours/' || v_id_section || '/lecon/' || v_message.id_lecon || '#echanges',
      'reponse_equipe:' || v_id
    );
  end if;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- La réponse privée de l'élève
--
-- Seulement dans son propre fil, et seulement si un échange privé y est
-- ouvert — fil rendu privé, ou réponse privée de l'équipe : l'élève poursuit
-- une conversation, il n'ouvre pas de canal privé de lui-même. Publiée sans
-- modération : personne d'autre que l'équipe ne la lit. Les administrateurs
-- sont prévenus, comme pour une vente ou un nouveau compte.
-- -----------------------------------------------------------------------------
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
  v_eleve     text;
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

  select nullif(btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), '') into v_eleve
  from profils p where p.id_profil = auth.uid();

  perform notifier_admins(
    'Message privé d''un élève',
    coalesce(v_eleve, 'Un élève') || ' a répondu en privé sous la leçon « ' || v_lecon || ' ».',
    'info',
    '/espace/moderation?onglet=prives',
    'message_prive:' || v_id,
    'information'
  );

  return v_id;
end;
$$;

comment on function public.repondre_en_prive(uuid, text) is
  'Réponse de l''élève dans l''échange privé ouvert sur son propre message, publiée sans modération et signalée aux administrateurs.';

revoke execute on function public.repondre_en_prive(uuid, text) from public, anon;
grant  execute on function public.repondre_en_prive(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- La modération par l'équipe
--
-- Une seule porte pour les quatre décisions, chacune refusée — en français —
-- quand elle n'a pas de sens :
--
--   • approuver / rejeter : les messages des élèves. Une réponse de l'équipe
--     est publiée d'office, et ne se rejette pas : son auteur la supprime ;
--   • rendre privé / public : le message d'origine d'un élève — tout son fil
--     suit — ou une réponse de l'équipe. Jamais la réponse d'un élève : écrite
--     en privé, la publier trahirait ce qu'il a confié à l'équipe.
-- -----------------------------------------------------------------------------
create or replace function public.moderer_commentaire(
  p_id_commentaire uuid,
  p_decision       text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_message commentaires%rowtype;
  v_parent  commentaires%rowtype;
begin
  if not is_formateur_ou_admin() then
    raise exception 'Réservé à l''équipe pédagogique';
  end if;

  select * into v_message from commentaires where id_commentaire = p_id_commentaire;
  if not found then
    raise exception 'Ce message n''existe plus';
  end if;
  if v_message.id_parent is not null then
    select * into v_parent from commentaires where id_commentaire = v_message.id_parent;
  end if;

  case p_decision
    when 'approuver', 'rejeter' then
      if v_message.par_equipe then
        raise exception 'Une réponse de l''équipe ne se modère pas : son auteur peut la supprimer';
      end if;
      update commentaires
         set statut = case when p_decision = 'approuver' then 'approuve' else 'rejete' end
       where id_commentaire = p_id_commentaire;

    when 'rendre_prive', 'rendre_public' then
      if v_message.id_parent is null then
        if not est_apprenant(v_message.id_profil) then
          raise exception 'Seul le message d''un élève change de visibilité';
        end if;
        -- Rendre privé ou public, c'est aussi trancher : le message sort de
        -- la file d'attente.
        update commentaires
           set est_prive = (p_decision = 'rendre_prive'), statut = 'approuve'
         where id_commentaire = p_id_commentaire;
      elsif v_message.par_equipe then
        if p_decision = 'rendre_prive' and not est_apprenant(v_parent.id_profil) then
          raise exception 'Une réponse privée s''adresse à un apprenant';
        end if;
        if p_decision = 'rendre_public' and (v_parent.est_prive or v_parent.statut <> 'approuve') then
          raise exception 'Le message d''origine n''est pas public : la réponse ne peut pas l''être';
        end if;
        update commentaires
           set est_prive = (p_decision = 'rendre_prive')
         where id_commentaire = p_id_commentaire;
      elsif v_message.est_prive then
        raise exception 'Un message écrit en privé par un élève reste privé';
      else
        raise exception 'Seuls le message d''origine d''un élève et les réponses de l''équipe changent de visibilité';
      end if;

    else
      raise exception 'Décision inconnue : %', p_decision;
  end case;
end;
$$;

comment on function public.moderer_commentaire(uuid, text) is
  'Décision de l''équipe sur un commentaire : approuver, rejeter, rendre_prive ou rendre_public.';

revoke execute on function public.moderer_commentaire(uuid, text) from public, anon;
grant  execute on function public.moderer_commentaire(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- La suppression définitive du message d'un élève
--
-- Réservée à l'administrateur, et seulement après rejet : le rejet masque et
-- se rattrape, la suppression emporte aussi les réponses et ne se rattrape
-- pas. D'où la trace au journal, comme pour les autres actes irréversibles.
-- Le texte supprimé n'y est pas recopié : ce serait le conserver.
-- -----------------------------------------------------------------------------
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

  insert into journal_admin (id_profil, action, cible, meta)
  values (
    auth.uid(),
    'suppression_commentaire',
    p_id_commentaire::text,
    jsonb_build_object(
      'auteur', v_message.id_profil,
      'lecon', v_message.id_lecon,
      'ecrit_le', v_message.date_creation,
      'reponses_supprimees', v_reponses
    )
  );

  delete from commentaires where id_commentaire = p_id_commentaire;
end;
$$;

comment on function public.supprimer_commentaire(uuid) is
  'Suppression définitive d''un commentaire rejeté, réservée aux administrateurs et inscrite au journal.';

revoke execute on function public.supprimer_commentaire(uuid) from public, anon;
grant  execute on function public.supprimer_commentaire(uuid) to authenticated;
