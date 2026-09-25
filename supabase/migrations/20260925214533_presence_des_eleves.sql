-- =============================================================================
-- Présence des élèves : qui est sur la plateforme en ce moment
--
-- « Connecté » ne se lit pas dans la session d'authentification : un jeton de
-- rafraîchissement reste valable des semaines, et l'élève qui a fermé son
-- onglet mardi « a une session » jeudi. Ce qui intéresse l'administration,
-- c'est la présence effective. Le navigateur de l'élève la signale donc
-- lui-même, une fois par minute tant que son onglet est visible
-- (`PresenceService`) ; il lui suffit de se taire pour disparaître.
--
-- Trois choix, et ce qu'ils évitent :
--
-- 1. Une table à part, et non une colonne de `profils`. Le trigger
--    `trg_profils_modif` réécrit `date_modification` à chaque UPDATE : un
--    signal par minute en ferait l'heure du dernier passage, et l'export de
--    l'article 15 présenterait comme « dernière modification » de l'identité
--    une date qui n'en est pas une.
--
-- 2. Un signal écrit en base, et non la Presence de Supabase Realtime. Celle-ci
--    saurait laisser l'élève publier sa présence sans voir celle des autres,
--    mais un canal privé n'est étanche que si le réglage « Allow public
--    access » est désactivé dans la console (documentation Realtime
--    Authorization) : un réglage hors du dépôt, que ni la CI ni les tests ne
--    voient. Et la Presence ne garde rien — l'écran ne pourrait pas dire
--    qu'un élève est parti il y a dix minutes.
--
-- 3. Aucun privilège client sur la table. L'élève ne choisit ni l'heure ni la
--    ligne : `signaler_presence()` écrit `now()` pour `auth.uid()`. Seule
--    l'administration lit, par `eleves_connectes()`, qui calcule l'ancienneté
--    du signal côté serveur — l'horloge d'un poste d'administration réglée de
--    travers ne fausse donc pas le statut affiché.
--
-- Conservation : une ligne par élève, écrasée à chaque signal, effacée par la
-- purge quotidienne après 24 heures sans signal, et supprimée avec le compte.
-- Déclarée dans la politique de confidentialité, rendue par l'export.
-- =============================================================================

create table public.presences (
  id_profil uuid primary key references public.profils (id_profil) on delete cascade,
  depuis    timestamp with time zone not null default now(),
  vu_le     timestamp with time zone not null default now()
);

comment on table public.presences is
  'Dernier signe de présence de chaque élève, écrasé à chaque signal. Écrite par signaler_presence(), lue par eleves_connectes() ; aucun accès direct du client.';
comment on column public.presences.depuis is
  'Début de la visite en cours : repart de zéro quand le signal précédent date de plus de 5 minutes.';
comment on column public.presences.vu_le is
  'Heure du dernier signal.';

-- RLS active et AUCUNE policy : volontaire. Le client n'a de toute façon aucun
-- privilège sur la table — tout passe par les deux fonctions ci-dessous.
alter table public.presences enable row level security;
revoke all on public.presences from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Le signal de l'élève
--
-- Rien n'est écrit pour un compte qui n'est pas apprenant : la finalité
-- déclarée est de voir quels ÉLÈVES sont connectés, la donnée n'a pas à
-- exister pour les autres.
-- -----------------------------------------------------------------------------
create or replace function public.signaler_presence()
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into presences as p (id_profil)
  select auth.uid()
  where est_apprenant(auth.uid())
  on conflict (id_profil) do update
     set depuis = case when p.vu_le < now() - interval '5 minutes' then now() else p.depuis end,
         vu_le  = now();
$$;

comment on function public.signaler_presence() is
  'Signal de présence de l''élève connecté, appelé chaque minute par son navigateur. Sans effet pour un compte qui n''est pas apprenant.';

revoke execute on function public.signaler_presence() from public, anon;
grant  execute on function public.signaler_presence() to authenticated;

-- -----------------------------------------------------------------------------
-- La lecture de l'administration
--
-- `inactif_depuis_s` plutôt que l'heure brute du signal : l'écarter de
-- l'horloge du poste qui lit, c'est la seule façon d'avoir un statut juste
-- partout. Les dernières 24 heures seulement — la durée de conservation.
-- -----------------------------------------------------------------------------
create or replace function public.eleves_connectes()
returns table (
  id_profil        uuid,
  prenom           text,
  nom              text,
  est_test         boolean,
  inscrit          boolean,
  depuis           timestamp with time zone,
  inactif_depuis_s integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  return query
  select
    p.id_profil,
    p.prenom,
    p.nom,
    p.est_test,
    exists (
      select 1 from inscriptions i
      where i.id_profil = p.id_profil and i.statut = 'active'
    ),
    pr.depuis,
    -- Jamais négatif : un signal validé pendant cette lecture peut porter une
    -- heure postérieure de quelques microsecondes à celle de la requête.
    greatest(floor(extract(epoch from now() - pr.vu_le)), 0)::integer
  from presences pr
  join profils p on p.id_profil = pr.id_profil
  where p.role = 'apprenant'
    and pr.vu_le > now() - interval '24 hours'
  order by pr.vu_le desc;
end;
$function$;

comment on function public.eleves_connectes() is
  'Élèves ayant donné signe de vie ces dernières 24 heures, du plus récent au plus ancien. Réservée aux administrateurs.';

revoke execute on function public.eleves_connectes() from public, anon;
grant  execute on function public.eleves_connectes() to authenticated;

-- -----------------------------------------------------------------------------
-- Conservation : purge après 24 heures sans signal, branchée sur la tâche
-- quotidienne `retention_rgpd` comme les incidents.
-- -----------------------------------------------------------------------------
create or replace function public.appliquer_retention_presences(p_heures integer default 24)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_supprimees integer;
begin
  delete from public.presences where vu_le < now() - make_interval(hours => p_heures);
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end;
$$;

revoke all on function public.appliquer_retention_presences(integer) from public, anon, authenticated;

create or replace function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_journal       integer;
  v_notifications integer;
  v_paiements     integer;
  v_inactifs      integer;
  v_incidents     integer;
  v_presences     integer;
begin
  v_journal       := appliquer_retention_journal(12);
  v_notifications := appliquer_retention_notifications(12);
  v_paiements     := appliquer_retention_paiements(10);
  v_incidents     := appliquer_retention_incidents(90);
  v_presences     := appliquer_retention_presences(24);
  select count(*) into v_inactifs from comptes_inactifs(3);

  return jsonb_build_object(
    'execute_le', now(),
    'journal_anonymise', v_journal,
    'notifications_supprimees', v_notifications,
    'paiements_anonymises', v_paiements,
    'incidents_supprimes', v_incidents,
    'presences_supprimees', v_presences,
    'comptes_inactifs_a_examiner', v_inactifs
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Droit d'accès (art. 15) : l'export rend aussi la présence.
--
-- Reprise à l'identique de la version en place, augmentée de la seule clé
-- `presence` — nulle quand aucun signal n'est conservé.
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
