-- =============================================================================
-- TradingCorp — Notifications automatiques des administrateurs
--
-- Les admins doivent être informés des événements marquants du parcours d'un
-- apprenant. AUCUNE table ni mécanique nouvelle : on réutilise `notifications`
-- (déjà lue par NotificationsService, RLS « ses lignes uniquement ») en posant
-- une ligne par administrateur destinataire.
--
-- Les déclencheurs s'accrochent aux écritures qui MATÉRIALISENT DÉJÀ chaque
-- événement — pas de logique parallèle, et un seul point d'émission par
-- événement quelle que soit la voie empruntée :
--
--   profils            insert  -> création de compte  (inscription, Google,
--                                 Edge Function creer-compte : toutes passent
--                                 par handle_new_user, donc par cet insert)
--   inscriptions       insert  -> achat d'une formation (source = 'paiement',
--                                 posée par le seul webhook Stripe)
--   progression_lecons terminee_le -> fin de module / de formation (les deux
--                                 voies de validation, terminer_lecon pour les
--                                 chapitres vidéo/article et corriger-quiz pour
--                                 les quiz, écrivent dans cette colonne)
--
-- ANTI-DOUBLON — garanti par la base, pas par la prudence des appelants :
-- `cle_evenement` identifie l'événement métier et un index unique interdit une
-- seconde ligne pour le même couple (destinataire, événement). Chaque insertion
-- est en ON CONFLICT DO NOTHING : un rejeu (relance Stripe, revalidation d'une
-- leçon, concurrence entre deux chapitres terminés au même instant) est absorbé
-- silencieusement.
-- =============================================================================

-- 1. Identification de l'événement métier -------------------------------------

alter table notifications add column if not exists cle_evenement text;

comment on column notifications.cle_evenement is
  'Identifiant stable de l''événement métier (ex. « module_termine:<profil>:<section> »). '
  'NULL pour les notifications sans risque de rejeu. Unique par destinataire.';

create unique index if not exists idx_notifications_evenement_unique
  on notifications (id_profil, cle_evenement)
  where cle_evenement is not null;

-- 2. Nom lisible d'un apprenant ------------------------------------------------
--    Prénom/nom peuvent être vides (compte Google sans nom renseigné, création
--    manuelle minimale) : on retombe alors sur l'e-mail plutôt que sur du vide.

create or replace function public.nom_affichage(p_id_profil uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    nullif(btrim(concat_ws(' ', nullif(btrim(p.prenom), ''), nullif(btrim(p.nom), ''))), ''),
    (select u.email::text from auth.users u where u.id = p.id_profil),
    'Un utilisateur'
  )
  from profils p
  where p.id_profil = p_id_profil;
$$;

-- Révocation sur anon ET authenticated, pas seulement PUBLIC : Supabase pose
-- des DEFAULT PRIVILEGES qui accordent EXECUTE à ces deux rôles sur toute
-- nouvelle fonction. Ce sont des grants explicites, qu'un revoke sur PUBLIC ne
-- retire pas. Sans cela, notifier_admins serait appelable en REST par n'importe
-- quel visiteur, qui pourrait injecter de fausses notifications aux admins.
revoke execute on function public.nom_affichage(uuid) from public, anon, authenticated;

-- 3. Émission vers tous les administrateurs ------------------------------------

create or replace function public.notifier_admins(
  p_titre text,
  p_message text,
  p_type text,
  p_lien text,
  p_cle text
)
returns void
language sql security definer set search_path = public
as $$
  insert into notifications (id_profil, titre, message, type, lien, cle_evenement)
  select a.id_profil, p_titre, p_message, p_type, p_lien, p_cle
  from profils a
  where a.role = 'admin'
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
$$;

revoke execute on function public.notifier_admins(text, text, text, text, text)
  from public, anon, authenticated;

-- 4. Périmètre des événements de parcours --------------------------------------
--    Seuls les apprenants déclenchent : un formateur ou un admin qui relit un
--    module pour le vérifier n'est pas une progression pédagogique.
--
--    Les comptes de démonstration (est_test) ne sont PAS exclus : `est_test`
--    écarte des statistiques, pas du suivi — et un compte de test reste le
--    moyen normal de vérifier que la chaîne fonctionne.

create or replace function public.est_apprenant(p_id_profil uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profils p where p.id_profil = p_id_profil and p.role = 'apprenant'
  );
$$;

revoke execute on function public.est_apprenant(uuid) from public, anon, authenticated;

-- 5. Création de compte ---------------------------------------------------------

create or replace function public.notifier_compte_cree()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform notifier_admins(
    'Nouveau compte',
    nom_affichage(new.id_profil) || ' a créé un compte.',
    'info',
    '/espace/utilisateurs',
    'compte_cree:' || new.id_profil
  );
  return new;
end;
$$;

revoke execute on function public.notifier_compte_cree() from public, anon, authenticated;

drop trigger if exists trg_notifier_compte_cree on profils;
create trigger trg_notifier_compte_cree
  after insert on profils
  for each row execute function public.notifier_compte_cree();

-- 6. Achat d'une formation -------------------------------------------------------
--    source = 'paiement' : l'inscription offerte par un admin (source
--    'manuel') n'est pas un achat et n'a pas à être signalée à son auteur.

create or replace function public.notifier_achat_formation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_titre_formation text;
begin
  if new.source <> 'paiement' or not est_apprenant(new.id_profil) then
    return new;
  end if;

  select f.titre into v_titre_formation
  from formations f where f.id_formation = new.id_formation;

  perform notifier_admins(
    'Nouvel achat',
    nom_affichage(new.id_profil) || ' a acheté la formation « '
      || coalesce(v_titre_formation, 'formation supprimée') || ' ».',
    'succes',
    '/espace/paiements',
    'achat:' || new.id_inscription
  );
  return new;
end;
$$;

revoke execute on function public.notifier_achat_formation() from public, anon, authenticated;

drop trigger if exists trg_notifier_achat_formation on inscriptions;
create trigger trg_notifier_achat_formation
  after insert on inscriptions
  for each row execute function public.notifier_achat_formation();

-- 7. Fin de module et fin de formation --------------------------------------------
--    Un module (= section) est terminé quand toutes ses étapes PUBLIÉES le sont,
--    et une formation quand tous ses modules publiés le sont : mêmes règles que
--    etats_modules(), l'autorité côté serveur — un module sans étape publiée
--    n'est jamais « terminé ».

create or replace function public.notifier_progression()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_id_section   uuid;
  v_titre_section text;
  v_id_formation uuid;
  v_titre_formation text;
  v_publiees integer;
  v_restantes integer;
  v_nom text;
begin
  -- La transition « pas terminée -> terminée » est filtrée par la clause WHEN
  -- des deux déclencheurs ci-dessous : ici, la leçon vient d'être validée.
  if not est_apprenant(new.id_profil) then
    return new;
  end if;

  select s.id_section, s.titre, s.id_formation
    into v_id_section, v_titre_section, v_id_formation
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.id_lecon = new.id_lecon;
  if v_id_section is null then
    return new;
  end if;

  -- --- Module terminé ? ---
  select count(*) filter (where l.est_publiee),
         count(*) filter (
           where l.est_publiee
             and not exists (
               select 1 from progression_lecons pl
               where pl.id_lecon = l.id_lecon
                 and pl.id_profil = new.id_profil
                 and pl.terminee_le is not null
             )
         )
    into v_publiees, v_restantes
  from lecons l
  where l.id_section = v_id_section;

  if v_publiees = 0 or v_restantes > 0 then
    return new;
  end if;

  v_nom := nom_affichage(new.id_profil);
  perform notifier_admins(
    'Module terminé',
    v_nom || ' a terminé le module « ' || v_titre_section || ' ».',
    'info',
    '/espace/apprenants',
    'module_termine:' || new.id_profil || ':' || v_id_section
  );

  -- --- Formation terminée ? (étape majeure du parcours) ---
  select count(*) filter (where s.est_publiee),
         count(*) filter (
           where s.est_publiee
             and (
               not exists (
                 select 1 from lecons l
                 where l.id_section = s.id_section and l.est_publiee
               )
               or exists (
                 select 1 from lecons l
                 where l.id_section = s.id_section
                   and l.est_publiee
                   and not exists (
                     select 1 from progression_lecons pl
                     where pl.id_lecon = l.id_lecon
                       and pl.id_profil = new.id_profil
                       and pl.terminee_le is not null
                   )
               )
             )
         )
    into v_publiees, v_restantes
  from sections s
  where s.id_formation = v_id_formation;

  if v_publiees > 0 and v_restantes = 0 then
    select f.titre into v_titre_formation
    from formations f where f.id_formation = v_id_formation;

    perform notifier_admins(
      'Formation terminée',
      v_nom || ' a terminé la formation « ' || coalesce(v_titre_formation, 'formation') || ' ».',
      'succes',
      '/espace/apprenants',
      'formation_terminee:' || new.id_profil || ':' || v_id_formation
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.notifier_progression() from public, anon, authenticated;

-- Deux déclencheurs plutôt qu'un : la condition de transition se dit dans la
-- clause WHEN, évaluée par Postgres avant tout appel de fonction. Séparer les
-- opérations est nécessaire — OLD n'existe pas sur un INSERT et ne peut donc
-- pas être référencé par un WHEN commun aux deux.
--
--   INSERT : la ligne naît déjà terminée (validation d'un chapitre jamais ouvert)
--   UPDATE : terminee_le passe de NULL à une date (jamais l'inverse : les deux
--            écrivains posent un coalesce, la validation est définitive)

drop trigger if exists trg_notifier_progression on progression_lecons;

drop trigger if exists trg_notifier_progression_insert on progression_lecons;
create trigger trg_notifier_progression_insert
  after insert on progression_lecons
  for each row
  when (new.terminee_le is not null)
  execute function public.notifier_progression();

drop trigger if exists trg_notifier_progression_update on progression_lecons;
create trigger trg_notifier_progression_update
  after update of terminee_le on progression_lecons
  for each row
  when (old.terminee_le is null and new.terminee_le is not null)
  execute function public.notifier_progression();
