-- =============================================================================
-- Réponses de l'équipe sous les commentaires, publiques ou privées
--
-- Jusqu'ici, l'équipe ne pouvait pas répondre du tout. La règle d'écriture
-- (`commentaires_insert_inscrits`) exige une inscription active et impose le
-- statut « en attente » : un administrateur non inscrit était refusé, un
-- administrateur inscrit voyait sa réponse partir en modération, à approuver
-- lui-même.
--
-- Les réponses de l'équipe passent donc par une fonction dédiée,
-- `repondre_en_equipe()`, et non par la table : elle vérifie le rôle, publie
-- sans modération — modérer l'équipe par l'équipe n'a pas de sens — et prévient
-- l'élève. La voie d'écriture des élèves, elle, ne change pas.
--
-- Deux marqueurs, posés par cette seule fonction :
--
--   • `par_equipe` : la réponse vient de l'équipe. Un élève ne peut lire que son
--     propre profil (`profils_select_self_ou_staff`) : la jointure sur l'auteur
--     lui revient vide, et l'écran afficherait « Compte supprimé » sous une
--     réponse de l'équipe. Le marqueur, figé à l'écriture, lui permet d'afficher
--     « Équipe TradingCorp » sans ouvrir les profils.
--
--   • `est_prive` : la réponse n'est lisible que par l'auteur du message auquel
--     elle répond, et par l'équipe. Elle peut répondre à un message en attente
--     ou rejeté : c'est même son usage premier, répondre à une question
--     personnelle sans la rendre publique.
--
-- Un élève ne peut poser aucun des deux marqueurs : sans cela, il pourrait se
-- faire passer pour l'équipe, ou ouvrir un canal privé vers un autre élève en
-- répondant « en privé » à son message.
-- =============================================================================

alter table public.commentaires
  add column par_equipe boolean not null default false,
  add column est_prive  boolean not null default false;

comment on column public.commentaires.par_equipe is
  'Réponse publiée par l''équipe, via repondre_en_equipe(). Figé à l''écriture : l''élève ne lit pas les profils de l''équipe.';
comment on column public.commentaires.est_prive is
  'Réponse privée : lisible par l''auteur du message parent et par l''équipe seulement.';

-- Une réponse privée est forcément une réponse, et forcément de l'équipe.
alter table public.commentaires
  add constraint commentaires_prive_reponse_de_l_equipe
  check (not est_prive or (par_equipe and id_parent is not null));

-- -----------------------------------------------------------------------------
-- Lecture
--
-- La policy ne peut pas interroger `commentaires` elle-même pour savoir qui a
-- écrit le message parent : la sous-requête serait soumise à cette même policy,
-- et Postgres refuse la récursion. D'où cette fonction SECURITY DEFINER, qui ne
-- répond qu'à une question — « ce message est-il de moi ? » — et ne rend rien
-- d'autre.
-- -----------------------------------------------------------------------------
create or replace function public.est_auteur_du_message(p_id_commentaire uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from commentaires
    where id_commentaire = p_id_commentaire and id_profil = auth.uid()
  );
$$;

revoke execute on function public.est_auteur_du_message(uuid) from public, anon;
grant  execute on function public.est_auteur_du_message(uuid) to authenticated;

drop policy if exists commentaires_select_approuves_ou_soi_ou_staff on public.commentaires;
create policy commentaires_select_approuves_ou_soi_ou_staff on public.commentaires
  for select to authenticated
  using (
    (statut = 'approuve' and not est_prive)
    or id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
    or (est_prive and statut = 'approuve' and est_auteur_du_message(id_parent))
  );

-- -----------------------------------------------------------------------------
-- Écriture par les élèves : inchangée, sauf l'interdiction des deux marqueurs.
-- -----------------------------------------------------------------------------
drop policy if exists commentaires_insert_inscrits on public.commentaires;
create policy commentaires_insert_inscrits on public.commentaires
  for insert to authenticated
  with check (
    id_profil = (select auth.uid())
    and statut = 'en_attente'
    and not par_equipe
    and not est_prive
    and exists (
      select 1
      from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = commentaires.id_lecon
        and a_inscription_active(s.id_formation)
    )
  );

-- USING et WITH CHECK restent identiques (P-03) : l'auteur ne peut ni toucher
-- une réponse de l'équipe, ni transformer la sienne en réponse privée.
drop policy if exists commentaires_update_staff_ou_auteur_en_attente on public.commentaires;
create policy commentaires_update_staff_ou_auteur_en_attente on public.commentaires
  for update to authenticated
  using (
    (select is_formateur_ou_admin())
    or (id_profil = (select auth.uid()) and statut = 'en_attente' and not par_equipe and not est_prive)
  )
  with check (
    (select is_formateur_ou_admin())
    or (id_profil = (select auth.uid()) and statut = 'en_attente' and not par_equipe and not est_prive)
  );

-- -----------------------------------------------------------------------------
-- La réponse de l'équipe
--
-- Un seul niveau de réponse, comme dans l'écran : on répond au message
-- d'origine. Publique, elle n'est possible que sous un message déjà publié —
-- sans quoi les autres élèves la verraient seule, détachée d'une question
-- qu'ils ne lisent pas. Privée, elle ne s'adresse qu'à un élève.
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
  if not p_prive and v_message.statut <> 'approuve' then
    raise exception 'Ce message n''est pas encore publié : approuve-le d''abord, ou réponds en privé';
  end if;

  insert into commentaires (id_profil, id_lecon, id_parent, contenu, statut, par_equipe, est_prive)
  values (auth.uid(), v_message.id_lecon, v_message.id_commentaire, v_contenu, 'approuve', true, p_prive)
  returning id_commentaire into v_id;

  -- L'élève est prévenu : une réponse privée sous un message non publié, il
  -- n'aurait aucune raison de revenir la chercher. Le lien suit la forme des
  -- autres notifications, même si l'écran ne le rend pas encore cliquable.
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
      '/parcours/' || v_id_section || '/lecon/' || v_message.id_lecon,
      'reponse_equipe:' || v_id
    );
  end if;

  return v_id;
end;
$$;

comment on function public.repondre_en_equipe(uuid, text, boolean) is
  'Réponse de l''équipe sous le message d''un élève, publique ou privée, publiée sans modération et notifiée à l''élève.';

revoke execute on function public.repondre_en_equipe(uuid, text, boolean) from public, anon;
grant  execute on function public.repondre_en_equipe(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Droit d'accès (art. 15) : l'export rend aussi les réponses reçues de
-- l'équipe — un échange adressé à la personne la concerne. Reprise à
-- l'identique de la version en place, augmentée de la seule clé
-- `reponses_de_l_equipe`. L'identité du membre de l'équipe n'y figure pas.
-- -----------------------------------------------------------------------------
create or replace function public.mes_donnees_personnelles()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid := auth.uid();
  v_resultat jsonb;
begin
  if v_id is null then
    raise exception 'Connexion requise';
  end if;

  select jsonb_build_object(
    'export_genere_le', now(),
    'avertissement',
      'Export des données personnelles détenues par TradingCorp pour ce compte. '
      || 'Les données de paiement détaillées (carte, banque) sont détenues par Stripe et ne figurent pas ici : '
      || 'TradingCorp n''en conserve aucune.',

    'identite', (
      select jsonb_build_object(
        'prenom', p.prenom,
        'nom', p.nom,
        'email', (select u.email from auth.users u where u.id = v_id),
        'date_naissance', p.date_naissance,
        'role', p.role,
        'compte_cree_le', p.date_creation,
        'derniere_modification', p.date_modification
      )
      from profils p where p.id_profil = v_id
    ),

    'inscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'formation', f.titre,
        'statut', i.statut,
        'source', i.source,
        'inscrit_le', i.date_inscription
      ) order by i.date_inscription)
      from inscriptions i
      join formations f on f.id_formation = i.id_formation
      where i.id_profil = v_id
    ), '[]'::jsonb),

    'progression', coalesce((
      select jsonb_agg(jsonb_build_object(
        'etape', l.titre,
        'terminee_le', pl.terminee_le,
        'position_video_s', pl.position_video_s,
        'video_signalee_terminee_le', pl.video_terminee_le
      ) order by pl.date_creation)
      from progression_lecons pl
      join lecons l on l.id_lecon = pl.id_lecon
      where pl.id_profil = v_id
    ), '[]'::jsonb),

    'presence', (
      select jsonb_build_object(
        'visite_commencee_le', pr.depuis,
        'derniere_activite', pr.vu_le
      )
      from presences pr where pr.id_profil = v_id
    ),

    'tentatives_quiz', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quiz', q.titre,
        'score', t.score,
        'reussi', t.reussi,
        'passe_le', t.date_passage,
        'reponses_donnees', t.reponses_donnees
      ) order by t.date_passage)
      from tentatives_quiz t
      join quiz q on q.id_quiz = t.id_quiz
      where t.id_profil = v_id
    ), '[]'::jsonb),

    'certificats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero,
        'formation', f.titre,
        'obtenu_le', c.date_obtention
      ) order by c.date_obtention)
      from certificats c
      join formations f on f.id_formation = c.id_formation
      where c.id_profil = v_id
    ), '[]'::jsonb),

    'avis', coalesce((
      select jsonb_agg(jsonb_build_object(
        'formation', f.titre,
        'note', a.note,
        'contenu', a.contenu,
        'statut', a.statut,
        'depose_le', a.date_creation
      ) order by a.date_creation)
      from avis a
      join formations f on f.id_formation = a.id_formation
      where a.id_profil = v_id
    ), '[]'::jsonb),

    'commentaires', coalesce((
      select jsonb_agg(jsonb_build_object(
        'etape', l.titre,
        'contenu', cm.contenu,
        'statut', cm.statut,
        'publie_le', cm.date_creation
      ) order by cm.date_creation)
      from commentaires cm
      join lecons l on l.id_lecon = cm.id_lecon
      where cm.id_profil = v_id
    ), '[]'::jsonb),

    'reponses_de_l_equipe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'etape', l.titre,
        'contenu', r.contenu,
        'privee', r.est_prive,
        'recue_le', r.date_creation
      ) order by r.date_creation)
      from commentaires r
      join commentaires m on m.id_commentaire = r.id_parent
      join lecons l on l.id_lecon = r.id_lecon
      where m.id_profil = v_id
        and r.par_equipe
        and r.statut = 'approuve'
    ), '[]'::jsonb),

    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titre', n.titre,
        'message', n.message,
        'envoyee_le', n.date_envoi,
        'lue_le', n.lu_le
      ) order by n.date_envoi)
      from notifications n where n.id_profil = v_id
    ), '[]'::jsonb),

    'paiements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'montant_centimes', pa.montant_centimes,
        'devise', pa.devise,
        'statut', pa.statut,
        'moyen_paiement', pa.moyen_paiement,
        'reference_transaction', pa.reference_transaction,
        'paye_le', pa.date_paiement,
        'conservation',
          'Conservé 10 ans au titre de l''article L123-22 du Code de commerce '
          || '(pièce comptable), même après suppression du compte.'
      ) order by pa.date_paiement)
      from paiements pa where pa.id_profil = v_id
    ), '[]'::jsonb)
  )
  into v_resultat;

  return v_resultat;
end;
$function$;
