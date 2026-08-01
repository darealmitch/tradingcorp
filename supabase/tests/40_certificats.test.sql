-- Délivrance des certificats.
--
-- Le certificat est le seul document du produit qu'un tiers peut vérifier. Ce
-- qui compte n'est donc pas qu'il soit délivré, mais qu'il ne le soit JAMAIS à
-- tort : un certificat de trop vaut moins que pas de certificat du tout, parce
-- qu'il donne une caution formelle à quelque chose qui n'a pas eu lieu.
--
-- Ces tests couvrent les deux sens : l'apprenant qui va au bout l'obtient,
-- et personne d'autre.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai : une formation en deux modules, trois profils
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('d1111111-0000-0000-0000-000000000001', 'cert-ana@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1995-01-01"}'::jsonb),
  ('d1111111-0000-0000-0000-000000000002', 'cert-demo@essai.local',
   '{"prenom":"Dina","nom":"Démo","date_naissance":"1995-01-01"}'::jsonb),
  ('d1111111-0000-0000-0000-000000000003', 'cert-sansinscr@essai.local',
   '{"prenom":"Sam","nom":"Sans","date_naissance":"1995-01-01"}'::jsonb);

update public.profils set est_test = true
 where id_profil = 'd1111111-0000-0000-0000-000000000002';

-- Deux formations : le cursus certifiant, et un atelier qui ne l'est pas. Le
-- certificat atteste d'un cursus complet ; il n'a pas à tomber au bout de
-- n'importe quel contenu du catalogue.
insert into public.formations (id_formation, titre, slug, est_publiee, delivre_certificat) values
  ('d2222222-0000-0000-0000-000000000001', 'Cursus certifiant', 'essai-cert', true, true),
  ('d2222222-0000-0000-0000-000000000002', 'Atelier court', 'essai-atelier', true, false);

insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('d3333333-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001', 'Module 1', 1, true),
  ('d3333333-0000-0000-0000-000000000002', 'd2222222-0000-0000-0000-000000000001', 'Module 2', 2, true),
  ('d3333333-0000-0000-0000-000000000003', 'd2222222-0000-0000-0000-000000000002', 'Atelier', 1, true);

insert into public.lecons (id_lecon, id_section, titre, position, est_publiee) values
  ('d4444444-0000-0000-0000-000000000001', 'd3333333-0000-0000-0000-000000000001', 'Étape 1', 1, true),
  ('d4444444-0000-0000-0000-000000000002', 'd3333333-0000-0000-0000-000000000001', 'Étape 2', 2, true),
  ('d4444444-0000-0000-0000-000000000003', 'd3333333-0000-0000-0000-000000000002', 'Étape 3', 1, true),
  ('d4444444-0000-0000-0000-000000000004', 'd3333333-0000-0000-0000-000000000003', 'Séance unique', 1, true);

-- Le troisième profil n'est volontairement pas inscrit au cursus.
insert into public.inscriptions (id_profil, id_formation) values
  ('d1111111-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001'),
  ('d1111111-0000-0000-0000-000000000002', 'd2222222-0000-0000-0000-000000000001'),
  ('d1111111-0000-0000-0000-000000000003', 'd2222222-0000-0000-0000-000000000002');

-- ─────────────────────────────────────────────────────────────────────────────
-- Parcours incomplet : rien ne se passe
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.progression_lecons (id_profil, id_lecon, terminee_le) values
  ('d1111111-0000-0000-0000-000000000001', 'd4444444-0000-0000-0000-000000000001', now()),
  ('d1111111-0000-0000-0000-000000000001', 'd4444444-0000-0000-0000-000000000002', now());

select is(
  (select count(*)::int from public.certificats
    where id_profil = 'd1111111-0000-0000-0000-000000000001'),
  0,
  'aucun certificat tant qu''une étape reste à faire'
);

-- Le premier module est pourtant terminé : c'est bien la FORMATION entière qui
-- déclenche, pas un module.
select is(
  public.formation_achevee(
    'd1111111-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001'),
  false,
  'un module terminé n''achève pas la formation'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Dernière étape validée : le certificat naît dans la même transaction
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.progression_lecons (id_profil, id_lecon, terminee_le) values
  ('d1111111-0000-0000-0000-000000000001', 'd4444444-0000-0000-0000-000000000003', now());

select is(
  (select count(*)::int from public.certificats
    where id_profil = 'd1111111-0000-0000-0000-000000000001'),
  1,
  'le certificat est délivré à la validation de la dernière étape'
);

-- Le numéro circule et se recopie : ni séquentiel, ni porteur de caractères
-- qu'on confond à la lecture (I/L/O/0/1 sont exclus de l'alphabet).
select matches(
  (select numero from public.certificats
    where id_profil = 'd1111111-0000-0000-0000-000000000001'),
  '^TC-[0-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$',
  'le numéro suit le format public attendu'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = 'd1111111-0000-0000-0000-000000000001'
      and titre = 'Certificat obtenu'),
  1,
  'l''apprenant est prévenu — sans quoi son certificat lui resterait invisible'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotence : une seconde validation ne crée pas un second certificat
-- ─────────────────────────────────────────────────────────────────────────────

update public.progression_lecons set terminee_le = now()
 where id_profil = 'd1111111-0000-0000-0000-000000000001'
   and id_lecon = 'd4444444-0000-0000-0000-000000000003';

select is(
  (select count(*)::int from public.certificats
    where id_profil = 'd1111111-0000-0000-0000-000000000001'),
  1,
  'revalider la dernière étape ne délivre pas un second certificat'
);

select is(
  public.delivrer_certificat(
    'd1111111-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001'),
  null,
  'un appel direct sur un certificat déjà délivré ne rend rien'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Ceux qui ne doivent pas en obtenir
-- ─────────────────────────────────────────────────────────────────────────────

-- Le compte de démonstration valide tout le parcours : son bypass lui ouvre
-- les étapes dans le désordre, un certificat vérifiable ne peut pas reposer
-- là-dessus.
insert into public.progression_lecons (id_profil, id_lecon, terminee_le) values
  ('d1111111-0000-0000-0000-000000000002', 'd4444444-0000-0000-0000-000000000001', now()),
  ('d1111111-0000-0000-0000-000000000002', 'd4444444-0000-0000-0000-000000000002', now()),
  ('d1111111-0000-0000-0000-000000000002', 'd4444444-0000-0000-0000-000000000003', now());

select is(
  (select count(*)::int from public.certificats
    where id_profil = 'd1111111-0000-0000-0000-000000000002'),
  0,
  'un compte de démonstration n''obtient pas de certificat'
);

-- Le troisième profil termine le cursus sans y être inscrit (il ne l'est qu'à
-- l'atelier) : l'accès au contenu exige l'inscription, sa conclusion aussi.
insert into public.progression_lecons (id_profil, id_lecon, terminee_le) values
  ('d1111111-0000-0000-0000-000000000003', 'd4444444-0000-0000-0000-000000000001', now()),
  ('d1111111-0000-0000-0000-000000000003', 'd4444444-0000-0000-0000-000000000002', now()),
  ('d1111111-0000-0000-0000-000000000003', 'd4444444-0000-0000-0000-000000000003', now());

select is(
  (select count(*)::int from public.certificats
    where id_profil = 'd1111111-0000-0000-0000-000000000003'
      and id_formation = 'd2222222-0000-0000-0000-000000000001'),
  0,
  'sans inscription active, pas de certificat'
);

-- Et il termine l'atelier auquel il EST inscrit, de bout en bout : c'est la
-- formation elle-même qui n'est pas certifiante.
insert into public.progression_lecons (id_profil, id_lecon, terminee_le) values
  ('d1111111-0000-0000-0000-000000000003', 'd4444444-0000-0000-0000-000000000004', now());

select is(
  (select count(*)::int from public.certificats
    where id_formation = 'd2222222-0000-0000-0000-000000000002'),
  0,
  'une formation non certifiante ne délivre rien, même achevée et inscrite'
);

-- Le défaut compte autant que la règle : ajouter une formation au catalogue ne
-- doit pas créer de certificat tant que personne ne l'a décidé.
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'formations'
      and column_name = 'delivre_certificat'),
  'false',
  'une formation est non certifiante par défaut'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification publique et cloisonnement
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  (select count(*)::int from public.verifier_certificat(
    (select numero from public.certificats
      where id_profil = 'd1111111-0000-0000-0000-000000000001'))),
  1,
  'la vérification publique retrouve le certificat par son numéro'
);

select is(
  (select count(*)::int from public.verifier_certificat('TC-2026-ZZZZZZZZ')),
  0,
  'un numéro inventé ne renvoie rien'
);

-- Aucune policy d'écriture n'est ouverte sur la table : la seule voie est la
-- fonction SECURITY DEFINER. Un client qui voudrait s'auto-certifier n'a
-- aucune porte, pas même une porte gardée.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'certificats'
      and cmd in ('INSERT', 'UPDATE', 'ALL')),
  0,
  'aucune policy n''autorise le client à écrire un certificat'
);

select * from finish();
rollback;
