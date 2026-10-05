-- Annonce d'une mise à jour des conditions (article 14 des CGU).
--
-- Ce qui compte : que chacun soit prévenu UNE fois, quel que soit le nombre de
-- clics — l'e-mail ne part qu'aux personnes que la fonction vient de notifier —,
-- que l'essai ne touche que les comptes de test, et que rien d'autre que le
-- rôle de service ne puisse déclencher l'annonce.

begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('96000000-0000-0000-0000-0000000000a1', 'ana-conditions@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1994-02-02"}'::jsonb),
  ('96000000-0000-0000-0000-0000000000e5', 'tom-conditions@essai.local',
   '{"prenom":"Tom","nom":"Essai","date_naissance":"1992-06-06"}'::jsonb),
  ('96000000-0000-0000-0000-0000000000ad', 'ada-conditions@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set est_test = true
 where id_profil = '96000000-0000-0000-0000-0000000000e5';
update public.profils set role = 'admin'
 where id_profil = '96000000-0000-0000-0000-0000000000ad';

-- ─────────────────────────────────────────────────────────────────────────────
-- LES DROITS — l'annonce part de la fonction Edge, jamais de l'API
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated',
    'public.annoncer_mise_a_jour_conditions(text, text, text, text, boolean)', 'execute')
  and not has_function_privilege('anon',
    'public.annoncer_mise_a_jour_conditions(text, text, text, text, boolean)', 'execute'),
  'droits — ni un compte connecté ni un visiteur ne déclenche l''annonce'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ESSAI — les comptes de test, et eux seuls
-- ─────────────────────────────────────────────────────────────────────────────

create temporary table essai on commit drop as
  select * from public.annoncer_mise_a_jour_conditions(
    'essai_conditions:96', 'Mise à jour des conditions', 'Essai', '/cgu', true);

select is(
  (select count(*)::int from essai
    where id_destinataire = '96000000-0000-0000-0000-0000000000e5'),
  1,
  'essai — le compte de test est notifié, et rendu pour recevoir l''e-mail'
);

select is(
  (select count(*)::int from essai e
     join public.profils p on p.id_profil = e.id_destinataire
    where not p.est_test),
  0,
  'essai — aucun vrai compte n''est rendu : aucun e-mail ne lui part'
);

select is(
  (select count(*)::int from public.notifications
    where cle_evenement = 'essai_conditions:96'
      and id_profil in ('96000000-0000-0000-0000-0000000000a1',
                        '96000000-0000-0000-0000-0000000000ad')),
  0,
  'essai — ni l''élève ni l''administratrice ne reçoivent de notification'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ENVOI — chaque compte, une fois
-- ─────────────────────────────────────────────────────────────────────────────

create temporary table premier_envoi on commit drop as
  select * from public.annoncer_mise_a_jour_conditions(
    'conditions:96', 'Mise à jour des conditions', 'Version du 5 octobre', '/cgu', false);

select is(
  (select count(*)::int from premier_envoi),
  (select count(*)::int from public.profils p
     join auth.users u on u.id = p.id_profil
    where u.email is not null),
  'envoi — chaque compte est notifié, et rendu pour recevoir l''e-mail'
);

select is(
  (select courriel from premier_envoi
    where id_destinataire = '96000000-0000-0000-0000-0000000000a1'),
  'ana-conditions@essai.local',
  'envoi — la fonction rend l''adresse à laquelle écrire'
);

select is(
  (select prenom_destinataire from premier_envoi
    where id_destinataire = '96000000-0000-0000-0000-0000000000a1'),
  'Ana',
  'envoi — et le prénom pour la saluer'
);

-- Le second clic : personne de nouveau, donc aucun e-mail ne repart.
select is(
  (select count(*)::int from public.annoncer_mise_a_jour_conditions(
     'conditions:96', 'Mise à jour des conditions', 'Version du 5 octobre', '/cgu', false)),
  0,
  'idempotence — rappelée avec la même clé, l''annonce ne rend plus personne'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = '96000000-0000-0000-0000-0000000000a1' and cle_evenement = 'conditions:96'),
  1,
  'idempotence — et ne pose pas de seconde notification'
);

select throws_ok(
  $$select * from public.annoncer_mise_a_jour_conditions('', 'Titre', null, '/cgu', false)$$,
  '22023',
  'Une clé d''événement et un titre sont requis',
  'sans clé, l''annonce est refusée : l''unicité ne la protégerait plus'
);

select * from finish();
rollback;
