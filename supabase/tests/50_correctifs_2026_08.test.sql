-- Non-régression des correctifs du 25/08/2026 (audit P-12, P-13, P-17, P-18,
-- P-19, P-24).
--
-- Chacun de ces défauts avait la même signature : ils ne faisaient échouer
-- aucune requête. Un accès resté ouvert après remboursement, un privilège
-- accordé sans trace, un dénominateur qui suit sa propre progression — rien de
-- tout cela ne lève d'erreur. Ces règles ne se cassent pas bruyamment, elles
-- cessent simplement de s'appliquer. D'où ces tests.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu d'essai : un administrateur, un apprenant inscrit et payant, une
-- formation de TROIS étapes publiées.
--
-- Trois, et non deux : terminer la première débloque la deuxième, si bien
-- qu'avec deux étapes l'apprenant les voit toutes et l'écart que P-24 décrit
-- n'apparaît pas. Il faut une étape encore verrouillée pour que « ce qui est
-- visible » et « ce que compte le programme » cessent de coïncider.
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-0000000000a1', 'patron@essai.local',
   '{"prenom":"Ada","nom":"Patronne","date_naissance":"1980-01-01"}'::jsonb),
  ('c0000000-0000-0000-0000-0000000000a2', 'eleve@essai.local',
   '{"prenom":"Léo","nom":"Dupont","date_naissance":"1995-06-15"}'::jsonb);

update public.profils set role = 'admin'
 where id_profil = 'c0000000-0000-0000-0000-0000000000a1';

insert into public.formations (id_formation, titre, slug, prix_centimes, est_publiee)
values ('f0000000-0000-0000-0000-00000000000f', 'Formation d''essai', 'essai', 9900, true);

insert into public.sections (id_section, id_formation, titre, position, est_publiee)
values ('50000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-00000000000f',
        'Module 1', 1, true);

insert into public.lecons (id_lecon, id_section, titre, position, est_publiee) values
  ('1ec00000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Étape 1', 1, true),
  ('1ec00000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', 'Étape 2', 2, true),
  ('1ec00000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000005', 'Étape 3', 3, true);

insert into public.paiements (id_paiement, id_profil, montant_centimes, statut, reference_transaction)
values ('9a000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-0000000000a2',
        9900, 'reussi', 'cs_essai_remboursement');

insert into public.inscriptions (id_profil, id_formation, id_paiement, statut, source)
values ('c0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-00000000000f',
        '9a000000-0000-0000-0000-00000000000e', 'active', 'paiement');

-- Passe une identité, exécute une requête de comptage, rend le résultat.
create function pg_temp.observer(p_sub text, p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims',
    case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', 'authenticated')::text end,
    true);
  execute 'set local role ' || case when p_sub is null then 'anon' else 'authenticated' end;
  execute p_sql into n;
  execute 'reset role';
  return n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- P-13 — les policies visent des rôles nommés, jamais `public`
--
-- Une policy posée sur `public` s'applique à TOUS les rôles, y compris ceux qui
-- n'ont rien à y faire, et se cumule avec les autres : c'est ce cumul que
-- l'analyseur comptait 72 fois.
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  (select count(*) from pg_policies where schemaname = 'public' and roles::text = '{public}'),
  0::bigint,
  'P-13 — aucune policy ne cible le rôle public'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- P-12 — un privilège accordé sans policy pour l'utiliser est un piège à
-- relecture : il annonce un droit que la RLS refuse.
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  has_table_privilege('anon', 'public.profils', 'INSERT'), false,
  'P-12 — anon n''a pas le privilège INSERT sur profils'
);

select is(
  has_table_privilege('authenticated', 'public.profils', 'INSERT'), false,
  'P-12 — authenticated non plus : les profils naissent du trigger handle_new_user'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- P-24 — le dénominateur de la progression porte sur le PROGRAMME, pas sur ce
-- que l'apprenant a déjà déverrouillé.
-- ─────────────────────────────────────────────────────────────────────────────

-- L'apprenant termine la première étape : la deuxième se débloque, la
-- troisième reste fermée.
insert into public.progression_lecons (id_profil, id_lecon, terminee_le)
values ('c0000000-0000-0000-0000-0000000000a2', '1ec00000-0000-0000-0000-000000000001', now());

-- La démonstration tient en deux mesures prises sous LA MÊME identité : ce que
-- la RLS laisse voir, et ce que la fonction compte. C'est leur écart qui était
-- le défaut — le front comptait la première valeur en croyant tenir la seconde.
select is(
  pg_temp.observer('c0000000-0000-0000-0000-0000000000a2',
                   'select count(*) from public.lecons'),
  2::bigint,
  'P-24 — la RLS ne montre que les 2 étapes débloquées, pas la 3e'
);

select is(
  pg_temp.observer('c0000000-0000-0000-0000-0000000000a2',
                   'select total from public.ma_progression()'),
  3::bigint,
  'P-24 — mais le total porte sur les 3 étapes publiées du programme'
);

select is(
  pg_temp.observer('c0000000-0000-0000-0000-0000000000a2',
                   'select terminees from public.ma_progression()'),
  1::bigint,
  'P-24 — une seule étape est comptée comme terminée'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- P-19 — l'octroi du statut « compte de test » laisse une trace.
--
-- Ce drapeau ouvre TOUT le catalogue payant sans achat : c'est le privilège le
-- plus étendu après le rôle d'administrateur.
-- ─────────────────────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin perform public.definir_compte_test('c0000000-0000-0000-0000-0000000000a2', true); end $$;
reset role;

select is(
  (select count(*) from public.journal_admin where action = 'octroi_compte_test'),
  1::bigint,
  'P-19 — l''octroi du statut de compte de test est journalisé'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin perform public.definir_compte_test('c0000000-0000-0000-0000-0000000000a2', false); end $$;
reset role;

select is(
  (select count(*) from public.journal_admin where action = 'retrait_compte_test'),
  1::bigint,
  'P-19 — le retrait l''est aussi : on doit pouvoir dire qui a eu cet accès, et quand'
);

-- Rejouer la même valeur ne décide de rien : le journal se lit comme une suite
-- de décisions, pas comme une trace d'appels.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin perform public.definir_compte_test('c0000000-0000-0000-0000-0000000000a2', false); end $$;
reset role;

select is(
  (select count(*) from public.journal_admin where action = 'retrait_compte_test'),
  1::bigint,
  'P-19 — un appel sans changement réel n''écrit rien'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- P-17 — un paiement remboursé ferme l'accès qu'il avait ouvert.
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  public.revoquer_pour_remboursement('cs_essai_remboursement', 'essai'),
  true,
  'P-17 — le remboursement d''un paiement connu est traité'
);

select is(
  (select statut from public.paiements where reference_transaction = 'cs_essai_remboursement'),
  'rembourse',
  'P-17 — le paiement porte enfin un statut autre que « reussi »'
);

select is(
  (select statut from public.inscriptions
    where id_paiement = '9a000000-0000-0000-0000-00000000000e'),
  'revoquee',
  'P-17 — l''inscription financée par ce paiement est révoquée'
);

select is(
  public.revoquer_pour_remboursement('cs_essai_remboursement', 'essai'),
  false,
  'P-17 — idempotence : Stripe relance ses événements, le second passage n''a pas lieu'
);

select is(
  (select count(*) from public.notifications where cle_evenement like 'remboursement:%'),
  1::bigint,
  'P-17 — l''apprenant est prévenu une fois, pas deux'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- P-18 — la vérification publique confirme une attestation sans divulguer
-- l'identité complète de son titulaire.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.certificats (id_profil, id_formation, numero)
values ('c0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-00000000000f',
        'ESSAI-VERIF-1');

select is(
  (select nom from public.verifier_certificat('ESSAI-VERIF-1')),
  'D.',
  'P-18 — le nom est réduit à son initiale'
);

select is(
  (select prenom from public.verifier_certificat('ESSAI-VERIF-1')),
  'Léo',
  'P-18 — le prénom reste lisible : il faut de quoi confronter l''attestation'
);

select * from finish();
rollback;
