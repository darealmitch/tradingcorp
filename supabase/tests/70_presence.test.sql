-- Présence des élèves : qui est connecté, et qui peut le savoir.
--
-- Deux promesses à tenir, dans les deux sens chaque fois : l'administration
-- voit les élèves présents — et ELLE SEULE ; l'élève signale sa présence — et
-- ne peut ni la dater lui-même, ni lire celle des autres. Une fuite ici ne
-- casserait aucun écran : un élève qui lirait la table verrait simplement la
-- liste de ses camarades en ligne.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai : deux élèves, une formatrice, une administratrice.
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-0000000000a1', 'nina@essai.local',
   '{"prenom":"Nina","nom":"Présente","date_naissance":"1992-04-02"}'::jsonb),
  ('e0000000-0000-0000-0000-0000000000a2', 'omar@essai.local',
   '{"prenom":"Omar","nom":"Absent","date_naissance":"1987-11-19"}'::jsonb),
  ('e0000000-0000-0000-0000-0000000000f1', 'fanny@essai.local',
   '{"prenom":"Fanny","nom":"Formatrice","date_naissance":"1980-06-30"}'::jsonb),
  ('e0000000-0000-0000-0000-0000000000ad', 'ada@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1979-09-09"}'::jsonb);

update public.profils set role = 'formateur'
 where id_profil = 'e0000000-0000-0000-0000-0000000000f1';
update public.profils set role = 'admin'
 where id_profil = 'e0000000-0000-0000-0000-0000000000ad';

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
-- LE SIGNAL — l'élève horodate sa ligne, et rien d'autre
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('e0000000-0000-0000-0000-0000000000a1', 'select public.signaler_presence()'),
  null::text,
  'présence — un élève peut signaler sa présence'
);

select is(
  (select count(*)::int from public.presences
    where id_profil = 'e0000000-0000-0000-0000-0000000000a1'),
  1,
  'présence — le signal crée la ligne de l''élève'
);

-- La finalité déclarée porte sur les élèves : la donnée n'a pas à exister
-- pour le personnel.
select pg_temp.sous('e0000000-0000-0000-0000-0000000000f1', 'select public.signaler_presence()::text');

select is(
  (select count(*)::int from public.presences
    where id_profil = 'e0000000-0000-0000-0000-0000000000f1'),
  0,
  'présence — un compte qui n''est pas élève ne laisse aucune trace'
);

select ok(
  not has_function_privilege('anon', 'public.signaler_presence()', 'EXECUTE'),
  'présence — un visiteur non connecté ne peut rien signaler'
);

-- Un élève qui pourrait écrire la table se déclarerait en ligne à volonté —
-- ou antidaterait son passage.
select is(
  pg_temp.erreur_sous('e0000000-0000-0000-0000-0000000000a1',
    $$update public.presences set vu_le = now() - interval '1 hour'$$),
  '42501',
  'présence — un élève ne peut pas réécrire l''heure de son signal'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA LECTURE — l'administration seule
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('e0000000-0000-0000-0000-0000000000a1', 'select count(*) from public.presences'),
  '42501',
  'présence — un élève ne peut pas lire la présence des autres'
);

select is(
  pg_temp.erreur_sous('e0000000-0000-0000-0000-0000000000a1', 'select * from public.eleves_connectes()'),
  'P0001',
  'présence — un élève ne peut pas consulter la liste des connectés'
);

select is(
  pg_temp.erreur_sous('e0000000-0000-0000-0000-0000000000f1', 'select * from public.eleves_connectes()'),
  'P0001',
  'présence — la liste est réservée aux administrateurs, pas au staff entier'
);

-- Une ligne de formatrice posée à la main : même présente en table, elle ne
-- doit pas figurer parmi les ÉLÈVES connectés.
insert into public.presences (id_profil) values ('e0000000-0000-0000-0000-0000000000f1');

select is(
  pg_temp.sous('e0000000-0000-0000-0000-0000000000ad',
    'select string_agg(prenom, '','' order by prenom) from public.eleves_connectes()'),
  'Nina',
  'présence — l''administratrice voit l''élève présente, et elle seule'
);

-- L'ancienneté est calculée par le serveur : c'est ce qui rend le statut
-- indépendant de l'horloge du poste qui consulte.
update public.presences set vu_le = now() - interval '90 seconds'
 where id_profil = 'e0000000-0000-0000-0000-0000000000a1';

select is(
  pg_temp.sous('e0000000-0000-0000-0000-0000000000ad',
    'select inactif_depuis_s::text from public.eleves_connectes() where prenom = ''Nina'''),
  '90',
  'présence — l''ancienneté du signal est calculée côté serveur'
);

insert into public.presences (id_profil, depuis, vu_le)
values ('e0000000-0000-0000-0000-0000000000a2', now() - interval '26 hours', now() - interval '25 hours');

select is(
  pg_temp.sous('e0000000-0000-0000-0000-0000000000ad',
    'select count(*)::text from public.eleves_connectes() where prenom = ''Omar'''),
  '0',
  'présence — au-delà de 24 heures, un élève ne figure plus dans la liste'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA VISITE — « connecté depuis » ne repart de zéro qu'après un vrai silence
-- ─────────────────────────────────────────────────────────────────────────────

update public.presences
   set depuis = now() - interval '1 hour', vu_le = now() - interval '2 minutes'
 where id_profil = 'e0000000-0000-0000-0000-0000000000a1';

select pg_temp.sous('e0000000-0000-0000-0000-0000000000a1', 'select public.signaler_presence()::text');

select is(
  (select depuis from public.presences where id_profil = 'e0000000-0000-0000-0000-0000000000a1'),
  now() - interval '1 hour',
  'présence — un signal dans la foulée prolonge la visite en cours'
);

update public.presences set vu_le = now() - interval '10 minutes'
 where id_profil = 'e0000000-0000-0000-0000-0000000000a1';

select pg_temp.sous('e0000000-0000-0000-0000-0000000000a1', 'select public.signaler_presence()::text');

select is(
  (select depuis from public.presences where id_profil = 'e0000000-0000-0000-0000-0000000000a1'),
  now(),
  'présence — après plus de 5 minutes de silence, une nouvelle visite commence'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DROITS DES PERSONNES ET CONSERVATION
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('e0000000-0000-0000-0000-0000000000a1',
    'select (mes_donnees_personnelles() -> ''presence'' ->> ''derniere_activite'') is not null'),
  'true',
  'art. 15 — la présence figure dans l''export de l''élève'
);

select is(
  public.appliquer_retention_presences(24),
  1,
  'conservation — la purge efface la présence de plus de 24 heures'
);

select is(
  (select count(*)::int from public.presences
    where id_profil = 'e0000000-0000-0000-0000-0000000000a1'),
  1,
  'conservation — et garde celle du jour'
);

delete from auth.users where id = 'e0000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*)::int from public.presences
    where id_profil = 'e0000000-0000-0000-0000-0000000000a1'),
  0,
  'art. 17 — la présence disparaît avec le compte'
);

select * from finish();
rollback;
