-- Non-régression des règles portées par les triggers.
--
-- Contrairement aux policies, ces règles ne filtrent pas des lignes : elles
-- refusent une écriture ou en déclenchent une autre. Elles se cassent en
-- silence — un trigger supprimé ne fait échouer aucune requête, il laisse
-- simplement passer ce qu'il refusait la veille.
--
-- Les deux règles testées ici ont chacune été un défaut réel :
--   P-02 — la vérification de majorité existait en fichier mais n'avait jamais
--          été appliquée à la base ;
--   P-04 — le blocage du mot de passe temporaire se levait sur demande du
--          client, sans qu'aucun mot de passe change.

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- ─────────────────────────────────────────────────────────────────────────────
-- P-02 — majorité exigée à la création du compte
-- ─────────────────────────────────────────────────────────────────────────────

select throws_ok(
  format(
    $f$insert into auth.users (id, email, raw_user_meta_data)
       values ('a1111111-0000-0000-0000-000000000001', 'mineur@essai.local', %L::jsonb)$f$,
    jsonb_build_object(
      'prenom', 'Mina', 'nom', 'Mineure',
      'date_naissance', to_char(current_date - interval '10 years', 'YYYY-MM-DD')
    )::text
  ),
  'P0001', null,
  'P-02 — un mineur ne peut pas créer de compte'
);

-- Sans date, le contrôle n'a rien à vérifier : le refus est donc la seule
-- issue sûre. Une inscription anonyme sur ce point rouvrirait la brèche.
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('a1111111-0000-0000-0000-000000000002', 'sansdate@essai.local',
            '{"prenom":"Sam","nom":"Sansdate"}'::jsonb)$$,
  'P0001', null,
  'P-02 — une inscription sans date de naissance est refusée'
);

-- Cas limite : le jour exact des 18 ans est accepté.
select lives_ok(
  format(
    $f$insert into auth.users (id, email, raw_user_meta_data)
       values ('a1111111-0000-0000-0000-000000000003', 'pilepoil@essai.local', %L::jsonb)$f$,
    jsonb_build_object(
      'prenom', 'Pile', 'nom', 'Poil',
      'date_naissance', to_char(current_date - interval '18 years', 'YYYY-MM-DD')
    )::text
  ),
  'P-02 — le jour exact des 18 ans est accepté'
);

-- Cas limite symétrique : la veille ne l'est pas.
select throws_ok(
  format(
    $f$insert into auth.users (id, email, raw_user_meta_data)
       values ('a1111111-0000-0000-0000-000000000004', 'veille@essai.local', %L::jsonb)$f$,
    jsonb_build_object(
      'prenom', 'Presque', 'nom', 'Majeur',
      'date_naissance', to_char(current_date - interval '18 years' + interval '1 day', 'YYYY-MM-DD')
    )::text
  ),
  'P0001', null,
  'P-02 — la veille des 18 ans est refusée'
);

-- Les comptes créés par un administrateur (formateurs, comptes de test)
-- échappent volontairement au contrôle : leur date n'est pas demandée.
select lives_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('a1111111-0000-0000-0000-000000000005', 'creeparadmin@essai.local',
            '{"prenom":"Cléa","nom":"Créée","cree_par_admin":"true"}'::jsonb)$$,
  'P-02 — un compte créé par un administrateur reste possible sans date'
);

-- Le second verrou : même en écrivant directement dans `profils`, sans passer
-- par l'inscription, la date d'un mineur est refusée.
select throws_ok(
  format(
    $f$update public.profils set date_naissance = %L::date
        where id_profil = 'a1111111-0000-0000-0000-000000000003'$f$,
    to_char(current_date - interval '12 years', 'YYYY-MM-DD')
  ),
  '23514', null,
  'P-02 — un profil ne peut pas être ramené à une date de naissance de mineur'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- P-04 — le blocage se lève par le changement de mot de passe, et par lui seul
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values
  ('b2222222-0000-0000-0000-000000000001', 'bloque1@essai.local',
   '{"prenom":"Bea","nom":"Bloquée","cree_par_admin":"true"}'::jsonb, 'empreinte-temporaire'),
  ('b2222222-0000-0000-0000-000000000002', 'bloque2@essai.local',
   '{"prenom":"Bob","nom":"Bloqué","cree_par_admin":"true"}'::jsonb, 'empreinte-temporaire');

update public.profils set doit_changer_mdp = true
 where id_profil in ('b2222222-0000-0000-0000-000000000001',
                     'b2222222-0000-0000-0000-000000000002');

-- Une réécriture à l'identique déclenche bien le trigger (il porte sur la
-- colonne, pas sur la valeur) : c'est la garde interne `is distinct from` qui
-- doit empêcher la levée. Sans elle, il suffirait de renvoyer le même mot de
-- passe pour se débloquer.
update auth.users set encrypted_password = encrypted_password
 where id = 'b2222222-0000-0000-0000-000000000001';

select is(
  (select doit_changer_mdp from public.profils
    where id_profil = 'b2222222-0000-0000-0000-000000000001'),
  true,
  'P-04 — réécrire le même mot de passe ne lève pas le blocage'
);

update auth.users set encrypted_password = 'empreinte-nouvelle'
 where id = 'b2222222-0000-0000-0000-000000000001';

select is(
  (select doit_changer_mdp from public.profils
    where id_profil = 'b2222222-0000-0000-0000-000000000001'),
  false,
  'P-04 — un changement réel de mot de passe lève le blocage'
);

select is(
  (select doit_changer_mdp from public.profils
    where id_profil = 'b2222222-0000-0000-0000-000000000002'),
  true,
  'P-04 — le blocage des autres comptes n''est pas touché au passage'
);

select * from finish();
rollback;
