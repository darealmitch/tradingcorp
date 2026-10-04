-- Parcours détaillé d'un élève, lu par l'équipe.
--
-- La promesse de `parcours_apprenant` est de ne RIEN calculer de neuf : elle
-- expose, pour un élève choisi, ce que l'élève voit lui-même. Le test qui
-- compte le plus est donc la concordance — mêmes totaux que `ma_progression`
-- appelée par l'élève. Si les deux divergent un jour, l'admin et l'élève ne
-- parleraient plus de la même progression.

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai
--   Module 1 (publié) : Étape 1 (vidéo), Étape 2 (quiz), Étape 3 (NON publiée)
--   Module 2 (publié) : Étape 4 (article)
--   Module 3 (NON publié) : Étape 5
-- Eli, inscrite : Étape 1 terminée, vidéo de l'Étape 4 vue, deux tentatives
-- ratées au quiz (40 puis 60, 70 requis). Nora : aucune inscription.
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('90000000-0000-0000-0000-0000000000e1', 'eli-parcours@essai.local',
   '{"prenom":"Eli","nom":"Eleve","date_naissance":"1995-05-05"}'::jsonb),
  ('90000000-0000-0000-0000-0000000000a2', 'nora-parcours@essai.local',
   '{"prenom":"Nora","nom":"Noninscrite","date_naissance":"1996-06-06"}'::jsonb),
  ('90000000-0000-0000-0000-0000000000ad', 'ada-parcours@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-07-07"}'::jsonb),
  ('90000000-0000-0000-0000-0000000000f1', 'fanny-parcours@essai.local',
   '{"prenom":"Fanny","nom":"Formatrice","date_naissance":"1981-08-08"}'::jsonb);

update public.profils set role = 'admin'
 where id_profil = '90000000-0000-0000-0000-0000000000ad';
update public.profils set role = 'formateur'
 where id_profil = '90000000-0000-0000-0000-0000000000f1';

insert into public.formations (id_formation, titre, slug, est_publiee)
values ('f9000000-0000-0000-0000-00000000000f', 'Formation parcours', 'essai-parcours', true);
insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('59000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-00000000000f', 'Module 1', 1, true),
  ('59000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-00000000000f', 'Module 2', 2, true),
  ('59000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-00000000000f', 'Module 3', 3, false);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type) values
  ('19000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', 'Étape 1', 1, true,  'video'),
  ('19000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000001', 'Étape 2', 2, true,  'quiz'),
  ('19000000-0000-0000-0000-000000000003', '59000000-0000-0000-0000-000000000001', 'Étape 3', 3, false, 'video'),
  ('19000000-0000-0000-0000-000000000004', '59000000-0000-0000-0000-000000000002', 'Étape 4', 1, true,  'article'),
  ('19000000-0000-0000-0000-000000000005', '59000000-0000-0000-0000-000000000003', 'Étape 5', 1, true,  'video');
insert into public.quiz (id_quiz, id_formation, id_lecon, titre, score_requis)
values ('99000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-00000000000f',
        '19000000-0000-0000-0000-000000000002', 'Quiz du module 1', 70);
insert into public.inscriptions (id_profil, id_formation)
values ('90000000-0000-0000-0000-0000000000e1', 'f9000000-0000-0000-0000-00000000000f');
insert into public.progression_lecons (id_profil, id_lecon, terminee_le, video_terminee_le) values
  ('90000000-0000-0000-0000-0000000000e1', '19000000-0000-0000-0000-000000000001', now(), now()),
  ('90000000-0000-0000-0000-0000000000e1', '19000000-0000-0000-0000-000000000004', null, now());
insert into public.tentatives_quiz (id_profil, id_quiz, score, reussi, reponses_donnees) values
  ('90000000-0000-0000-0000-0000000000e1', '99000000-0000-0000-0000-000000000001', 40, false, '{}'::jsonb),
  ('90000000-0000-0000-0000-0000000000e1', '99000000-0000-0000-0000-000000000001', 60, false, '{}'::jsonb);

-- Rend le résultat de la requête, exécutée sous l'identité donnée.
create function pg_temp.sous(p_sub text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into r;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;

-- Rend le code d'erreur de la requête sous l'identité donnée, ou null.
create function pg_temp.erreur_sous(p_sub text, p_sql text) returns text
language plpgsql as $$
declare code text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    code := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return code;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- QUI PEUT LIRE
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('90000000-0000-0000-0000-0000000000e1',
    $$select * from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')$$),
  'P0001',
  'parcours — un élève ne lit pas le détail, pas même le sien, par cette voie'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000f1',
    $$select count(*)::text from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')$$),
  '3',
  'parcours — une formatrice le lit, comme la page Apprenants'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI EST RENDU — le programme publié, et lui seul
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select string_agg(titre_lecon, ',' order by position_module, position_lecon)
        from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')$$),
  'Étape 1,Étape 2,Étape 4',
  'parcours — ni leçon dépubliée, ni module masqué'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select count(*)::text from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')
       where terminee_le is not null$$),
  '1',
  'parcours — la leçon terminée est reconnue'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select titre_lecon from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')
       where video_terminee_le is not null and terminee_le is null$$),
  'Étape 4',
  'parcours — la leçon entamée (vidéo vue, non validée) est reconnue'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select nombre_tentatives || '/' || meilleur_score || '/' || score_requis
        from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')
       where titre_lecon = 'Étape 2'$$),
  '2/60/70',
  'parcours — un quiz porte ses tentatives, le meilleur score et le score requis'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select (nombre_tentatives = 0 and score_requis is null)::text
        from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')
       where titre_lecon = 'Étape 1'$$),
  'true',
  'parcours — une leçon sans quiz ne porte ni tentative ni score'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select count(*)::text from public.parcours_apprenant('90000000-0000-0000-0000-0000000000a2')$$),
  '0',
  'parcours — sans inscription, aucun parcours'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONCORDANCE — l'équipe et l'élève lisent la même progression
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select count(*)::text from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')$$),
  pg_temp.sous('90000000-0000-0000-0000-0000000000e1',
    $$select total::text from public.ma_progression()$$),
  'concordance — même total que celui que voit l''élève'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select count(*)::text from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')
       where terminee_le is not null$$),
  pg_temp.sous('90000000-0000-0000-0000-0000000000e1',
    $$select terminees::text from public.ma_progression()$$),
  'concordance — même nombre de leçons terminées que celui que voit l''élève'
);

select is(
  pg_temp.sous('90000000-0000-0000-0000-0000000000ad',
    $$select count(distinct id_section)::text
        from public.parcours_apprenant('90000000-0000-0000-0000-0000000000e1')$$),
  pg_temp.sous('90000000-0000-0000-0000-0000000000e1',
    $$select count(*)::text from public.etats_modules('f9000000-0000-0000-0000-00000000000f')$$),
  'concordance — mêmes modules que ceux de la page Parcours de l''élève'
);

select * from finish();
rollback;
