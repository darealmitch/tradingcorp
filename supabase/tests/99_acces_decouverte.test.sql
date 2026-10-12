-- Accès découverte : quelques leçons offertes aux comptes sans achat
-- (demande du 12/10/2026).
--
-- Ce qui compte : que seul un administrateur choisisse ce qui est offert ;
-- qu'un compte sans inscription ouvre ces leçons, et elles seules ; que
-- l'élève inscrit garde l'ordre imposé des étapes ; que rien ne change tant
-- qu'aucune leçon n'est cochée ; et que chaque choix laisse une trace.

begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email, raw_user_meta_data) values
  ('99000000-0000-0000-0000-0000000000a1', 'lea-decouverte@essai.local',
   '{"prenom":"Lea","nom":"Curieuse","date_naissance":"1996-06-06"}'::jsonb),
  ('99000000-0000-0000-0000-0000000000b2', 'bea-decouverte@essai.local',
   '{"prenom":"Bea","nom":"Inscrite","date_naissance":"1991-03-03"}'::jsonb),
  ('99000000-0000-0000-0000-0000000000f3', 'fio-decouverte@essai.local',
   '{"prenom":"Fio","nom":"Formatrice","date_naissance":"1985-05-05"}'::jsonb),
  ('99000000-0000-0000-0000-0000000000ad', 'ada-decouverte@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set role = 'formateur'
 where id_profil = '99000000-0000-0000-0000-0000000000f3';
update public.profils set role = 'admin'
 where id_profil = '99000000-0000-0000-0000-0000000000ad';

insert into public.formations (id_formation, titre, slug, est_publiee) values
  ('f9900000-0000-0000-0000-000000000001', 'Formation d''essai 99', 'essai-99', true);
insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('59900000-0000-0000-0000-000000000001', 'f9900000-0000-0000-0000-000000000001',
   'Module 1', 1, true),
  ('59900000-0000-0000-0000-000000000002', 'f9900000-0000-0000-0000-000000000001',
   'Module 2', 2, true);
-- Module 1 : introduction, vidéo A (qui sera offerte), vidéo B, quiz.
-- Module 2 : une vidéo, jamais offerte.
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type) values
  ('19900000-0000-0000-0000-000000000000', '59900000-0000-0000-0000-000000000001',
   'Présentation', 0, true, 'intro'),
  ('19900000-0000-0000-0000-00000000000a', '59900000-0000-0000-0000-000000000001',
   'Vidéo A', 1, true, 'video'),
  ('19900000-0000-0000-0000-00000000000b', '59900000-0000-0000-0000-000000000001',
   'Vidéo B', 2, true, 'video'),
  ('19900000-0000-0000-0000-00000000000c', '59900000-0000-0000-0000-000000000001',
   'Quiz', 3, true, 'quiz'),
  ('19900000-0000-0000-0000-0000000000d1', '59900000-0000-0000-0000-000000000002',
   'Vidéo du module 2', 1, true, 'video');

-- Bea a acheté la formation ; Lea n'a qu'un compte.
insert into public.inscriptions (id_profil, id_formation, source) values
  ('99000000-0000-0000-0000-0000000000b2', 'f9900000-0000-0000-0000-000000000001', 'paiement');

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
    'public.definir_lecon_decouverte(uuid, boolean)', 'execute'),
  'droits — un visiteur n''appelle pas la fonction'
);

-- Les formateurs modifient les leçons : la case, elle, leur reste fermée.
select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000f3',
    $$update public.lecons set est_decouverte = true
       where id_lecon = '19900000-0000-0000-0000-00000000000a'$$),
  'P0001',
  'droits — une formatrice ne coche pas la case en modifiant la leçon'
);

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000a1',
    $$select public.definir_lecon_decouverte('19900000-0000-0000-0000-00000000000a', true)$$),
  'P0001',
  'droits — une élève ne s''offre pas une leçon'
);

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000f3',
    $$select public.definir_lecon_decouverte('19900000-0000-0000-0000-00000000000a', true)$$),
  'P0001',
  'droits — une formatrice n''offre pas de leçon'
);

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000ad',
    $$select public.definir_lecon_decouverte('19900000-0000-0000-0000-00000000000c', true)$$),
  'P0001',
  'droits — un quiz ne s''offre pas'
);

select throws_ok(
  $$update public.lecons set est_decouverte = true
     where id_lecon = '19900000-0000-0000-0000-00000000000c'$$,
  '23514',
  null,
  'droits — la base refuse elle-même un quiz offert'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AVANT TOUT CHOIX — rien ne change
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.lecons l
       join public.sections s on s.id_section = l.id_section
      where s.id_formation = 'f9900000-0000-0000-0000-000000000001'$$),
  '0',
  'inerte — sans leçon cochée, un compte sans achat ne lit aucune leçon'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select string_agg(etat || ':' || lecons_offertes, ',' order by position)
        from public.etats_modules('f9900000-0000-0000-0000-000000000001')$$),
  'verrouille:0,verrouille:0',
  'inerte — tous les modules restent verrouillés'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'OFFRE — l'administratrice coche la vidéo A
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000ad',
    $$select public.definir_lecon_decouverte('19900000-0000-0000-0000-00000000000a', true)$$),
  null::text,
  'offre — l''administratrice offre la vidéo A'
);

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000ad',
    $$select public.definir_lecon_decouverte('19900000-0000-0000-0000-00000000000a', true)$$),
  null::text,
  'offre — la cocher une seconde fois ne fait rien'
);

select is(
  (select count(*)::int || ' / ' || min(meta ->> 'module') || ' / '
          || bool_and(id_profil = '99000000-0000-0000-0000-0000000000ad')::text
     from public.journal_admin
    where action = 'decouverte_ajoutee'
      and meta ->> 'id_lecon' = '19900000-0000-0000-0000-00000000000a'),
  '1 / Module 1 / true',
  'journal — l''offre est tracée une fois, avec le module et son auteur'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LE COMPTE SANS ACHAT — la leçon offerte, et elle seule
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select string_agg(titre, ', ' order by position) from public.lecons
       where id_section = '59900000-0000-0000-0000-000000000001'$$),
  'Présentation, Vidéo A',
  'découverte — Lea lit l''introduction et la vidéo offerte, pas la suite'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select string_agg(etat || ':' || offerte, ',' order by position)
        from public.etats_lecons('59900000-0000-0000-0000-000000000001')$$),
  'debloque:true,debloque:true,verrouille:false,verrouille:false',
  'découverte — les états marquent ce qui est offert et verrouillent le reste'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select string_agg(etat || ':' || lecons_offertes, ',' order by position)
        from public.etats_modules('f9900000-0000-0000-0000-000000000001')$$),
  'debloque:1,verrouille:0',
  'découverte — le module qui contient l''offre s''ouvre, pas l''autre'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text
        from public.lecon_contenu('19900000-0000-0000-0000-00000000000a')$$),
  '1',
  'découverte — le contenu de la vidéo offerte est servi'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text
        from public.lecon_contenu('19900000-0000-0000-0000-00000000000b')$$),
  '0',
  'découverte — le contenu de la vidéo B ne l''est pas'
);

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000a1',
    $$select public.terminer_lecon('19900000-0000-0000-0000-000000000000')$$),
  null::text,
  'découverte — Lea valide l''introduction pour entrer dans le module'
);

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000a1',
    $$insert into public.commentaires (id_profil, id_lecon, contenu)
      values ('99000000-0000-0000-0000-0000000000a1',
              '19900000-0000-0000-0000-00000000000a', 'Bonjour')$$),
  '42501',
  'découverte — les échanges restent réservés aux inscrits'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ÉLÈVE INSCRITE — l'ordre imposé ne change pas
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000b2',
    $$select string_agg(etat || ':' || offerte, ',' order by position)
        from public.etats_lecons('59900000-0000-0000-0000-000000000001')$$),
  'debloque:false,verrouille:false,verrouille:false,verrouille:false',
  'inscrite — la vidéo offerte ne court-circuite pas l''introduction'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000b2',
    $$select string_agg(etat || ':' || lecons_offertes, ',' order by position)
        from public.etats_modules('f9900000-0000-0000-0000-000000000001')$$),
  'debloque:0,verrouille:0',
  'inscrite — ses modules suivent l''ordre habituel, sans compteur d''offre'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000f3',
    $$select bool_or(offerte)::text
        from public.etats_lecons('59900000-0000-0000-0000-000000000001')$$),
  'false',
  'équipe — la formatrice voit tout par son rôle, rien ne lui est « offert »'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UNE FORMATION RETIRÉE DU CATALOGUE n'offre plus rien
-- ─────────────────────────────────────────────────────────────────────────────

update public.formations set est_publiee = false
 where id_formation = 'f9900000-0000-0000-0000-000000000001';

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.lecons
       where id_lecon = '19900000-0000-0000-0000-00000000000a'$$),
  '0',
  'catalogue — formation dépubliée, la leçon offerte se ferme'
);

update public.formations set est_publiee = true
 where id_formation = 'f9900000-0000-0000-0000-000000000001';

-- ─────────────────────────────────────────────────────────────────────────────
-- LE RETRAIT — décocher referme la leçon
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('99000000-0000-0000-0000-0000000000ad',
    $$select public.definir_lecon_decouverte('19900000-0000-0000-0000-00000000000a', false)$$),
  null::text,
  'retrait — l''administratrice retire l''offre'
);

select is(
  pg_temp.sous('99000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.lecons l
       join public.sections s on s.id_section = l.id_section
      where s.id_formation = 'f9900000-0000-0000-0000-000000000001'$$),
  '0',
  'retrait — Lea ne lit plus rien, introduction comprise'
);

select is(
  (select count(*)::int from public.progression_lecons
    where id_profil = '99000000-0000-0000-0000-0000000000a1'),
  1,
  'retrait — sa progression est conservée, elle la retrouvera après l''achat'
);

select is(
  (select count(*)::int from public.journal_admin
    where action = 'decouverte_retiree'
      and meta ->> 'id_lecon' = '19900000-0000-0000-0000-00000000000a'),
  1,
  'journal — le retrait est tracé'
);

select * from finish();
rollback;
