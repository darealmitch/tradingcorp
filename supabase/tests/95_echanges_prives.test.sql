-- Échanges privés, modération et droits de chaque rôle sur les commentaires.
--
-- Quatre personnes jouent chaque règle, dans les deux sens : Ana, élève
-- auteure du fil ; Bea, autre élève inscrite ; Fio, formatrice ; Ada,
-- administratrice. Un message privé qui fuit ne casse aucun écran — un autre
-- élève le lit, simplement. Seuls ces tests le verraient.

begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai : deux élèves inscrites, une formatrice, une administratrice,
-- deux leçons.
--   p1 — message d'Ana, publié              r1 — réponse de Bea sous p1, publiée
--   p2 — message d'Ana, en attente          r2 — réponse publique de l'équipe sous p1
--   p3 — message de Bea, publié             p5 — message d'Ana, en attente
--   p4 — message de Bea, en attente, seul dans la seconde leçon
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('95000000-0000-0000-0000-0000000000a1', 'ana-echanges@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1994-02-02"}'::jsonb),
  ('95000000-0000-0000-0000-0000000000b2', 'bea-echanges@essai.local',
   '{"prenom":"Bea","nom":"Camarade","date_naissance":"1993-03-03"}'::jsonb),
  ('95000000-0000-0000-0000-0000000000f3', 'fio-echanges@essai.local',
   '{"prenom":"Fio","nom":"Formatrice","date_naissance":"1985-05-05"}'::jsonb),
  ('95000000-0000-0000-0000-0000000000ad', 'ada-echanges@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);

update public.profils set role = 'formateur'
 where id_profil = '95000000-0000-0000-0000-0000000000f3';
update public.profils set role = 'admin'
 where id_profil = '95000000-0000-0000-0000-0000000000ad';

insert into public.formations (id_formation, titre, slug, est_publiee)
values ('f9500000-0000-0000-0000-00000000000f', 'Formation échanges', 'essai-echanges', true);
insert into public.sections (id_section, id_formation, titre, position, est_publiee)
values ('59500000-0000-0000-0000-000000000005', 'f9500000-0000-0000-0000-00000000000f', 'Module', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee) values
  ('19500000-0000-0000-0000-000000000001', '59500000-0000-0000-0000-000000000005', 'Leçon commentée', 1, true),
  ('19500000-0000-0000-0000-000000000002', '59500000-0000-0000-0000-000000000005', 'Leçon calme', 2, true);
insert into public.inscriptions (id_profil, id_formation) values
  ('95000000-0000-0000-0000-0000000000a1', 'f9500000-0000-0000-0000-00000000000f'),
  ('95000000-0000-0000-0000-0000000000b2', 'f9500000-0000-0000-0000-00000000000f');

insert into public.commentaires (id_commentaire, id_profil, id_lecon, id_parent, contenu, statut, par_equipe) values
  ('c9500000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-0000000000a1',
   '19500000-0000-0000-0000-000000000001', null, 'Question publique d''Ana', 'approuve', false),
  ('c9500000-0000-0000-0000-000000000002', '95000000-0000-0000-0000-0000000000a1',
   '19500000-0000-0000-0000-000000000001', null, 'Question personnelle d''Ana', 'en_attente', false),
  ('c9500000-0000-0000-0000-000000000003', '95000000-0000-0000-0000-0000000000b2',
   '19500000-0000-0000-0000-000000000001', null, 'Question de Bea', 'approuve', false),
  ('c9500000-0000-0000-0000-000000000004', '95000000-0000-0000-0000-0000000000b2',
   '19500000-0000-0000-0000-000000000002', null, 'Message en attente ailleurs', 'en_attente', false),
  ('c9500000-0000-0000-0000-000000000005', '95000000-0000-0000-0000-0000000000a1',
   '19500000-0000-0000-0000-000000000001', null, 'Message à corriger', 'en_attente', false),
  ('c9500000-0000-0000-0000-000000000011', '95000000-0000-0000-0000-0000000000b2',
   '19500000-0000-0000-0000-000000000001', 'c9500000-0000-0000-0000-000000000001', 'Réponse de Bea', 'approuve', false),
  ('c9500000-0000-0000-0000-000000000012', '95000000-0000-0000-0000-0000000000ad',
   '19500000-0000-0000-0000-000000000001', 'c9500000-0000-0000-0000-000000000001', 'Réponse publique de l''équipe', 'approuve', true);

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
-- L'ÉCHANGE PRIVÉ DANS UN FIL PUBLIC — l'élève concerné le poursuit, seul
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.repondre_en_equipe('c9500000-0000-0000-0000-000000000001', 'Réponse privée de Fio', true)$$),
  null::text,
  'échanges — la formatrice répond en privé sous un message publié'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.commentaires
       where id_parent = 'c9500000-0000-0000-0000-000000000001' and est_prive$$),
  '1',
  'échanges — l''élève lit la réponse privée de l''équipe'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000b2',
    $$select count(*)::text from public.commentaires
       where id_parent = 'c9500000-0000-0000-0000-000000000001' and est_prive$$),
  '0',
  'échanges — une autre élève ne la voit pas'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000a1',
    $$select public.repondre_en_prive('c9500000-0000-0000-0000-000000000001', 'Merci, et une précision')$$),
  null::text,
  'échanges — l''élève poursuit l''échange en privé'
);

select is(
  (select statut = 'approuve' and est_prive and not par_equipe from public.commentaires
    where id_parent = 'c9500000-0000-0000-0000-000000000001'
      and id_profil = '95000000-0000-0000-0000-0000000000a1'),
  true,
  'échanges — sa réponse privée est publiée sans modération'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000b2',
    $$select count(*)::text from public.commentaires
       where id_parent = 'c9500000-0000-0000-0000-000000000001'
         and id_profil = '95000000-0000-0000-0000-0000000000a1'$$),
  '0',
  'échanges — l''autre élève ne lit pas la réponse privée d''Ana'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000f3',
    $$select count(*)::text from public.commentaires
       where id_parent = 'c9500000-0000-0000-0000-000000000001' and est_prive and not par_equipe$$),
  '1',
  'échanges — la formatrice lit la réponse privée de l''élève'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = '95000000-0000-0000-0000-0000000000ad'
      and cle_evenement like 'message_prive:%'),
  1,
  'échanges — les administrateurs sont prévenus de la réponse privée'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000b2',
    $$select public.repondre_en_prive('c9500000-0000-0000-0000-000000000001', 'Intrusion')$$),
  'P0001',
  'échanges — une autre élève ne peut pas écrire dans l''échange d''Ana'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000a1',
    $$select public.repondre_en_prive('c9500000-0000-0000-0000-000000000002', 'Canal privé')$$),
  'P0001',
  'échanges — un élève n''ouvre pas d''échange privé de lui-même'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LE FIL RENDU PRIVÉ — tout le fil sort de la vue des autres, réversible
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000a1',
    $$select public.moderer_commentaire('c9500000-0000-0000-0000-000000000001', 'rendre_prive')$$),
  'P0001',
  'fil privé — un élève ne modère pas'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9500000-0000-0000-0000-000000000001', 'rendre_prive')$$),
  null::text,
  'fil privé — la formatrice rend le message d''Ana privé'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000b2',
    $$select count(*)::text from public.commentaires
       where id_commentaire = 'c9500000-0000-0000-0000-000000000001'
          or id_parent = 'c9500000-0000-0000-0000-000000000001'$$),
  '1',
  'fil privé — l''autre élève n''y voit plus que sa propre réponse'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.commentaires
       where id_commentaire = 'c9500000-0000-0000-0000-000000000001'
          or id_parent = 'c9500000-0000-0000-0000-000000000001'$$),
  '5',
  'fil privé — l''auteure garde tout son fil'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000a1',
    $$insert into public.commentaires (id_profil, id_lecon, id_parent, contenu)
      values ('95000000-0000-0000-0000-0000000000a1', '19500000-0000-0000-0000-000000000001',
              'c9500000-0000-0000-0000-000000000001', 'Réponse publique')$$),
  '42501',
  'fil privé — pas de réponse publique d''élève sous un fil privé'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.repondre_en_equipe('c9500000-0000-0000-0000-000000000001', 'Publique', false)$$),
  'P0001',
  'fil privé — l''équipe n''y répond qu''en privé'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9500000-0000-0000-0000-000000000001', 'rendre_public')$$),
  null::text,
  'fil privé — la formatrice le rend de nouveau public'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000b2',
    $$select count(*)::text from public.commentaires
       where id_commentaire = 'c9500000-0000-0000-0000-000000000001'
          or id_parent = 'c9500000-0000-0000-0000-000000000001'$$),
  '3',
  'fil privé — rendu public, le fil retrouve l''affichage d''avant'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA MODÉRATION — chaque décision là où elle a un sens
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9500000-0000-0000-0000-000000000002', 'approuver')$$),
  null::text,
  'modération — la formatrice approuve un message en attente'
);

select is(
  (select statut from public.commentaires where id_commentaire = 'c9500000-0000-0000-0000-000000000002'),
  'approuve',
  'modération — le message approuvé est publié'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9500000-0000-0000-0000-000000000003', 'rejeter')$$),
  null::text,
  'modération — la formatrice rejette un message publié'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.commentaires
       where id_commentaire = 'c9500000-0000-0000-0000-000000000003'$$),
  '0',
  'modération — le message rejeté disparaît pour les autres élèves'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9500000-0000-0000-0000-000000000012', 'rejeter')$$),
  'P0001',
  'modération — une réponse de l''équipe ne se rejette pas'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire(
        (select id_commentaire from public.commentaires
          where id_parent = 'c9500000-0000-0000-0000-000000000001' and est_prive and not par_equipe),
        'rendre_public')$$),
  'P0001',
  'modération — un message écrit en privé par un élève reste privé'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9500000-0000-0000-0000-000000000011', 'rendre_prive')$$),
  'P0001',
  'modération — la réponse d''un élève ne change pas de visibilité'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA SUPPRESSION — chacun les siens ; l'admin, après rejet, avec une trace
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000f3',
    $$with d as (delete from public.commentaires
                  where id_commentaire = 'c9500000-0000-0000-0000-000000000003' returning 1)
      select count(*)::text from d$$),
  '0',
  'suppression — la formatrice ne supprime pas le message d''une élève'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$select public.supprimer_commentaire('c9500000-0000-0000-0000-000000000003')$$),
  'P0001',
  'suppression — ni par la fonction réservée à l''administrateur'
);

-- Depuis le 09/10/2026, l'administratrice supprime directement un message
-- publié : plus besoin de le rejeter d'abord. Le journal garde son état.
select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000ad',
    $$select public.supprimer_commentaire('c9500000-0000-0000-0000-000000000002')$$),
  null::text,
  'suppression — l''administratrice supprime aussi un message publié, sans le rejeter d''abord'
);

select is(
  (select count(*)::int from public.commentaires
    where id_commentaire = 'c9500000-0000-0000-0000-000000000002')
  || ' / ' || (select meta ->> 'statut' from public.journal_admin
      where action = 'suppression_commentaire'
        and meta ->> 'id_commentaire' = 'c9500000-0000-0000-0000-000000000002'),
  '0 / approuve',
  'suppression — le message publié a disparu, et le journal dit qu''il l''était'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000ad',
    $$select public.supprimer_commentaire('c9500000-0000-0000-0000-000000000003')$$),
  null::text,
  'suppression — l''administratrice supprime un message rejeté'
);

-- La trace suit la forme des autres entrées du journal : la personne visée et
-- son adresse, que `anonymiser_journal_personne` sait effacer.
select is(
  (select count(*)::int from public.commentaires
    where id_commentaire = 'c9500000-0000-0000-0000-000000000003')
  + (select count(*)::int from public.journal_admin
      where action = 'suppression_commentaire'
        and id_profil_cible = '95000000-0000-0000-0000-0000000000b2'
        and cible = 'bea-echanges@essai.local'
        and meta ->> 'id_commentaire' = 'c9500000-0000-0000-0000-000000000003'),
  1,
  'suppression — le message a disparu, le journal en garde la trace'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000a1',
    $$with d as (delete from public.commentaires
                  where id_parent = 'c9500000-0000-0000-0000-000000000001'
                    and id_profil = '95000000-0000-0000-0000-0000000000a1' returning 1)
      select count(*)::text from d$$),
  '1',
  'suppression — l''élève efface toujours ses propres messages'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LES COLONNES — l'auteur, le fil, les marqueurs et le statut ne bougent plus par l'API
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000a1',
    $$update public.commentaires set est_prive = true
       where id_commentaire = 'c9500000-0000-0000-0000-000000000005'$$),
  '42501',
  'colonnes — un élève ne pose pas lui-même le marqueur privé'
);

select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$update public.commentaires set id_profil = '95000000-0000-0000-0000-0000000000f3'
       where id_commentaire = 'c9500000-0000-0000-0000-000000000011'$$),
  '42501',
  'colonnes — l''équipe ne change pas l''auteur d''un message'
);

-- L'équipe décide par moderer_commentaire, qui applique ses règles ; un UPDATE
-- direct du statut les contournerait (publier un message écrit en privé…).
select is(
  pg_temp.erreur_sous('95000000-0000-0000-0000-0000000000f3',
    $$update public.commentaires set statut = 'approuve'
       where id_commentaire = 'c9500000-0000-0000-0000-000000000005'$$),
  '42501',
  'colonnes — l''équipe ne change plus le statut en direct'
);

-- Une seule policy de modification, celle de l'auteur : c'est elle que le test
-- P-03 du socle contrôle (WITH CHECK identique au USING).
select is(
  (select string_agg(policyname, ', ') from pg_policies
    where schemaname = 'public' and tablename = 'commentaires' and cmd = 'UPDATE'),
  'commentaires_update_soi_en_attente',
  'colonnes — seule l''auteure modifie, et seulement son message en attente'
);

-- Contre-épreuve : la correction de son message en attente fonctionne toujours.
select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000a1',
    $$with u as (update public.commentaires set contenu = 'Message corrigé'
                  where id_commentaire = 'c9500000-0000-0000-0000-000000000005' returning 1)
      select count(*)::text from u$$),
  '1',
  'colonnes — l''élève corrige toujours son message en attente'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LES NOMS — « Prénom I. » pour les messages publiés, rien d'autre
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000b2',
    $$select nom_public from public.noms_publics_commentaires('19500000-0000-0000-0000-000000000001')
       where id_profil = '95000000-0000-0000-0000-0000000000a1'$$),
  'Ana A.',
  'noms — une élève lit « Prénom I. » sous le message d''une autre'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000b2',
    $$select nom_public from public.noms_publics_commentaires('19500000-0000-0000-0000-000000000001')
       where id_profil = '95000000-0000-0000-0000-0000000000ad'$$),
  'Équipe TradingCorp',
  'noms — un membre de l''équipe signe « Équipe TradingCorp »'
);

select is(
  pg_temp.sous('95000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.noms_publics_commentaires('19500000-0000-0000-0000-000000000002')$$),
  '0',
  'noms — aucun nom sans message publié dans la leçon'
);

select is(
  (select count(*)::int from unnest(array[
      'public.noms_publics_commentaires(uuid)',
      'public.repondre_en_prive(uuid, text)',
      'public.moderer_commentaire(uuid, text)',
      'public.supprimer_commentaire(uuid)',
      'public.est_message_prive(uuid)']) as f(signature)
    where has_function_privilege('anon', f.signature, 'execute')),
  0,
  'droits — aucune des nouvelles fonctions n''est ouverte aux visiteurs'
);

select * from finish();
rollback;
