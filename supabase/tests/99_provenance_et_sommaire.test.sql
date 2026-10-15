-- Provenance des visites et sommaire public du programme (optimisation
-- commerciale du 16/10/2026).
--
-- Pour le sommaire : qu'un visiteur anonyme lise, module par module, le titre,
-- la nature et la durée des étapes publiées — et rien d'autre ; que ni une
-- leçon ni un module non publiés n'y apparaissent. Pour la provenance : que
-- seules les neuf catégories connues soient comptées, que la recette compte à
-- part, et que la répartition ne soit lisible que par un administrateur.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- ── Données d'essai ─────────────────────────────────────────────────────────

insert into public.formations (id_formation, titre, slug, prix_centimes, est_publiee) values
  ('f9920000-0000-0000-0000-000000000001', 'Formation sommaire 99', 'sommaire-99', 50000, true);

insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('59920000-0000-0000-0000-000000000001', 'f9920000-0000-0000-0000-000000000001', 'Module 1', 1, true),
  ('59920000-0000-0000-0000-000000000002', 'f9920000-0000-0000-0000-000000000001', 'Module 2', 2, true),
  ('59920000-0000-0000-0000-000000000003', 'f9920000-0000-0000-0000-000000000001', 'Module caché', 3, false);

-- Module 1 : introduction, vidéo A offerte (600 s), vidéo B (900 s), un quiz.
-- Module 2 : vidéo C (1200 s), vidéo D non publiée.
-- Module caché : une vidéo publiée, dans un module qui ne l'est pas.
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type, duree_s, est_decouverte) values
  ('19920000-0000-0000-0000-000000000000', '59920000-0000-0000-0000-000000000001', 'Présentation', 0, true, 'intro', null, false),
  ('19920000-0000-0000-0000-00000000000a', '59920000-0000-0000-0000-000000000001', 'Vidéo A', 1, true, 'video', 600, true),
  ('19920000-0000-0000-0000-00000000000b', '59920000-0000-0000-0000-000000000001', 'Vidéo B', 2, true, 'video', 900, false),
  ('19920000-0000-0000-0000-00000000000c', '59920000-0000-0000-0000-000000000001', 'Quiz', 3, true, 'quiz', null, false),
  ('19920000-0000-0000-0000-0000000000c1', '59920000-0000-0000-0000-000000000002', 'Vidéo C', 1, true, 'video', 1200, false),
  ('19920000-0000-0000-0000-0000000000d1', '59920000-0000-0000-0000-000000000002', 'Vidéo D', 2, false, 'video', 300, false),
  ('19920000-0000-0000-0000-0000000000e1', '59920000-0000-0000-0000-000000000003', 'Vidéo E', 1, true, 'video', 999, false);

insert into auth.users (id, email, raw_user_meta_data) values
  ('99200000-0000-0000-0000-0000000000ad', 'ada-provenance@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set role = 'admin'
 where id_profil = '99200000-0000-0000-0000-0000000000ad';

-- Les totaux du jour partent de zéro, le temps de la transaction.
delete from public.mesures_audience;

-- ── Outils ──────────────────────────────────────────────────────────────────

create function pg_temp.anonyme(p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  execute 'set local role anon';
  execute p_sql into r;
  execute 'reset role';
  return r;
end;
$$;

create function pg_temp.provenances(p_site text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '99200000-0000-0000-0000-0000000000ad', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.entonnoir_conversion(30, p_site) -> 'provenances';
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;

-- ── Sommaire ────────────────────────────────────────────────────────────────

select is(
  pg_temp.anonyme($$select (programme -> 0 -> 'lecons')::text from public.vitrine_formation()
                     where id_formation = 'f9920000-0000-0000-0000-000000000001'$$)::jsonb,
  '[{"titre": "Vidéo A", "type": "video", "duree_s": 600, "offerte": true},
    {"titre": "Vidéo B", "type": "video", "duree_s": 900, "offerte": false},
    {"titre": "Quiz", "type": "quiz", "duree_s": null, "offerte": false}]'::jsonb,
  'sommaire — les étapes du module, dans l''ordre, sans l''introduction'
);

select is(
  pg_temp.anonyme($$select (programme -> 1 -> 'lecons')::text from public.vitrine_formation()
                     where id_formation = 'f9920000-0000-0000-0000-000000000001'$$)::jsonb,
  '[{"titre": "Vidéo C", "type": "video", "duree_s": 1200, "offerte": false}]'::jsonb,
  'sommaire — une leçon non publiée n''y figure pas'
);

select is(
  pg_temp.anonyme($$select jsonb_array_length(programme)::text from public.vitrine_formation()
                     where id_formation = 'f9920000-0000-0000-0000-000000000001'$$),
  '2',
  'sommaire — un module non publié n''y figure pas, ni ses leçons'
);

select is(
  pg_temp.anonyme($$select string_agg(distinct k, ',' order by k)
                      from public.vitrine_formation() v,
                           jsonb_array_elements(v.programme) m,
                           jsonb_array_elements(m -> 'lecons') l, jsonb_object_keys(l) k
                     where v.id_formation = 'f9920000-0000-0000-0000-000000000001'$$),
  'duree_s,offerte,titre,type',
  'sommaire — quatre champs par étape, aucun contenu'
);

select is(
  pg_temp.anonyme($$select count(*)::text from public.lecons
                     where id_section = '59920000-0000-0000-0000-000000000001'$$),
  '0',
  'sommaire — la table des leçons reste fermée à un visiteur anonyme'
);

-- ── Provenance ──────────────────────────────────────────────────────────────

select ok(
  has_function_privilege('anon', 'public.compter_evenement(text, text, text)', 'execute'),
  'provenance — un visiteur anonyme compte toujours ses événements'
);

select lives_ok(
  $$select pg_temp.anonyme($q$select public.compter_evenement('prod', 'arrivee', 'meta-ads')::text$q$)$$,
  'provenance — une arrivée par une annonce Meta est comptée'
);

select lives_ok(
  $$select pg_temp.anonyme($q$select concat(public.compter_evenement('prod', 'inscription', 'direct'),
                                           public.compter_evenement('prod', 'arrivee', 'facebook'),
                                           public.compter_evenement('prod', 'inscription', '/'))$q$)$$,
  'provenance — un compte ouvert est compté, une catégorie inconnue est ignorée sans erreur'
);

select is(
  (select string_agg(evenement || ':' || cible || ':' || nombre, ', ' order by evenement, cible)
     from public.mesures_audience),
  'arrivee:meta-ads:1, inscription:direct:1',
  'provenance — seules les catégories connues sont écrites'
);

select is(
  pg_temp.provenances('prod'),
  '{"direct": {"arrivees": 0, "inscriptions": 1}, "meta-ads": {"arrivees": 1, "inscriptions": 0}}'::jsonb,
  'provenance — l''entonnoir répartit arrivées et comptes par provenance'
);

select public.compter_evenement('dev', 'arrivee', 'recherche');

select is(
  pg_temp.provenances('prod') ? 'recherche',
  false,
  'provenance — la recette compte à part'
);

select ok(
  not has_function_privilege('anon', 'public.entonnoir_conversion(integer, text)', 'execute'),
  'provenance — un visiteur anonyme ne lit pas la répartition'
);

select * from finish();
rollback;
