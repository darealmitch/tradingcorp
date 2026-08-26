-- =============================================================================
-- TradingCorp — Les droits RGPD deviennent exerçables sans passer par un humain
--
-- Audit RGPD du 25/08/2026, §3.3. Constat vérifié : la page « Mon profil »
-- n'offrait qu'une seule action — se déconnecter. Aucun des six droits des
-- articles 15 à 22 n'était exerçable ; `corriger_identite` et
-- `supprimer-compte` étaient réservées aux administrateurs.
--
-- Le RGPD n'impose pas un libre-service : une procédure sur demande, tenue en
-- moins d'un mois (art. 12.3), satisfait la loi. Mais tenir ce délai à la main,
-- pour chaque demande, n'est pas réaliste — et c'est la première cause de
-- plainte auprès de la CNIL. On outille donc les droits qui peuvent l'être
-- sans risque :
--
--   • ACCÈS (art. 15) et PORTABILITÉ (art. 20) → `mes_donnees_personnelles()`
--   • RECTIFICATION (art. 16)                  → `corriger_mon_identite()`
--   • EFFACEMENT (art. 17)                     → Edge Function `supprimer-compte`
--                                                (auth.users est hors de portée
--                                                du client : voir la fonction)
--
-- LIMITATION (art. 18) et OPPOSITION (art. 21) restent traitées sur demande, et
-- c'est justifié : aucun traitement ici ne repose sur l'intérêt légitime côté
-- utilisateur (le contrat gouverne tout le parcours), et une « limitation »
-- automatisée sur un compte de formation n'aurait pas de sens opérationnel.
-- Ces deux droits sont décrits dans la politique de confidentialité, avec
-- l'adresse de contact.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ACCÈS + PORTABILITÉ — art. 15 et 20
--
-- Un seul JSON, structuré et lisible par machine : c'est exactement ce
-- qu'exige l'article 20 (« format structuré, couramment utilisé et lisible par
-- machine »). Il couvre du même coup le droit d'accès.
--
-- SECURITY DEFINER, mais borné à `auth.uid()` : la fonction ne peut rendre que
-- les données de son appelant. Aucun paramètre d'identité — il n'y a donc rien
-- à falsifier.
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

    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titre', n.titre,
        'message', n.message,
        'envoyee_le', n.date_envoi,
        'lue_le', n.lu_le
      ) order by n.date_envoi)
      from notifications n where n.id_profil = v_id
    ), '[]'::jsonb),

    -- Les paiements sont exportés parce qu'ils font partie des données du
    -- compte, mais ils NE SONT PAS effaçables sur demande : leur conservation
    -- répond à une obligation légale (voir la politique de conservation).
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

comment on function public.mes_donnees_personnelles() is
  'Export complet des données personnelles de l''appelant, en JSON structuré. Couvre le droit d''accès (art. 15) et le droit à la portabilité (art. 20). Bornée à auth.uid() : aucun paramètre d''identité, donc rien à falsifier.';

revoke execute on function public.mes_donnees_personnelles() from public, anon;
grant  execute on function public.mes_donnees_personnelles() to authenticated;

-- -----------------------------------------------------------------------------
-- RECTIFICATION — art. 16
--
-- `corriger_identite()` reste réservée aux administrateurs : elle sert à
-- corriger le compte d'AUTRUI, et son entrée au journal est une action
-- d'administration. Celle-ci est son pendant pour soi-même — et n'est donc PAS
-- journalisée : corriger sa propre faute de frappe n'est pas un acte
-- d'administration, et journaliser chaque correction reviendrait à constituer
-- un historique des identités successives dont personne n'a besoin.
--
-- Ce qui n'est pas rectifiable ici, et pourquoi :
--   • l'e-mail       → passe par Supabase Auth, qui exige une confirmation sur
--                      la nouvelle adresse (sans quoi on pourrait se faire
--                      attribuer l'adresse d'un tiers) ;
--   • la date de naissance → immuable une fois posée, c'est le socle du
--                      contrôle de majorité (P-02). Une erreur se corrige par
--                      le support, après vérification.
-- -----------------------------------------------------------------------------
create or replace function public.corriger_mon_identite(p_prenom text, p_nom text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prenom text := trim(coalesce(p_prenom, ''));
  v_nom    text := trim(coalesce(p_nom, ''));
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  if v_prenom = '' then
    raise exception 'Le prénom ne peut pas être vide'
      using errcode = 'check_violation';
  end if;

  -- Bornes alignées sur la contrainte `profils_identite_bornee` : autant
  -- refuser ici avec un message lisible plutôt que laisser la contrainte
  -- rejeter l'écriture avec un message technique.
  if length(v_prenom) > 100 or length(v_nom) > 100 then
    raise exception 'Prénom et nom sont limités à 100 caractères'
      using errcode = 'check_violation';
  end if;

  update profils
     set prenom = v_prenom,
         nom    = v_nom
   where id_profil = auth.uid();

  if not found then
    raise exception 'Profil introuvable';
  end if;
end;
$function$;

comment on function public.corriger_mon_identite(text, text) is
  'Rectification par la personne elle-même de son prénom et de son nom (RGPD art. 16). Volontairement non journalisée : ce n''est pas une action d''administration.';

revoke execute on function public.corriger_mon_identite(text, text) from public, anon;
grant  execute on function public.corriger_mon_identite(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- EFFACEMENT — art. 17 : ce que la suppression doit emporter
--
-- La suppression elle-même passe par l'Edge Function `supprimer-compte`
-- (`auth.users` n'est accessible qu'au rôle de service). Cette fonction lui
-- donne ce qu'elle ne peut pas deviner : la liste des fichiers à retirer du
-- Storage.
--
-- Sans elle, le PDF du diplôme — nominatif — resterait dans le bucket après la
-- suppression de la ligne `certificats`, orphelin et hors de portée de toute
-- purge future (§3.5 de l'audit).
-- -----------------------------------------------------------------------------
create or replace function public.fichiers_personnels(p_id_profil uuid)
returns table (chemin text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.chemin_storage
  from certificats c
  where c.id_profil = p_id_profil
    and c.chemin_storage is not null;
$function$;

comment on function public.fichiers_personnels(uuid) is
  'Chemins des fichiers nominatifs d''une personne dans le Storage (diplômes PDF). Consommée par l''Edge Function supprimer-compte AVANT la cascade, faute de quoi les fichiers deviendraient orphelins (RGPD art. 17).';

revoke execute on function public.fichiers_personnels(uuid) from public, anon, authenticated;
