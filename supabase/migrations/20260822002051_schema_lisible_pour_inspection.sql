-- =============================================================================
-- TradingCorp — Schéma `lisible` : lire la base sans déchiffrer des UUID
--
-- Les tables d'activité (progression, tentatives, paiements…) ne portent que
-- des identifiants : impossible de savoir QUI a fait QUOI sans enchaîner les
-- jointures à la main dans le SQL editor.
--
-- POURQUOI DES VUES, ET NON DES COLONNES prenom/nom AJOUTÉES AUX TABLES :
-- recopier le nom dans progression_lecons créerait une seconde source de
-- vérité. Le jour où un apprenant corrige son nom, la table de progression
-- garderait l'ancien — et rien ne dirait lequel fait foi. C'est aussi de la
-- donnée personnelle dupliquée dans une table qui n'a aucune raison d'en
-- porter. La jointure, elle, est toujours exacte.
--
-- POURQUOI UN SCHÉMA À PART, ET NON `public` : Supabase n'expose par son API
-- REST que les schémas déclarés (public, graphql_public). Une vue posée dans
-- `lisible` est donc INVISIBLE de l'extérieur par construction, sans dépendre
-- d'un GRANT qu'on pourrait oublier. Le projet a déjà connu une vue publique
-- qui laissait énumérer tous les certificats (cf. 20260711120000) : on ne
-- reproduit pas ce montage. Vérifié après application — l'API répond « Only
-- the following schemas are exposed: public, graphql_public ».
--
-- Ces vues joignent des données personnelles (nom, e-mail) : elles sont
-- réservées au SQL editor, où tu es propriétaire de la base. Aucun rôle de
-- l'API — anon, authenticated — n'y a accès.
-- =============================================================================

create schema if not exists lisible;

comment on schema lisible is
  'Vues de confort pour inspecter la base à la main (SQL editor). Hors des schémas exposés par l''API REST : aucun accès depuis l''application.';

revoke all on schema lisible from anon, authenticated;

-- Qui, quel chapitre, où il en est ------------------------------------------
create or replace view lisible.progression as
select
  p.prenom || ' ' || p.nom            as apprenant,
  u.email,
  s.position                          as module,
  l.titre                             as chapitre,
  l.type,
  pl.terminee_le,
  pl.video_terminee_le,
  pl.position_video_s,
  case
    when l.duree_s is null or l.duree_s = 0 then null
    else round(100.0 * pl.position_video_s / l.duree_s)
  end                                 as pourcent_video,
  pl.date_creation                    as commence_le
from public.progression_lecons pl
join public.profils p on p.id_profil = pl.id_profil
left join auth.users u on u.id = pl.id_profil
join public.lecons l on l.id_lecon = pl.id_lecon
join public.sections s on s.id_section = l.id_section;

-- Qui a passé quel quiz, et avec quel résultat -------------------------------
create or replace view lisible.tentatives as
select
  p.prenom || ' ' || p.nom            as apprenant,
  u.email,
  l.titre                             as chapitre,
  t.score,
  q.score_requis,
  t.reussi,
  t.date_passage
from public.tentatives_quiz t
join public.profils p on p.id_profil = t.id_profil
left join auth.users u on u.id = t.id_profil
join public.quiz q on q.id_quiz = t.id_quiz
left join public.lecons l on l.id_lecon = q.id_lecon;

-- Qui est inscrit à quoi, et par quelle voie ---------------------------------
create or replace view lisible.inscriptions as
select
  p.prenom || ' ' || p.nom            as apprenant,
  u.email,
  f.titre                             as formation,
  i.statut,
  i.source,
  i.date_inscription,
  pa.montant_centimes / 100.0         as montant_paye,
  pa.mode_test                        as paiement_de_test
from public.inscriptions i
join public.profils p on p.id_profil = i.id_profil
left join auth.users u on u.id = i.id_profil
join public.formations f on f.id_formation = i.id_formation
left join public.paiements pa on pa.id_paiement = i.id_paiement;

-- Les encaissements, réels et de test ---------------------------------------
create or replace view lisible.paiements as
select
  coalesce(p.prenom || ' ' || p.nom, '(compte supprimé)') as apprenant,
  coalesce(u.email, pa.email)         as email,
  pa.montant_centimes / 100.0         as montant,
  pa.devise,
  pa.statut,
  pa.moyen_paiement,
  pa.mode_test                        as est_un_test,
  pa.date_paiement,
  pa.reference_transaction
from public.paiements pa
left join public.profils p on p.id_profil = pa.id_profil
left join auth.users u on u.id = pa.id_profil;

-- Les certificats délivrés ---------------------------------------------------
create or replace view lisible.certificats as
select
  p.prenom || ' ' || p.nom            as apprenant,
  u.email,
  f.titre                             as formation,
  c.numero,
  c.date_obtention
from public.certificats c
join public.profils p on p.id_profil = c.id_profil
left join auth.users u on u.id = c.id_profil
join public.formations f on f.id_formation = c.id_formation;

-- Vue d'ensemble par apprenant ----------------------------------------------
create or replace view lisible.apprenants as
select
  p.prenom || ' ' || p.nom            as apprenant,
  u.email,
  p.role,
  p.date_naissance,
  p.est_test                          as compte_de_demo,
  (select count(*) from public.progression_lecons pl
    where pl.id_profil = p.id_profil and pl.terminee_le is not null) as chapitres_termines,
  (select count(*) from public.lecons where est_publiee)             as chapitres_publies,
  (select max(t.date_passage) from public.tentatives_quiz t
    where t.id_profil = p.id_profil)                                 as derniere_tentative,
  p.date_creation                     as inscrit_le
from public.profils p
left join auth.users u on u.id = p.id_profil;
