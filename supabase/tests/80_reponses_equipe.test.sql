-- Réponses de l'équipe sous les commentaires, publiques ou privées.
--
-- Une réponse privée qui fuirait ne casserait aucun écran : un autre élève la
-- lirait, simplement, sous la question personnelle d'un camarade. Et un élève
-- qui pourrait poser lui-même les marqueurs se ferait passer pour l'équipe, ou
-- ouvrirait un canal privé vers un autre élève. D'où ces tests, dans les deux
-- sens chaque fois.

begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai : deux élèves inscrits, une administratrice, une leçon.
--   m1 — message d'Ana, en attente de modération
--   m2 — message de Bea, publié
--   r1 — réponse d'Ana sous m2, publiée
--   r2 — réponse d'Ana sous m2, en attente
--   m3 — message de l'administratrice, publié
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('80000000-0000-0000-0000-0000000000a1', 'ana-reponses@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1994-02-02"}'::jsonb),
  ('80000000-0000-0000-0000-0000000000b2', 'bea-reponses@essai.local',
   '{"prenom":"Bea","nom":"Camarade","date_naissance":"1993-03-03"}'::jsonb),
  ('80000000-0000-0000-0000-0000000000ad', 'ada-reponses@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);

update public.profils set role = 'admin'
 where id_profil = '80000000-0000-0000-0000-0000000000ad';

insert into public.formations (id_formation, titre, slug, est_publiee)
values ('f8000000-0000-0000-0000-00000000000f', 'Formation réponses', 'essai-reponses', true);
insert into public.sections (id_section, id_formation, titre, position, est_publiee)
values ('58000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-00000000000f', 'Module', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee)
values ('18000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000005', 'Leçon commentée', 1, true);
insert into public.inscriptions (id_profil, id_formation) values
  ('80000000-0000-0000-0000-0000000000a1', 'f8000000-0000-0000-0000-00000000000f'),
  ('80000000-0000-0000-0000-0000000000b2', 'f8000000-0000-0000-0000-00000000000f');

insert into public.commentaires (id_commentaire, id_profil, id_lecon, id_parent, contenu, statut) values
  ('c8000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a1',
   '18000000-0000-0000-0000-000000000001', null, 'Question personnelle', 'en_attente'),
  ('c8000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-0000000000b2',
   '18000000-0000-0000-0000-000000000001', null, 'Question publique', 'approuve'),
  ('c8000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-0000000000a1',
   '18000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000002', 'Moi aussi', 'approuve'),
  ('c8000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-0000000000a1',
   '18000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000002', 'Précision', 'en_attente'),
  ('c8000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-0000000000ad',
   '18000000-0000-0000-0000-000000000001', null, 'Annonce de l''équipe', 'approuve');

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
-- LA RÉPONSE PRIVÉE — l'élève concerné, et lui seul
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000a1',
    $$select public.repondre_en_equipe('c8000000-0000-0000-0000-000000000001', 'Faux', true)$$),
  'P0001',
  'réponses — un élève ne peut pas répondre au nom de l''équipe'
);

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000ad',
    $$select public.repondre_en_equipe('c8000000-0000-0000-0000-000000000001', 'Réponse privée', true)$$),
  null::text,
  'réponses — l''équipe répond en privé, même sous un message en attente'
);

select is(
  (select par_equipe and est_prive and statut = 'approuve' from public.commentaires
    where id_parent = 'c8000000-0000-0000-0000-000000000001'),
  true,
  'réponses — la réponse privée est publiée, marquée équipe et privée'
);

select is(
  pg_temp.sous('80000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.commentaires
       where id_parent = 'c8000000-0000-0000-0000-000000000001'$$),
  '1',
  'réponses — l''élève concerné lit la réponse privée'
);

select is(
  pg_temp.sous('80000000-0000-0000-0000-0000000000b2',
    $$select count(*)::text from public.commentaires
       where id_parent = 'c8000000-0000-0000-0000-000000000001'$$),
  '0',
  'réponses — un autre élève ne la voit pas'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = '80000000-0000-0000-0000-0000000000a1'
      and titre = 'Réponse privée de l''équipe'),
  1,
  'réponses — l''élève est prévenu de la réponse privée'
);

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000ad',
    $$select public.repondre_en_equipe('c8000000-0000-0000-0000-000000000005', 'À soi-même', true)$$),
  'P0001',
  'réponses — une réponse privée ne s''adresse qu''à un élève'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA RÉPONSE PUBLIQUE — seulement sous un message publié
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000ad',
    $$select public.repondre_en_equipe('c8000000-0000-0000-0000-000000000001', 'Publique', false)$$),
  'P0001',
  'réponses — pas de réponse publique sous un message encore en attente'
);

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000ad',
    $$select public.repondre_en_equipe('c8000000-0000-0000-0000-000000000002', 'Réponse publique', false)$$),
  null::text,
  'réponses — l''équipe répond publiquement sous un message publié'
);

select is(
  pg_temp.sous('80000000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.commentaires
       where id_parent = 'c8000000-0000-0000-0000-000000000002' and par_equipe$$),
  '1',
  'réponses — la réponse publique de l''équipe est lue par les autres inscrits'
);

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000ad',
    $$select public.repondre_en_equipe('c8000000-0000-0000-0000-000000000003', 'Sous une réponse', false)$$),
  'P0001',
  'réponses — on répond au message d''origine, pas à une réponse'
);

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000ad',
    $$select public.repondre_en_equipe('c8000000-0000-0000-0000-000000000002', '   ', true)$$),
  'P0001',
  'réponses — une réponse vide est refusée'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LES MARQUEURS — hors de portée des élèves
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000a1',
    $$insert into public.commentaires (id_profil, id_lecon, id_parent, contenu, par_equipe, est_prive)
      values ('80000000-0000-0000-0000-0000000000a1', '18000000-0000-0000-0000-000000000001',
              'c8000000-0000-0000-0000-000000000002', 'En privé à Bea', true, true)$$),
  '42501',
  'réponses — un élève ne peut pas écrire de réponse privée'
);

select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000a1',
    $$insert into public.commentaires (id_profil, id_lecon, contenu, par_equipe)
      values ('80000000-0000-0000-0000-0000000000a1', '18000000-0000-0000-0000-000000000001',
              'Message officiel', true)$$),
  '42501',
  'réponses — un élève ne peut pas se faire passer pour l''équipe'
);

-- Les deux marqueurs ensemble satisfont la contrainte de la table : c'est donc
-- bien un droit qui refuse, et non la contrainte — depuis le 05/10/2026, le
-- privilège de colonne, avant même la policy.
select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000a1',
    $$update public.commentaires set par_equipe = true, est_prive = true
       where id_commentaire = 'c8000000-0000-0000-0000-000000000004'$$),
  '42501',
  'réponses — un élève ne peut pas rendre privée sa propre réponse'
);

-- Contre-épreuve : la voie d'écriture des élèves fonctionne toujours.
select is(
  pg_temp.erreur_sous('80000000-0000-0000-0000-0000000000a1',
    $$insert into public.commentaires (id_profil, id_lecon, contenu)
      values ('80000000-0000-0000-0000-0000000000a1', '18000000-0000-0000-0000-000000000001',
              'Nouveau message')$$),
  null::text,
  'réponses — un élève inscrit publie toujours ses messages'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DROIT D'ACCÈS — art. 15
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('80000000-0000-0000-0000-0000000000a1',
    $$select jsonb_array_length(mes_donnees_personnelles() -> 'reponses_de_l_equipe')::text$$),
  '1',
  'art. 15 — l''export rend la réponse privée reçue'
);

select is(
  pg_temp.sous('80000000-0000-0000-0000-0000000000b2',
    $$select jsonb_array_length(mes_donnees_personnelles() -> 'reponses_de_l_equipe')::text$$),
  '1',
  'art. 15 — et à chacun les siennes seulement'
);

select * from finish();
rollback;
