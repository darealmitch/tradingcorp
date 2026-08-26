-- Droits des personnes et conservation des données (audit RGPD du 25/08/2026).
--
-- Ces règles ont une particularité : leur violation ne produit aucune erreur,
-- aucun écran cassé, aucun test rouge. Un export qui déborderait sur le compte
-- d'un voisin rendrait un JSON parfaitement valide. Un journal qui garderait
-- l'e-mail d'une personne effacée s'afficherait normalement. Une purge qui
-- supprimerait les paiements au lieu de les anonymiser passerait inaperçue
-- jusqu'au contrôle fiscal.
--
-- D'où ces tests, qui vérifient les deux sens à chaque fois : que ce qui doit
-- partir part, ET que ce qui doit rester reste.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai : deux apprenants distincts. Le second existe pour une seule
-- raison — vérifier qu'on ne voit jamais ses données.
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-0000000000b1', 'alice@essai.local',
   '{"prenom":"Alice","nom":"Martin","date_naissance":"1990-03-12"}'::jsonb),
  ('d0000000-0000-0000-0000-0000000000b2', 'bob@essai.local',
   '{"prenom":"Bob","nom":"Durand","date_naissance":"1988-07-24"}'::jsonb),
  ('d0000000-0000-0000-0000-0000000000b3', 'chef@essai.local',
   '{"prenom":"Chef","nom":"Patron","date_naissance":"1975-01-01"}'::jsonb);

update public.profils set role = 'admin'
 where id_profil = 'd0000000-0000-0000-0000-0000000000b3';

insert into public.formations (id_formation, titre, slug, prix_centimes, est_publiee)
values ('f1000000-0000-0000-0000-00000000000f', 'Formation RGPD', 'rgpd', 9900, true);

insert into public.paiements (id_paiement, id_profil, montant_centimes, statut, reference_transaction, email)
values ('9b000000-0000-0000-0000-00000000000e', 'd0000000-0000-0000-0000-0000000000b1',
        9900, 'reussi', 'cs_essai_rgpd', 'alice@essai.local');

insert into public.inscriptions (id_profil, id_formation, id_paiement, statut, source)
values ('d0000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-00000000000f',
        '9b000000-0000-0000-0000-00000000000e', 'active', 'paiement');

-- Le journal porte l'identité d'Alice, comme après une action d'administration.
insert into public.journal_admin (id_profil, id_profil_cible, action, cible, meta, auteur)
values
  ('d0000000-0000-0000-0000-0000000000b3', 'd0000000-0000-0000-0000-0000000000b1',
   'changement_role', 'alice@essai.local',
   '{"nouveau_role":"apprenant","prenom":"Alice","nom":"Martin"}'::jsonb, 'chef@essai.local'),
  ('d0000000-0000-0000-0000-0000000000b3', 'd0000000-0000-0000-0000-0000000000b2',
   'changement_role', 'bob@essai.local',
   '{"nouveau_role":"apprenant","prenom":"Bob","nom":"Durand"}'::jsonb, 'chef@essai.local');

create function pg_temp.sous(p_sub text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into r;
  execute 'reset role';
  return r;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCÈS ET PORTABILITÉ — art. 15 et 20
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('d0000000-0000-0000-0000-0000000000b1',
               'select mes_donnees_personnelles() -> ''identite'' ->> ''prenom'''),
  'Alice',
  'art. 15 — l''export rend bien les données de son appelant'
);

select is(
  pg_temp.sous('d0000000-0000-0000-0000-0000000000b1',
               'select mes_donnees_personnelles() -> ''identite'' ->> ''email'''),
  'alice@essai.local',
  'art. 15 — l''e-mail, qui vit dans auth.users, est résolu'
);

-- Le point sensible : l'export est borné à `auth.uid()` et ne prend AUCUN
-- paramètre. Bob ne peut donc pas apparaître dans l'export d'Alice.
select is(
  pg_temp.sous('d0000000-0000-0000-0000-0000000000b2',
               'select mes_donnees_personnelles() -> ''identite'' ->> ''prenom'''),
  'Bob',
  'art. 15 — chacun n''obtient que les siennes'
);

select is(
  pg_temp.sous('d0000000-0000-0000-0000-0000000000b2',
               'select jsonb_array_length(mes_donnees_personnelles() -> ''paiements'')::text'),
  '0',
  'art. 15 — Bob ne voit pas le paiement d''Alice'
);

select is(
  pg_temp.sous('d0000000-0000-0000-0000-0000000000b1',
               'select jsonb_array_length(mes_donnees_personnelles() -> ''paiements'')::text'),
  '1',
  'art. 20 — le paiement d''Alice figure bien dans son export'
);

select throws_ok(
  $$select mes_donnees_personnelles()$$,
  null, null,
  'art. 15 — sans session, l''export est refusé'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RECTIFICATION — art. 16
-- ─────────────────────────────────────────────────────────────────────────────

select lives_ok(
  $$select pg_temp.sous('d0000000-0000-0000-0000-0000000000b1',
      'select (corriger_mon_identite(''Alix'', ''Martin''))::text')$$,
  'art. 16 — la personne rectifie son identité elle-même'
);

select is(
  (select prenom from public.profils where id_profil = 'd0000000-0000-0000-0000-0000000000b1'),
  'Alix',
  'art. 16 — la rectification est enregistrée'
);

select is(
  (select prenom from public.profils where id_profil = 'd0000000-0000-0000-0000-0000000000b2'),
  'Bob',
  'art. 16 — et ne touche personne d''autre'
);

-- Corriger sa propre identité n'est pas une action d'administration : la
-- journaliser reviendrait à constituer un historique des identités successives
-- dont personne n'a besoin.
-- Assertion bornée à la personne concernée, et non à la table entière : un
-- test qui compte tout dépendrait de ce que d'autres tests y ont laissé.
select is(
  (select count(*) from public.journal_admin
    where id_profil_cible = 'd0000000-0000-0000-0000-0000000000b1'
      and action = 'correction_identite'),
  0::bigint,
  'art. 5.1.c — la rectification par soi-même n''est pas journalisée'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- EFFACEMENT — art. 17 : ce qui part, et ce qui reste
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  public.anonymiser_journal_personne(
    'd0000000-0000-0000-0000-0000000000b1', 'alice@essai.local'),
  1,
  'art. 17 — l''anonymisation touche la seule entrée concernée'
);

select is(
  (select count(*) from public.journal_admin
    where cible = 'alice@essai.local' or meta ? 'prenom' and meta ->> 'prenom' = 'Alice'),
  0::bigint,
  'art. 17 — plus aucune trace en clair d''Alice dans le journal'
);

-- Le pendant indispensable : la PREUVE de l'action doit survivre, sans quoi on
-- aurait remplacé un problème de conformité par un trou dans la piste d'audit.
select is(
  (select count(*) from public.journal_admin
    where id_profil_cible = 'd0000000-0000-0000-0000-0000000000b1'
      and action = 'changement_role'),
  1::bigint,
  'art. 17 — mais l''action reste tracée par son identifiant technique'
);

select is(
  (select cible from public.journal_admin
    where id_profil_cible = 'd0000000-0000-0000-0000-0000000000b2'),
  'bob@essai.local',
  'art. 17 — l''anonymisation d''une personne n''emporte pas les autres'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONSERVATION — art. 5.1.e
-- ─────────────────────────────────────────────────────────────────────────────

-- Onze ans : au-delà de l'obligation comptable de dix ans.
update public.paiements set date_paiement = now() - interval '11 years'
 where id_paiement = '9b000000-0000-0000-0000-00000000000e';
select public.appliquer_retention_paiements(10);

select is(
  (select count(*) from public.paiements
    where id_paiement = '9b000000-0000-0000-0000-00000000000e'),
  1::bigint,
  'art. L123-22 — la ligne de paiement est CONSERVÉE : c''est une pièce comptable'
);

select is(
  (select email from public.paiements
    where id_paiement = '9b000000-0000-0000-0000-00000000000e'),
  null,
  'art. 5.1.e — mais l''e-mail en est retiré, l''obligation comptable étant éteinte'
);

select * from finish();
rollback;
