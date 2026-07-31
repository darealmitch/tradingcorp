-- Autorisations : ce que chaque identité peut réellement lire et écrire.
--
-- La question à laquelle ce fichier répond n'est pas « la policy existe-t-elle »
-- mais « que se passe-t-il quand quelqu'un contourne l'interface et parle
-- directement à la base ». C'est le scénario des défauts P-03, P-04 et P-05 :
-- aucun ne demandait autre chose qu'un appel HTTP bien formé.
--
-- Deux partis pris :
--
--   • Chaque droit est vérifié dans les deux sens — un accès accordé ET un
--     accès refusé. Un « 0 » ne prouve rien tant que personne ne voit la
--     donnée : chaque refus a donc sa contre-épreuve.
--   • Les comptages portent sur le seul jeu d'essai, jamais sur les tables
--     entières. Un futur seed ne fera pas échouer ces tests, et ils gardent le
--     même sens sur une base déjà peuplée.

begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

-- ─────────────────────────────────────────────────────────────────────────────
-- Outils : exécuter sous une identité, sans jamais laisser le rôle simulé
-- toucher aux tables internes de pgTAP.
--
-- `set local role` est posé À L'INTÉRIEUR de ces fonctions et défait avant le
-- retour : les assertions elles-mêmes restent exécutées par le rôle de session.
-- ─────────────────────────────────────────────────────────────────────────────

-- Les six comptes du jeu d'essai, pour cadrer les comptages sur `profils`.
create function pg_temp.comptes() returns uuid[] language sql immutable as $$
  select array[
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666666'
  ]::uuid[];
$$;

-- Passe l'identité demandée (null = visiteur anonyme) puis rend le résultat
-- d'une requête de comptage.
create function pg_temp.observer(p_sub text, p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config(
    'request.jwt.claims',
    case when p_sub is null then ''
         else json_build_object('sub', p_sub, 'role', 'authenticated')::text end,
    true
  );
  execute 'set local role ' || case when p_sub is null then 'anon' else 'authenticated' end;
  execute p_sql into n;
  execute 'reset role';
  return n;
end;
$$;

-- Tente une écriture sous une identité et rend le SQLSTATE du refus, ou NULL
-- si l'écriture est passée.
--
-- L'exception « P9999 » est volontaire : elle annule le point de reprise créé
-- par le bloc, donc une écriture autorisée ne laisse aucune trace derrière
-- elle et ne fausse pas les tests suivants.
create function pg_temp.essai(p_sub text, p_sql text) returns text
language plpgsql as $$
declare code text;
begin
  perform set_config(
    'request.jwt.claims',
    case when p_sub is null then ''
         else json_build_object('sub', p_sub, 'role', 'authenticated')::text end,
    true
  );
  execute 'set local role ' || case when p_sub is null then 'anon' else 'authenticated' end;
  begin
    execute p_sql;
    raise exception using errcode = 'P9999';
  exception when others then
    code := case when sqlstate = 'P9999' then null else sqlstate end;
  end;
  execute 'reset role';
  return code;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai
-- ─────────────────────────────────────────────────────────────────────────────

-- Le trigger `on_auth_user_created` crée le profil ; la date de naissance
-- majeure est donc obligatoire pour chacun de ces comptes (voir P-02).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@essai.local',
   '{"prenom":"Adèle","nom":"Admin","date_naissance":"1980-01-01"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'formateur@essai.local',
   '{"prenom":"Fred","nom":"Formateur","date_naissance":"1985-01-01"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'apprenant@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1995-01-01"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'tiers@essai.local',
   '{"prenom":"Théo","nom":"Tiers","date_naissance":"1996-01-01"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'sansinscription@essai.local',
   '{"prenom":"Sam","nom":"Sans","date_naissance":"1997-01-01"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'demo@essai.local',
   '{"prenom":"Dina","nom":"Démo","date_naissance":"1998-01-01"}'::jsonb);

update public.profils set role = 'admin'     where id_profil = '11111111-1111-1111-1111-111111111111';
update public.profils set role = 'formateur' where id_profil = '22222222-2222-2222-2222-222222222222';
update public.profils set est_test = true    where id_profil = '66666666-6666-6666-6666-666666666666';

insert into public.formations (id_formation, titre, slug, est_publiee) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Formation publiée', 'essai-publiee', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Brouillon', 'essai-brouillon', false);

insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Module 1', 1, true);

-- Deux leçons consécutives : la seconde n'est accessible qu'une fois la
-- première terminée (fonction `lecon_debloquee`).
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Leçon 1', 1, true),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Leçon 2', 2, true);

insert into public.quiz (id_quiz, id_formation, titre, id_lecon) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Quiz 1',
   'cccccccc-0000-0000-0000-000000000001');

insert into public.questions (id_question, id_quiz, libelle, position) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Question 1', 1);

insert into public.reponses (id_reponse, id_question, contenu, correcte) values
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'La bonne', true),
  ('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'La mauvaise', false);

-- Le compte de démonstration n'est volontairement pas inscrit : son accès
-- élargi doit venir de `est_test`, pas d'une inscription.
insert into public.inscriptions (id_profil, id_formation) values
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.avis (id_avis, id_profil, id_formation, note, contenu) values
  ('99999999-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
   'aaaaaaaa-0000-0000-0000-000000000001', 5, 'Avis en attente de modération');

insert into public.notifications (id_profil, titre) values
  ('33333333-3333-3333-3333-333333333333', 'Notification privée du jeu d''essai');

insert into public.journal_admin (id_profil, action) values
  ('11111111-1111-1111-1111-111111111111', 'essai-autorisations');

-- ─────────────────────────────────────────────────────────────────────────────
-- Visiteur anonyme
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.observer(null,
    'select count(*) from public.profils where id_profil = any(pg_temp.comptes())'),
  0::bigint,
  'anon — aucun profil visible'
);

select is(
  pg_temp.observer(null,
    $q$select count(*) from public.formations
        where slug in ('essai-publiee', 'essai-brouillon')$q$),
  1::bigint,
  'anon — voit la formation publiée, pas le brouillon'
);

select is(
  pg_temp.observer(null,
    $q$select count(*) from public.lecons
        where id_section = 'bbbbbbbb-0000-0000-0000-000000000001'$q$),
  0::bigint,
  'anon — aucun contenu de leçon'
);

select is(
  pg_temp.observer(null,
    $q$select count(*) from public.avis
        where id_avis = '99999999-0000-0000-0000-000000000001'$q$),
  0::bigint,
  'anon — ne voit pas un avis en attente de modération'
);

select is(
  pg_temp.essai(null, $q$
    insert into public.avis (id_profil, id_formation, note, contenu)
    values ('33333333-3333-3333-3333-333333333333',
            'aaaaaaaa-0000-0000-0000-000000000001', 5, 'Faux avis')
  $q$),
  '42501',
  'anon — ne peut pas déposer d''avis au nom d''un inscrit'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Connecté mais non inscrit — le cas du prospect
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.observer('55555555-5555-5555-5555-555555555555',
    $q$select count(*) from public.sections
        where id_section = 'bbbbbbbb-0000-0000-0000-000000000001'$q$),
  1::bigint,
  'non-inscrit — voit le programme (sections publiées)'
);

select is(
  pg_temp.observer('55555555-5555-5555-5555-555555555555',
    $q$select count(*) from public.lecons
        where id_section = 'bbbbbbbb-0000-0000-0000-000000000001'$q$),
  0::bigint,
  'non-inscrit — mais aucun contenu de leçon'
);

select is(
  pg_temp.observer('55555555-5555-5555-5555-555555555555',
    $q$select count(*) from public.quiz
        where id_quiz = 'dddddddd-0000-0000-0000-000000000001'$q$),
  0::bigint,
  'non-inscrit — aucun quiz'
);

select is(
  pg_temp.essai('55555555-5555-5555-5555-555555555555', $q$
    insert into public.inscriptions (id_profil, id_formation)
    values ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001')
  $q$),
  '42501',
  'non-inscrit — ne peut pas s''inscrire lui-même à une formation payante'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Apprenant inscrit
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.observer('33333333-3333-3333-3333-333333333333',
    $q$select count(*) from public.lecons
        where id_section = 'bbbbbbbb-0000-0000-0000-000000000001'$q$),
  1::bigint,
  'apprenant — voit la première leçon, pas la suivante encore verrouillée'
);

select is(
  pg_temp.observer('33333333-3333-3333-3333-333333333333',
    $q$select count(*) from public.quiz
        where id_quiz = 'dddddddd-0000-0000-0000-000000000001'$q$),
  1::bigint,
  'apprenant — accède au quiz de la leçon débloquée'
);

select is(
  pg_temp.observer('33333333-3333-3333-3333-333333333333',
    'select count(*) from public.profils where id_profil = any(pg_temp.comptes())'),
  1::bigint,
  'apprenant — ne voit que son propre profil'
);

-- Ces deux assertions vont par paire : le « 0 » du voisin ne prouve rien tant
-- que le propriétaire, lui, voit bien sa donnée.
select is(
  pg_temp.observer('33333333-3333-3333-3333-333333333333',
    $q$select count(*) from public.notifications
        where titre = 'Notification privée du jeu d''essai'$q$),
  1::bigint,
  'apprenant — lit sa propre notification'
);

select is(
  pg_temp.observer('44444444-4444-4444-4444-444444444444',
    $q$select count(*) from public.notifications
        where titre = 'Notification privée du jeu d''essai'$q$),
  0::bigint,
  'apprenant — ne lit pas les notifications d''un autre apprenant'
);

select is(
  pg_temp.observer('33333333-3333-3333-3333-333333333333',
    $q$select count(*) from public.reponses
        where id_question = 'eeeeeeee-0000-0000-0000-000000000001'$q$),
  0::bigint,
  'apprenant — ne voit jamais quelle réponse est la bonne'
);

select is(
  pg_temp.observer('33333333-3333-3333-3333-333333333333',
    $q$select count(*) from public.journal_admin where action = 'essai-autorisations'$q$),
  0::bigint,
  'apprenant — aucun accès au journal d''administration'
);

select is(
  pg_temp.observer('33333333-3333-3333-3333-333333333333',
    $q$select count(*) from public.avis
        where id_avis = '99999999-0000-0000-0000-000000000001'$q$),
  1::bigint,
  'apprenant — voit son propre avis tant qu''il est en attente'
);

select is(
  pg_temp.observer('44444444-4444-4444-4444-444444444444',
    $q$select count(*) from public.avis
        where id_avis = '99999999-0000-0000-0000-000000000001'$q$),
  0::bigint,
  'apprenant — ne voit pas l''avis en attente d''un autre apprenant'
);

-- Le verrou de progression tient à `terminee_le`, que le client ne peut pas
-- écrire : sinon un seul UPDATE ouvrirait toute la formation.
select is(
  pg_temp.essai('33333333-3333-3333-3333-333333333333', $q$
    insert into public.progression_lecons (id_profil, id_lecon, terminee_le)
    values ('33333333-3333-3333-3333-333333333333',
            'cccccccc-0000-0000-0000-000000000001', now())
  $q$),
  '42501',
  'apprenant — ne peut pas se déclarer une leçon terminée'
);

-- Contre-épreuve : la reprise de lecture, elle, doit fonctionner.
select is(
  pg_temp.essai('33333333-3333-3333-3333-333333333333', $q$
    insert into public.progression_lecons (id_profil, id_lecon, position_video_s)
    values ('33333333-3333-3333-3333-333333333333',
            'cccccccc-0000-0000-0000-000000000001', 42)
  $q$),
  null::text,
  'apprenant — enregistre bien sa position de lecture'
);

select is(
  pg_temp.essai('33333333-3333-3333-3333-333333333333', $q$
    insert into public.progression_lecons (id_profil, id_lecon, position_video_s)
    values ('44444444-4444-4444-4444-444444444444',
            'cccccccc-0000-0000-0000-000000000001', 42)
  $q$),
  '42501',
  'apprenant — ne peut pas écrire la progression de quelqu''un d''autre'
);

-- P-03 : le WITH CHECK doit refuser la sortie de l'état « en_attente ».
select is(
  pg_temp.essai('33333333-3333-3333-3333-333333333333', $q$
    update public.avis set statut = 'approuve'
     where id_avis = '99999999-0000-0000-0000-000000000001'
  $q$),
  '42501',
  'P-03 — un auteur ne peut pas approuver son propre avis'
);

select is(
  pg_temp.essai('33333333-3333-3333-3333-333333333333', $q$
    update public.avis set contenu = 'Texte corrigé'
     where id_avis = '99999999-0000-0000-0000-000000000001'
  $q$),
  null::text,
  'P-03 — mais il corrige toujours le texte tant que l''avis est en attente'
);

-- P-04 : le blocage du mot de passe temporaire n'est pas à la main de son porteur.
select is(
  pg_temp.essai('33333333-3333-3333-3333-333333333333', $q$
    update public.profils set doit_changer_mdp = false
     where id_profil = '33333333-3333-3333-3333-333333333333'
  $q$),
  '42501',
  'P-04 — un utilisateur ne peut pas lever son propre blocage de mot de passe'
);

select is(
  pg_temp.essai('33333333-3333-3333-3333-333333333333', $q$
    update public.profils set role = 'admin'
     where id_profil = '33333333-3333-3333-3333-333333333333'
  $q$),
  '42501',
  'apprenant — ne peut pas se promouvoir administrateur'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Compte de démonstration : accès élargi au contenu, jamais aux droits
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.observer('66666666-6666-6666-6666-666666666666',
    $q$select count(*) from public.lecons
        where id_section = 'bbbbbbbb-0000-0000-0000-000000000001'$q$),
  2::bigint,
  'compte test — voit tout le contenu sans inscription ni progression'
);

select is(
  pg_temp.observer('66666666-6666-6666-6666-666666666666',
    $q$select count(*) from public.journal_admin where action = 'essai-autorisations'$q$),
  0::bigint,
  'compte test — son bypass ne lui ouvre aucun droit d''administration'
);

select is(
  pg_temp.observer('66666666-6666-6666-6666-666666666666',
    $q$select count(*) from public.reponses
        where id_question = 'eeeeeeee-0000-0000-0000-000000000001'$q$),
  0::bigint,
  'compte test — ne voit pas les bonnes réponses pour autant'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Formateur
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.observer('22222222-2222-2222-2222-222222222222',
    $q$select count(*) from public.reponses
        where id_question = 'eeeeeeee-0000-0000-0000-000000000001'$q$),
  2::bigint,
  'formateur — voit les corrections des quiz'
);

select is(
  pg_temp.essai('22222222-2222-2222-2222-222222222222', $q$
    update public.avis set statut = 'approuve'
     where id_avis = '99999999-0000-0000-0000-000000000001'
  $q$),
  null::text,
  'formateur — approuve un avis en attente'
);

select is(
  pg_temp.observer('22222222-2222-2222-2222-222222222222',
    $q$select count(*) from public.journal_admin where action = 'essai-autorisations'$q$),
  0::bigint,
  'formateur — le journal d''administration lui reste fermé'
);

select is(
  pg_temp.essai('22222222-2222-2222-2222-222222222222', $q$
    insert into public.inscriptions (id_profil, id_formation)
    values ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001')
  $q$),
  '42501',
  'formateur — ne peut pas inscrire un utilisateur (réservé aux administrateurs)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Administrateur
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.observer('11111111-1111-1111-1111-111111111111',
    'select count(*) from public.profils where id_profil = any(pg_temp.comptes())'),
  6::bigint,
  'admin — voit tous les profils'
);

-- Contre-épreuve des trois « journal fermé » ci-dessus : la ligne existe bel
-- et bien, et quelqu'un la voit.
select is(
  pg_temp.observer('11111111-1111-1111-1111-111111111111',
    $q$select count(*) from public.journal_admin where action = 'essai-autorisations'$q$),
  1::bigint,
  'admin — voit le journal d''administration'
);

select is(
  pg_temp.essai('11111111-1111-1111-1111-111111111111', $q$
    insert into public.inscriptions (id_profil, id_formation)
    values ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001')
  $q$),
  null::text,
  'admin — inscrit un utilisateur à une formation'
);

select * from finish();
rollback;
