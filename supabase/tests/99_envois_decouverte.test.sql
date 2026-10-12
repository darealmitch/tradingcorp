-- Envois de l'accès découverte : bienvenue et annonces (demande du 12/10/2026).
--
-- Ce qui compte : que l'accord aux nouveautés ne soit jamais donné d'office,
-- et se retire d'un clic, sans connexion ; que la bienvenue ne parte qu'une
-- fois, aux seuls comptes sans achat, et seulement s'il y a des leçons
-- offertes ; que l'annonce soit réservée aux administrateurs, touche les
-- comptes sans achat dans leur espace, mais ne parte par e-mail qu'avec leur
-- accord ; et que la fonction d'envoi sache quel e-mail elle écrit.
--
-- Les assertions portent sur les comptes du jeu d'essai, jamais sur des
-- totaux : rejoué contre la vraie base, l'annonce viserait aussi les vrais
-- comptes, avant que tout soit annulé.

begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b9000000-0000-0000-0000-0000000000a1', 'lea-envois@essai.local',
   '{"prenom":"Lea","nom":"Curieuse","date_naissance":"1996-06-06"}'::jsonb),
  ('b9000000-0000-0000-0000-0000000000a2', 'noe-envois@essai.local',
   '{"prenom":"Noe","nom":"Abonne","date_naissance":"1994-04-04","accepte_nouveautes":true}'::jsonb),
  ('b9000000-0000-0000-0000-0000000000b3', 'bea-envois@essai.local',
   '{"prenom":"Bea","nom":"Inscrite","date_naissance":"1991-03-03"}'::jsonb),
  ('b9000000-0000-0000-0000-0000000000e4', 'tess-envois@essai.local',
   '{"prenom":"Tess","nom":"Test","date_naissance":"1990-01-01"}'::jsonb),
  ('b9000000-0000-0000-0000-0000000000ad', 'ada-envois@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set est_test = true
 where id_profil = 'b9000000-0000-0000-0000-0000000000e4';
update public.profils set role = 'admin'
 where id_profil = 'b9000000-0000-0000-0000-0000000000ad';

-- Prix nul : la formation la moins chère est celle que montre la vitrine.
insert into public.formations (id_formation, titre, slug, est_publiee, prix_centimes) values
  ('fb900000-0000-0000-0000-000000000001', 'Formation d''essai envois', 'essai-envois', true, 0);
insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('5b900000-0000-0000-0000-000000000001', 'fb900000-0000-0000-0000-000000000001',
   'Module 1', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type) values
  ('1b900000-0000-0000-0000-000000000000', '5b900000-0000-0000-0000-000000000001',
   'Présentation', 0, true, 'intro'),
  ('1b900000-0000-0000-0000-00000000000a', '5b900000-0000-0000-0000-000000000001',
   'Vidéo A', 1, true, 'video'),
  ('1b900000-0000-0000-0000-00000000000b', '5b900000-0000-0000-0000-000000000001',
   'Vidéo B', 2, true, 'video');

insert into public.inscriptions (id_profil, id_formation, source) values
  ('b9000000-0000-0000-0000-0000000000b3', 'fb900000-0000-0000-0000-000000000001', 'paiement');

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

-- Rend le résultat de la requête, exécutée par un visiteur non connecté.
create function pg_temp.anonyme(p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  execute p_sql into r;
  execute 'reset role';
  return r;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ACCORD — jamais d'office, retiré d'un clic
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  has_function_privilege('anon', 'public.desinscrire_nouveautes(uuid)', 'execute'),
  'accord — le lien de désinscription marche sans connexion'
);

select ok(
  not has_function_privilege('anon', 'public.definir_mes_nouveautes(boolean)', 'execute'),
  'accord — un visiteur ne règle l''accord de personne'
);

select ok(
  (select accepte_nouveautes and nouveautes_reglees_le is not null from public.profils
    where id_profil = 'b9000000-0000-0000-0000-0000000000a2'),
  'accord — la case cochée à l''inscription est enregistrée, et datée'
);

select ok(
  (select not accepte_nouveautes and nouveautes_reglees_le is null from public.profils
    where id_profil = 'b9000000-0000-0000-0000-0000000000a1'),
  'accord — sans case cochée, aucun accord'
);

select is(
  pg_temp.erreur_sous('b9000000-0000-0000-0000-0000000000a1',
    $$select public.definir_mes_nouveautes(true)$$),
  null::text,
  'accord — Lea l''accorde depuis son profil'
);

select ok(
  (select accepte_nouveautes from public.profils
    where id_profil = 'b9000000-0000-0000-0000-0000000000a1'),
  'accord — son accord est enregistré'
);

select is(
  pg_temp.erreur_sous('b9000000-0000-0000-0000-0000000000a1',
    $$select public.definir_mes_nouveautes(false)$$),
  null::text,
  'accord — puis elle le retire'
);

select ok(
  (select not accepte_nouveautes and nouveautes_reglees_le is not null from public.profils
    where id_profil = 'b9000000-0000-0000-0000-0000000000a1'),
  'accord — le retrait est enregistré, la date du choix gardée en preuve'
);

select is(
  pg_temp.anonyme(
    format('select public.desinscrire_nouveautes(%L)::text',
      (select jeton_nouveautes from public.profils
        where id_profil = 'b9000000-0000-0000-0000-0000000000a2'))),
  'true',
  'désinscription — le jeton de Noe est reconnu'
);

select ok(
  (select not accepte_nouveautes from public.profils
    where id_profil = 'b9000000-0000-0000-0000-0000000000a2'),
  'désinscription — Noe ne reçoit plus les nouveautés'
);

select is(
  pg_temp.anonyme(
    $$select public.desinscrire_nouveautes('00000000-0000-0000-0000-000000000000')::text$$),
  'false',
  'désinscription — un jeton inconnu ne désinscrit personne'
);

-- Noe redonne son accord : il sert aux annonces plus bas.
update public.profils set accepte_nouveautes = true, nouveautes_reglees_le = now()
 where id_profil = 'b9000000-0000-0000-0000-0000000000a2';

-- ─────────────────────────────────────────────────────────────────────────────
-- LA BIENVENUE — une fois, aux comptes sans achat, s'il y a une offre
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('b9000000-0000-0000-0000-0000000000a1',
    $$select public.accueillir_en_decouverte()::text$$),
  'false',
  'bienvenue — rien tant qu''aucune leçon n''est offerte'
);

update public.lecons set est_decouverte = true
 where id_lecon = '1b900000-0000-0000-0000-00000000000a';

select is(
  pg_temp.sous('b9000000-0000-0000-0000-0000000000a1',
    $$select public.accueillir_en_decouverte()::text$$),
  'true',
  'bienvenue — Lea, sans achat, est accueillie'
);

select is(
  (select titre || ' | ' || lien from public.notifications
    where id_profil = 'b9000000-0000-0000-0000-0000000000a1'
      and cle_evenement = 'decouverte_accueil'),
  'Tes leçons offertes t''attendent | /parcours',
  'bienvenue — la notification mène au parcours'
);

select is(
  pg_temp.sous('b9000000-0000-0000-0000-0000000000a1',
    $$select public.accueillir_en_decouverte()::text$$),
  'false',
  'bienvenue — une seule fois'
);

select is(
  (select count(*)::int from public.courriels c
     join public.notifications n on n.id_notification = c.id_notification
    where n.id_profil = 'b9000000-0000-0000-0000-0000000000a1'
      and n.cle_evenement = 'decouverte_accueil'),
  1,
  'bienvenue — doublée d''un e-mail, message de service sans accord requis'
);

select is(
  concat_ws(',',
    pg_temp.sous('b9000000-0000-0000-0000-0000000000b3',
      $$select public.accueillir_en_decouverte()::text$$),
    pg_temp.sous('b9000000-0000-0000-0000-0000000000e4',
      $$select public.accueillir_en_decouverte()::text$$),
    pg_temp.sous('b9000000-0000-0000-0000-0000000000ad',
      $$select public.accueillir_en_decouverte()::text$$)),
  'false,false,false',
  'bienvenue — ni l''inscrite, ni le compte de test, ni l''administratrice'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ANNONCE — un administrateur ; l'e-mail seulement avec l'accord
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('b9000000-0000-0000-0000-0000000000a1',
    $$select public.annoncer_lecons_offertes(false)$$),
  'P0001',
  'annonce — une élève n''annonce rien'
);

select is(
  pg_temp.erreur_sous('b9000000-0000-0000-0000-0000000000ad',
    $$select public.annoncer_lecons_offertes(true)$$),
  null::text,
  'annonce — l''administratrice envoie un essai'
);

select is(
  (select string_agg(p.prenom || ':' || (
            select count(*) from public.notifications n
             where n.id_profil = p.id_profil
               and n.cle_evenement like 'decouverte_annonce:essai:%'), ',' order by p.prenom)
     from public.profils p
    where p.id_profil in ('b9000000-0000-0000-0000-0000000000a1',
                          'b9000000-0000-0000-0000-0000000000e4')),
  'Lea:0,Tess:1',
  'annonce — l''essai ne touche que le compte de test'
);

select is(
  (select count(*)::int from public.courriels c
     join public.notifications n on n.id_notification = c.id_notification
    where n.id_profil = 'b9000000-0000-0000-0000-0000000000e4'
      and n.cle_evenement like 'decouverte_annonce:essai:%'),
  1,
  'annonce — l''essai part aussi par e-mail au compte de test'
);

select is(
  pg_temp.erreur_sous('b9000000-0000-0000-0000-0000000000ad',
    $$select public.annoncer_lecons_offertes(false)$$),
  null::text,
  'annonce — l''administratrice prévient les comptes sans achat'
);

select is(
  (select string_agg(p.prenom || ':' || (
            select count(*) from public.notifications n
             where n.id_profil = p.id_profil
               and n.cle_evenement like 'decouverte_annonce:%'
               and n.cle_evenement not like 'decouverte_annonce:essai:%'), ',' order by p.prenom)
     from public.profils p
    where p.id_profil in ('b9000000-0000-0000-0000-0000000000a1',
                          'b9000000-0000-0000-0000-0000000000a2',
                          'b9000000-0000-0000-0000-0000000000b3',
                          'b9000000-0000-0000-0000-0000000000e4')),
  'Bea:0,Lea:1,Noe:1,Tess:0',
  'annonce — dans l''espace des comptes sans achat, pas de l''inscrite ni du compte de test'
);

select is(
  (select string_agg(p.prenom || ':' || (
            select count(*) from public.courriels c
              join public.notifications n on n.id_notification = c.id_notification
             where n.id_profil = p.id_profil
               and n.cle_evenement like 'decouverte_annonce:%'
               and n.cle_evenement not like 'decouverte_annonce:essai:%'), ',' order by p.prenom)
     from public.profils p
    where p.id_profil in ('b9000000-0000-0000-0000-0000000000a1',
                          'b9000000-0000-0000-0000-0000000000a2')),
  'Lea:0,Noe:1',
  'annonce — par e-mail, seulement à qui l''a accepté'
);

select is(
  pg_temp.erreur_sous('b9000000-0000-0000-0000-0000000000ad',
    $$select public.annoncer_lecons_offertes(false)$$),
  null::text,
  'annonce — relancer la même sélection réussit'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = 'b9000000-0000-0000-0000-0000000000a1'
      and cle_evenement like 'decouverte_annonce:%'),
  1,
  'annonce — mais ne repart pas : Lea n''a toujours qu''une annonce'
);

select is(
  (select count(*)::int || ' / ' || bool_and(meta ? 'par_courriel')::text
     from public.journal_admin
    where action = 'annonce_decouverte'
      and id_profil = 'b9000000-0000-0000-0000-0000000000ad'),
  '2 / true',
  'journal — chaque envoi réel est tracé, l''essai ne l''est pas'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA FONCTION D'ENVOI — elle sait quel e-mail elle écrit
-- ─────────────────────────────────────────────────────────────────────────────

-- Noe : son e-mail d'annonce passe « à envoyer » (comme en mode actif), puis
-- il se désinscrit avant le passage de la fonction d'envoi.
update public.courriels c set statut = 'a_envoyer'
  from public.notifications n
 where n.id_notification = c.id_notification
   and n.id_profil = 'b9000000-0000-0000-0000-0000000000a2'
   and n.cle_evenement like 'decouverte_annonce:%';
update public.profils set accepte_nouveautes = false
 where id_profil = 'b9000000-0000-0000-0000-0000000000a2';

create temporary table reserves_essai as
  select * from public.reserver_courriels(50);

select is(
  (select famille || ' / ' || (jeton = (select jeton_nouveautes::text from public.profils
                                         where id_profil = 'b9000000-0000-0000-0000-0000000000e4'))::text
     from reserves_essai
    where destinataire = 'tess-envois@essai.local'),
  'decouverte_annonce / true',
  'envoi — l''annonce du compte de test porte sa famille et son jeton de désinscription'
);

select is(
  (select string_agg(distinct c.statut, ',') from public.courriels c
     join public.notifications n on n.id_notification = c.id_notification
    where n.id_profil = 'b9000000-0000-0000-0000-0000000000a2'
      and n.cle_evenement like 'decouverte_annonce:%'),
  'ecarte',
  'envoi — l''accord retiré entre-temps, l''annonce de Noe ne part pas'
);

select * from finish();
rollback;
