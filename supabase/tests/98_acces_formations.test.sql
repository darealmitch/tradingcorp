-- Donner ou retirer l'accès à une formation, à la main (demande du 11/10/2026).
--
-- Ce qui compte : que seul un administrateur ouvre ou ferme un accès ; que
-- l'élève voie le contenu dès l'ouverture, et plus du tout après le retrait ;
-- que retirer n'efface rien — la progression reste, l'accès se rend tel quel ;
-- et que chaque geste laisse une trace, une seule.

begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('98000000-0000-0000-0000-0000000000a1', 'ana-acces@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1994-02-02"}'::jsonb),
  ('98000000-0000-0000-0000-0000000000b2', 'bea-acces@essai.local',
   '{"prenom":"Bea","nom":"Acheteuse","date_naissance":"1991-03-03"}'::jsonb),
  ('98000000-0000-0000-0000-0000000000f3', 'fio-acces@essai.local',
   '{"prenom":"Fio","nom":"Formatrice","date_naissance":"1985-05-05"}'::jsonb),
  ('98000000-0000-0000-0000-0000000000ad', 'ada-acces@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set role = 'formateur'
 where id_profil = '98000000-0000-0000-0000-0000000000f3';
update public.profils set role = 'admin'
 where id_profil = '98000000-0000-0000-0000-0000000000ad';

insert into public.formations (id_formation, titre, slug, est_publiee) values
  ('f9800000-0000-0000-0000-000000000001', 'Formation d''essai 98', 'essai-98', true);
insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('59800000-0000-0000-0000-000000000001', 'f9800000-0000-0000-0000-000000000001',
   'Module 1', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee) values
  ('19800000-0000-0000-0000-000000000001', '59800000-0000-0000-0000-000000000001',
   'Leçon 1', 1, true);

-- Bea a payé : son inscription vient d'un achat.
insert into public.inscriptions (id_profil, id_formation, source) values
  ('98000000-0000-0000-0000-0000000000b2', 'f9800000-0000-0000-0000-000000000001', 'paiement');

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
-- LES DROITS — un administrateur, et lui seul
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon',
    'public.definir_acces_formation(uuid, uuid, boolean)', 'execute'),
  'droits — un visiteur n''appelle pas la fonction'
);

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000a1',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000a1',
        'f9800000-0000-0000-0000-000000000001', true)$$),
  'P0001',
  'droits — une élève ne s''ouvre pas l''accès elle-même'
);

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000f3',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000a1',
        'f9800000-0000-0000-0000-000000000001', true)$$),
  'P0001',
  'droits — une formatrice ne donne pas l''accès'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'OUVERTURE — l'élève entre aussitôt, sans faux achat
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000a1',
        'f9800000-0000-0000-0000-000000000001', true)$$),
  null::text,
  'ouverture — l''administratrice ouvre l''accès d''une élève sans inscription'
);

select is(
  (select statut || ' / ' || source from public.inscriptions
    where id_profil = '98000000-0000-0000-0000-0000000000a1'
      and id_formation = 'f9800000-0000-0000-0000-000000000001'),
  'active / manuel',
  'ouverture — l''inscription est active, d''origine manuelle'
);

select is(
  pg_temp.sous('98000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.lecons
       where id_lecon = '19800000-0000-0000-0000-000000000001'$$),
  '1',
  'ouverture — l''élève voit la leçon dès maintenant'
);

select is(
  (select count(*)::int from public.notifications n
     join public.inscriptions i on n.cle_evenement = 'achat:' || i.id_inscription
    where i.id_profil = '98000000-0000-0000-0000-0000000000a1'),
  0,
  'ouverture — aucun faux « Nouvel achat » n''est annoncé à l''équipe'
);

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000a1',
        'f9800000-0000-0000-0000-000000000001', true)$$),
  null::text,
  'ouverture — rouvrir un accès déjà ouvert ne fait rien'
);

select is(
  (select count(*)::int from public.journal_admin
    where action = 'octroi_acces'
      and id_profil_cible = '98000000-0000-0000-0000-0000000000a1'),
  1,
  'journal — l''ouverture est tracée une fois, même demandée deux fois'
);

select is(
  (select (meta ->> 'formation') || ' / ' || (meta ->> 'avant') || ' / '
          || (id_profil = '98000000-0000-0000-0000-0000000000ad')::text
     from public.journal_admin
    where action = 'octroi_acces'
      and id_profil_cible = '98000000-0000-0000-0000-0000000000a1'),
  'Formation d''essai 98 / aucune / true',
  'journal — la trace dit quelle formation, l''état d''avant et qui a agi'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LE RETRAIT — le contenu se ferme, la progression reste
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.progression_lecons (id_profil, id_lecon, terminee_le) values
  ('98000000-0000-0000-0000-0000000000a1', '19800000-0000-0000-0000-000000000001', now());

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000a1',
        'f9800000-0000-0000-0000-000000000001', false)$$),
  null::text,
  'retrait — l''administratrice retire l''accès'
);

select is(
  pg_temp.sous('98000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.lecons
       where id_lecon = '19800000-0000-0000-0000-000000000001'$$),
  '0',
  'retrait — l''élève ne voit plus la leçon'
);

select is(
  (select count(*)::int from public.progression_lecons
    where id_profil = '98000000-0000-0000-0000-0000000000a1'),
  1,
  'retrait — sa progression est conservée'
);

select is(
  (select meta ->> 'avant' from public.journal_admin
    where action = 'retrait_acces'
      and id_profil_cible = '98000000-0000-0000-0000-0000000000a1'),
  'active',
  'journal — le retrait est tracé, avec l''état d''avant'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LE RÉTABLISSEMENT — la même inscription, telle qu'elle était
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000a1',
        'f9800000-0000-0000-0000-000000000001', true)$$),
  null::text,
  'rétablissement — l''accès se rend'
);

select is(
  (select count(*)::text || ' / ' || min(statut) from public.inscriptions
    where id_profil = '98000000-0000-0000-0000-0000000000a1'
      and id_formation = 'f9800000-0000-0000-0000-000000000001'),
  '1 / active',
  'rétablissement — la même inscription est réactivée, sans doublon'
);

select is(
  pg_temp.sous('98000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.lecons
       where id_lecon = '19800000-0000-0000-0000-000000000001'$$),
  '1',
  'rétablissement — l''élève retrouve la leçon'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ACHAT — un accès payé se retire aussi, sans réécrire son origine
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000b2',
        'f9800000-0000-0000-0000-000000000001', false)$$),
  null::text,
  'achat — l''accès d''une élève qui a payé se retire aussi'
);

select is(
  (select statut || ' / ' || source from public.inscriptions
    where id_profil = '98000000-0000-0000-0000-0000000000b2'
      and id_formation = 'f9800000-0000-0000-0000-000000000001'),
  'revoquee / paiement',
  'achat — son inscription garde son origine : l''historique reste exact'
);

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000b2',
        'f9800000-0000-0000-0000-000000000001', false)$$),
  null::text,
  'achat — refermer un accès déjà fermé ne fait rien'
);

select is(
  (select count(*)::int from public.journal_admin
    where action = 'retrait_acces'
      and id_profil_cible = '98000000-0000-0000-0000-0000000000b2'),
  1,
  'journal — un geste sans effet n''écrit rien'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LES REFUS — le personnel, les comptes et formations qui n'existent pas
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000f3',
        'f9800000-0000-0000-0000-000000000001', true)$$),
  'P0001',
  'personnel — pas d''accès à donner à une formatrice : elle voit déjà tout'
);

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000ff',
        'f9800000-0000-0000-0000-000000000001', true)$$),
  'P0001',
  'refus — un compte qui n''existe pas'
);

select is(
  pg_temp.erreur_sous('98000000-0000-0000-0000-0000000000ad',
    $$select public.definir_acces_formation('98000000-0000-0000-0000-0000000000a1',
        'f9800000-0000-0000-0000-0000000000ff', true)$$),
  'P0001',
  'refus — une formation qui n''existe pas'
);

select * from finish();
rollback;
