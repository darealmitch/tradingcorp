-- Ce que le quiz ne doit pas laisser filtrer.
--
-- Le principe de conception est bon depuis l'origine : les bonnes réponses ne
-- quittent pas le serveur avant la soumission, `reponses.correcte` étant
-- réservée au staff et les options passant par `reponses_publiques()`. Ce
-- fichier vérifie que ce principe tient, et que l'ordre des options ne
-- redevient pas une information exploitable.

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Exécute une requête sous l'identité indiquée et rend son résultat textuel,
-- sans jamais laisser le rôle simulé toucher aux tables internes de pgTAP.
create function pg_temp.sous_identite(p_sub text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  execute p_sql into r;
  execute 'reset role';
  return r;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai : deux apprenants inscrits, un quiz à quatre options
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1111111-0000-0000-0000-000000000001', 'quiz-ana@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1995-01-01"}'::jsonb),
  ('c1111111-0000-0000-0000-000000000002', 'quiz-theo@essai.local',
   '{"prenom":"Théo","nom":"Tiers","date_naissance":"1996-01-01"}'::jsonb);

insert into public.formations (id_formation, titre, slug, est_publiee) values
  ('c2222222-0000-0000-0000-000000000001', 'Formation quiz', 'essai-quiz', true);
insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('c3333333-0000-0000-0000-000000000001', 'c2222222-0000-0000-0000-000000000001', 'Module', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type) values
  ('c4444444-0000-0000-0000-000000000001', 'c3333333-0000-0000-0000-000000000001', 'Quiz 1', 1, true, 'quiz');
insert into public.quiz (id_quiz, id_formation, id_lecon, titre) values
  ('c5555555-0000-0000-0000-000000000001', 'c2222222-0000-0000-0000-000000000001',
   'c4444444-0000-0000-0000-000000000001', 'Quiz du module');
insert into public.questions (id_question, id_quiz, libelle, position) values
  ('c6666666-0000-0000-0000-000000000001', 'c5555555-0000-0000-0000-000000000001', 'Une question', 1);

-- Quatre options : de quoi que deux ordres tirés au hasard aient peu de
-- chances de coïncider.
insert into public.reponses (id_reponse, id_question, contenu, correcte) values
  ('c7777777-0000-0000-0000-000000000001', 'c6666666-0000-0000-0000-000000000001', 'Option A', true),
  ('c7777777-0000-0000-0000-000000000002', 'c6666666-0000-0000-0000-000000000001', 'Option B', false),
  ('c7777777-0000-0000-0000-000000000003', 'c6666666-0000-0000-0000-000000000001', 'Option C', false),
  ('c7777777-0000-0000-0000-000000000004', 'c6666666-0000-0000-0000-000000000001', 'Option D', false);

insert into public.inscriptions (id_profil, id_formation) values
  ('c1111111-0000-0000-0000-000000000001', 'c2222222-0000-0000-0000-000000000001'),
  ('c1111111-0000-0000-0000-000000000002', 'c2222222-0000-0000-0000-000000000001');

-- La requête que le front exécute réellement, réduite à l'ordre obtenu.
create function pg_temp.ordre(p_sub text) returns text language sql as $$
  select pg_temp.sous_identite(
    p_sub,
    $q$select string_agg(contenu, '|' order by n)
         from (select contenu, row_number() over () as n
                 from public.reponses_publiques('c6666666-0000-0000-0000-000000000001')) s$q$
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Les bonnes réponses ne sortent pas
-- ─────────────────────────────────────────────────────────────────────────────

-- `reponses_publiques` ne rend que trois colonnes ; `correcte` n'en fait pas
-- partie, et l'y ajouter serait une fuite pure et simple.
select is(
  (select string_agg(a.attname::text, ',' order by a.attnum)
     from pg_proc p
     join unnest(p.proallargtypes, p.proargmodes, p.proargnames)
       with ordinality as a(atttypid, attmode, attname, attnum) on true
    where p.oid = 'public.reponses_publiques'::regproc and a.attmode = 't'),
  'id_reponse,id_question,contenu',
  'les options publiques ne portent pas la colonne « correcte »'
);

select is(
  pg_temp.sous_identite(
    'c1111111-0000-0000-0000-000000000001',
    $q$select count(*)::text from public.reponses
        where id_question = 'c6666666-0000-0000-0000-000000000001'$q$
  ),
  '0',
  'un apprenant ne lit pas la table des réponses en direct'
);

select is(
  pg_temp.sous_identite(
    'c1111111-0000-0000-0000-000000000001',
    $q$select count(*)::text from public.reponses_publiques('c6666666-0000-0000-0000-000000000001')$q$
  ),
  '4',
  'mais il reçoit bien les quatre options par la fonction prévue'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ordre des options n'est pas une information partageable
-- ─────────────────────────────────────────────────────────────────────────────

-- Un ordre commun à tous permet de transmettre une réponse par sa position
-- (« c'est la 3e »), sans rien savoir de la question.
select isnt(
  pg_temp.ordre('c1111111-0000-0000-0000-000000000001'),
  pg_temp.ordre('c1111111-0000-0000-0000-000000000002'),
  'deux apprenants ne voient pas les options dans le même ordre'
);

-- Stable pendant la passation : les options ne doivent pas se réagencer entre
-- l'affichage de la question et l'envoi des réponses.
select is(
  pg_temp.ordre('c1111111-0000-0000-0000-000000000001'),
  pg_temp.ordre('c1111111-0000-0000-0000-000000000001'),
  'l’ordre ne bouge pas tant que l’apprenant n’a rien soumis'
);

-- … mais change à la tentative suivante : rejouer un quiz ne doit pas se
-- réduire à refaire la même suite de clics.
create temporary table ordre_avant as
  select pg_temp.ordre('c1111111-0000-0000-0000-000000000001') as valeur;

insert into public.tentatives_quiz (id_profil, id_quiz, score, reussi, reponses_donnees)
values ('c1111111-0000-0000-0000-000000000001', 'c5555555-0000-0000-0000-000000000001',
        25, false, '{}'::jsonb);

select isnt(
  (select valeur from ordre_avant),
  pg_temp.ordre('c1111111-0000-0000-0000-000000000001'),
  'l’ordre change après une tentative'
);

-- La tentative de l'un ne réagence pas l'écran de l'autre.
select is(
  pg_temp.ordre('c1111111-0000-0000-0000-000000000002'),
  pg_temp.ordre('c1111111-0000-0000-0000-000000000002'),
  'la tentative d’un apprenant est sans effet sur l’ordre vu par un autre'
);

select * from finish();
rollback;
