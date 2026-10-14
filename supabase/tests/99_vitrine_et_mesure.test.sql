-- Vitrine de la formation et mesure d'audience (diagnostic commercial du
-- 14/10/2026).
--
-- Ce qui compte, pour la vitrine : qu'un visiteur anonyme lise les chiffres
-- du programme — et seulement des chiffres et les titres des leçons offertes ;
-- que rien de non publié n'y entre. Pour la mesure : qu'un visiteur ne puisse
-- qu'ajouter 1 à un compteur connu ; que personne d'autre qu'un administrateur
-- ne lise les totaux ; que l'entonnoir ne compte que les comptes ouverts depuis
-- le site et les paiements réels. Les assertions sur l'entonnoir comparent des
-- écarts, et non des valeurs : la base réelle a déjà ses comptes et paiements.

begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ── Données d'essai ─────────────────────────────────────────────────────────

insert into public.formations (id_formation, titre, slug, prix_centimes, est_publiee) values
  ('f9910000-0000-0000-0000-000000000001', 'Formation vitrine 99', 'vitrine-99', 50000, true),
  ('f9910000-0000-0000-0000-000000000002', 'Brouillon vitrine 99', 'brouillon-99', 40000, false);

insert into public.sections (id_section, id_formation, titre, position, est_publiee, accroche, objectifs) values
  ('59910000-0000-0000-0000-000000000001', 'f9910000-0000-0000-0000-000000000001',
   'Module 1', 1, true, 'Les bases.', array['Comprendre', 'Pratiquer']),
  ('59910000-0000-0000-0000-000000000002', 'f9910000-0000-0000-0000-000000000001',
   'Module 2', 2, true, null, null),
  ('59910000-0000-0000-0000-000000000003', 'f9910000-0000-0000-0000-000000000001',
   'Module caché', 3, false, null, null);

-- Module 1 : introduction, vidéo A offerte (600 s), vidéo B (900 s), un quiz.
-- Module 2 : vidéo C (1200 s), vidéo D non publiée.
-- Module caché : une vidéo publiée, mais dans un module qui ne l'est pas.
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type, duree_s, est_decouverte) values
  ('19910000-0000-0000-0000-000000000000', '59910000-0000-0000-0000-000000000001', 'Présentation', 0, true, 'intro', null, false),
  ('19910000-0000-0000-0000-00000000000a', '59910000-0000-0000-0000-000000000001', 'Vidéo A', 1, true, 'video', 600, true),
  ('19910000-0000-0000-0000-00000000000b', '59910000-0000-0000-0000-000000000001', 'Vidéo B', 2, true, 'video', 900, false),
  ('19910000-0000-0000-0000-00000000000c', '59910000-0000-0000-0000-000000000001', 'Quiz', 3, true, 'quiz', null, false),
  ('19910000-0000-0000-0000-0000000000c1', '59910000-0000-0000-0000-000000000002', 'Vidéo C', 1, true, 'video', 1200, false),
  ('19910000-0000-0000-0000-0000000000d1', '59910000-0000-0000-0000-000000000002', 'Vidéo D', 2, false, 'video', 300, false),
  ('19910000-0000-0000-0000-0000000000e1', '59910000-0000-0000-0000-000000000003', 'Vidéo E', 1, true, 'video', 999, false);

-- Une ressource active compte ; un lien partenaire et une ressource désactivée, non.
insert into public.ressources (id_lecon, nom, type, est_active, url) values
  ('19910000-0000-0000-0000-00000000000a', 'Fiche', 'pdf', true, 'https://exemple.invalid/fiche.pdf'),
  ('19910000-0000-0000-0000-00000000000a', 'Courtier', 'partenaire', true, 'https://exemple.invalid/'),
  ('19910000-0000-0000-0000-00000000000b', 'Ancienne fiche', 'pdf', false, 'https://exemple.invalid/a.pdf');

insert into auth.users (id, email, raw_user_meta_data) values
  ('99100000-0000-0000-0000-0000000000a1', 'eve-mesure@essai.local',
   '{"prenom":"Eve","nom":"Eleve","date_naissance":"1995-05-05"}'::jsonb),
  ('99100000-0000-0000-0000-0000000000ad', 'ada-mesure@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set role = 'admin'
 where id_profil = '99100000-0000-0000-0000-0000000000ad';

-- Rend le résultat de la requête, exécutée par un visiteur anonyme.
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

-- Rend le code d'erreur de la requête sous l'identité donnée (null : visiteur), ou null.
create function pg_temp.erreur_sous(p_sub text, p_sql text) returns text
language plpgsql as $$
declare code text;
begin
  if p_sub is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  else
    execute 'set local role anon';
  end if;
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

-- L'entonnoir, vu par l'administratrice : une valeur de l'objet rendu.
create function pg_temp.entonnoir(p_cle text) returns int
language plpgsql as $$
begin
  return pg_temp.sous('99100000-0000-0000-0000-0000000000ad',
    format($q$select (public.entonnoir_conversion(30, 'prod') ->> %L)$q$, p_cle))::int;
end;
$$;

create temp table releve (cle text primary key, valeur int);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA VITRINE — ce qu'un visiteur anonyme lit
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  has_function_privilege('anon', 'public.vitrine_formation()', 'execute'),
  'vitrine — un visiteur anonyme l''appelle'
);

select is(
  pg_temp.anonyme($$select count(*)::text from public.vitrine_formation()
                    where id_formation = 'f9910000-0000-0000-0000-000000000002'$$),
  '0',
  'vitrine — une formation non publiée n''y figure pas'
);

select is(
  pg_temp.anonyme($$select concat_ws(' / ', titre, prix_centimes, modules, lecons_video,
                                     secondes_video, quiz, ressources)
                      from public.vitrine_formation()
                     where id_formation = 'f9910000-0000-0000-0000-000000000001'$$),
  'Formation vitrine 99 / 50000 / 2 / 3 / 2700 / 1 / 1',
  'vitrine — les chiffres ne comptent que le publié, hors introduction et lien partenaire'
);

select is(
  pg_temp.anonyme($$select lecons_offertes::text from public.vitrine_formation()
                     where id_formation = 'f9910000-0000-0000-0000-000000000001'$$),
  '[{"titre": "Vidéo A", "module": "Module 1", "duree_s": 600}]',
  'vitrine — les leçons offertes, et elles seules, sont nommées'
);

select is(
  pg_temp.anonyme($$select string_agg(m ->> 'titre' || ':' || (m ->> 'lecons_video') || ':'
                                      || (m ->> 'secondes_video') || ':' || (m ->> 'quiz') || ':'
                                      || (m ->> 'lecons_offertes'), ', ')
                      from public.vitrine_formation() v, jsonb_array_elements(v.programme) m
                     where v.id_formation = 'f9910000-0000-0000-0000-000000000001'$$),
  'Module 1:2:1500:1:1, Module 2:1:1200:0:0',
  'vitrine — le programme suit les modules publiés, dans l''ordre'
);

select is(
  pg_temp.anonyme($$select (programme -> 0 ->> 'accroche') || ' | ' || (programme -> 0 -> 'objectifs')::text
                      from public.vitrine_formation()
                     where id_formation = 'f9910000-0000-0000-0000-000000000001'$$),
  'Les bases. | ["Comprendre", "Pratiquer"]',
  'vitrine — accroche et objectifs du module accompagnent ses chiffres'
);

-- Aucun champ de contenu : chaque module ne porte que ces clés-là.
select is(
  pg_temp.anonyme($$select string_agg(distinct k, ',' order by k)
                      from public.vitrine_formation() v,
                           jsonb_array_elements(v.programme) m, jsonb_object_keys(m) k
                     where v.id_formation = 'f9910000-0000-0000-0000-000000000001'$$),
  'accroche,lecons_offertes,lecons_video,objectifs,position,quiz,secondes_video,titre',
  'vitrine — aucun contenu de leçon ne transite par le programme'
);

-- La table des leçons reste fermée au visiteur : la vitrine n'a rien ouvert.
-- Le visiteur garde un droit de lecture sur quelques colonnes, c'est la RLS
-- qui ne lui rend aucune ligne.
select is(
  pg_temp.anonyme($$select count(*)::text from public.lecons
                     where id_section = '59910000-0000-0000-0000-000000000001'$$),
  '0',
  'vitrine — la table des leçons reste fermée à un visiteur anonyme'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA MESURE — un visiteur ajoute 1 à un compteur connu, et ne lit rien
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  has_function_privilege('anon', 'public.compter_evenement(text, text, text)', 'execute'),
  'mesure — un visiteur anonyme peut compter un événement'
);

select ok(
  not has_table_privilege('anon', 'public.mesures_audience', 'select')
  and not has_table_privilege('anon', 'public.mesures_audience', 'insert')
  and not has_table_privilege('authenticated', 'public.mesures_audience', 'insert')
  and not has_table_privilege('authenticated', 'public.mesures_audience', 'update'),
  'mesure — personne n''écrit dans la table en direct, un visiteur ne la lit pas'
);

select is(
  pg_temp.erreur_sous(null, $$select public.compter_evenement('prod', 'vue', '/')$$),
  null::text,
  'mesure — une vue de l''accueil est comptée sans erreur'
);

select is(
  pg_temp.erreur_sous(null, $$select public.compter_evenement('prod', 'vue', '/')$$),
  null::text,
  'mesure — une seconde vue de l''accueil aussi'
);

select is(
  (select nombre from public.mesures_audience
    where jour = (now() at time zone 'Europe/Paris')::date
      and site = 'prod' and evenement = 'vue' and cible = '/'),
  2,
  'mesure — les deux vues s''additionnent sur la ligne du jour'
);

select is(
  pg_temp.erreur_sous(null, $$select public.compter_evenement('prod', 'vue', '/espace/paiements'),
                                     public.compter_evenement('prod', 'clic', 'n-importe-quoi'),
                                     public.compter_evenement('ailleurs', 'vue', '/')$$),
  null::text,
  'mesure — une paire inconnue ne lève pas d''erreur'
);

select is(
  (select count(*)::int from public.mesures_audience
    where cible in ('/espace/paiements', 'n-importe-quoi') or site not in ('prod', 'dev')),
  0,
  'mesure — une paire inconnue n''écrit rien'
);

select is(
  pg_temp.erreur_sous(null, $$select public.compter_evenement('dev', 'clic', 'hero')$$),
  null::text,
  'mesure — la recette compte à part'
);

select is(
  (select string_agg(site || ':' || evenement || ':' || cible || ':' || nombre, ', '
                     order by site, evenement, cible)
     from public.mesures_audience),
  'dev:clic:hero:1, prod:vue:/:2',
  'mesure — une ligne par jour, site, événement et cible, sans rien d''autre'
);

select is(
  pg_temp.sous('99100000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.mesures_audience$$),
  '0',
  'mesure — une élève ne lit pas les totaux'
);

select is(
  pg_temp.sous('99100000-0000-0000-0000-0000000000ad',
    $$select count(*)::text from public.mesures_audience$$),
  '2',
  'mesure — l''administratrice lit les totaux'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ENTONNOIR — réservé à l'administrateur, fondé sur les vraies tables
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('99100000-0000-0000-0000-0000000000a1',
    $$select public.entonnoir_conversion(30, 'prod')$$),
  'P0001',
  'entonnoir — une élève ne l''ouvre pas'
);

select is(
  pg_temp.entonnoir('vues_accueil') || ' / ' || pg_temp.entonnoir('clics'),
  '2 / 0',
  'entonnoir — la production ne compte pas les essais de la recette'
);

insert into releve values
  ('comptes', pg_temp.entonnoir('comptes_crees')),
  ('paiements', pg_temp.entonnoir('paiements'));

-- Un compte ouvert depuis le site compte ; un compte créé par l'équipe, non.
insert into auth.users (id, email, raw_user_meta_data) values
  ('99100000-0000-0000-0000-0000000000b1', 'bob-mesure@essai.local',
   '{"prenom":"Bob","nom":"Visiteur","date_naissance":"1993-03-03"}'::jsonb);

select is(
  pg_temp.entonnoir('comptes_crees') - (select valeur from releve where cle = 'comptes'),
  1,
  'entonnoir — un compte ouvert par un visiteur compte'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('99100000-0000-0000-0000-0000000000c1', 'cyd-mesure@essai.local',
   '{"prenom":"Cyd","nom":"Repris","cree_par_admin":"true"}'::jsonb);

select is(
  pg_temp.entonnoir('comptes_crees') - (select valeur from releve where cle = 'comptes'),
  1,
  'entonnoir — un compte créé par l''équipe ne compte pas'
);

update public.profils set est_test = true
 where id_profil = '99100000-0000-0000-0000-0000000000b1';

select is(
  pg_temp.entonnoir('comptes_crees') - (select valeur from releve where cle = 'comptes'),
  0,
  'entonnoir — un compte de test ne compte pas'
);

-- Un paiement réel compte ; un paiement en mode test, non.
insert into public.paiements (id_profil, montant_centimes, statut, reference_transaction, mode_test) values
  ('99100000-0000-0000-0000-0000000000a1', 50000, 'reussi', 'cs_mesure_99_reel', false),
  ('99100000-0000-0000-0000-0000000000a1', 50000, 'reussi', 'cs_mesure_99_test', true);

select is(
  pg_temp.entonnoir('paiements') - (select valeur from releve where cle = 'paiements'),
  1,
  'entonnoir — seul le paiement réel compte'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA CONSERVATION — 25 mois
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.mesures_audience (jour, site, evenement, cible, nombre) values
  ((now() at time zone 'Europe/Paris')::date - interval '26 months', 'prod', 'vue', '/programme', 5);

select is(
  public.appliquer_retention_mesures(25),
  1,
  'conservation — un total de plus de 25 mois est supprimé'
);

select ok(
  pg_get_functiondef('public.appliquer_retention()'::regprocedure)
    like '%appliquer_retention_mesures(25)%',
  'conservation — la rétention nocturne l''applique'
);

select * from finish();
rollback;
