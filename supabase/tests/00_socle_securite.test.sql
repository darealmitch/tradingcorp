-- Socle de sécurité : les invariants qui ne dépendent d'aucune donnée.
--
-- Ces assertions décrivent la FORME du modèle de sécurité — RLS active, vues
-- transparentes, fonctions privilégiées cloisonnées, colonnes sensibles hors
-- de portée du client. Une régression ici ouvre une brèche sur toute une
-- table à la fois, pas sur une ligne : c'est le premier filet à poser.
--
-- Chaque assertion a été vérifiée contre la base de production avant d'être
-- écrite ici ; aucune ne décrit un état souhaité mais non atteint.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- ── Cloisonnement des données ────────────────────────────────────────────────

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'Toute table de public a la RLS active'
);

-- Une table protégée mais sans policy est hermétique : personne n'y accède,
-- pas même son propriétaire applicatif. C'est un oubli, pas une protection.
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname
      )),
  0,
  'Toute table protégée déclare au moins une policy'
);

-- Une vue sans security_invoker s'exécute avec les droits de son propriétaire :
-- elle contourne alors la RLS des tables qu'elle lit, et devient un tunnel.
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and coalesce(
        (select option_value from pg_options_to_table(c.reloptions)
          where option_name = 'security_invoker'),
        'false'
      ) <> 'true'),
  0,
  'Toute vue de public s''exécute avec les droits de l''appelant'
);

-- Sans search_path fixé, une fonction SECURITY DEFINER peut être détournée en
-- plaçant un objet homonyme dans un schéma que l'appelant contrôle.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and (p.proconfig is null
           or not exists (
             select 1 from unnest(p.proconfig) cfg where cfg like 'search\_path=%'
           ))),
  0,
  'Toute fonction SECURITY DEFINER a un search_path fixé'
);

-- ── Colonnes que le client ne doit jamais écrire ─────────────────────────────

-- `doit_changer_mdp` est le blocage du mot de passe temporaire : modifiable
-- par son porteur, il ne bloquerait plus personne.
select ok(
  not has_column_privilege('authenticated', 'public.profils', 'doit_changer_mdp', 'UPDATE'),
  'Un utilisateur ne peut pas lever lui-même son blocage de mot de passe'
);

-- `terminee_le` commande le déverrouillage de la leçon suivante
-- (lecon_debloquee). Accordé au client, il ouvrirait tout le parcours d'un
-- seul UPDATE, sans jamais suivre une leçon.
select ok(
  not has_column_privilege('authenticated', 'public.progression_lecons', 'terminee_le', 'INSERT'),
  'Un apprenant ne peut pas déclarer une leçon terminée (INSERT)'
);

select ok(
  not has_column_privilege('authenticated', 'public.progression_lecons', 'terminee_le', 'UPDATE'),
  'Un apprenant ne peut pas déclarer une leçon terminée (UPDATE)'
);

-- Contre-épreuve : le verrou ci-dessus est bien ciblé, pas un refus global qui
-- casserait la reprise de lecture.
select ok(
  has_column_privilege('authenticated', 'public.progression_lecons', 'position_video_s', 'UPDATE'),
  'Un apprenant enregistre toujours sa position de lecture'
);

-- ── Non-régression des correctifs déjà livrés ────────────────────────────────

-- P-03 : un WITH CHECK plus permissif que le USING laisse l'auteur faire
-- SORTIR sa contribution de l'état où il avait le droit d'y toucher — ici,
-- s'auto-approuver. Les deux expressions doivent rester identiques.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and policyname in ('avis_update_soi_en_attente', 'commentaires_update_soi_en_attente')
      and with_check is distinct from qual),
  0,
  'P-03 — les policies d''auto-modification ont un WITH CHECK identique au USING'
);

-- P-04 : la RPC levait le blocage sur simple demande du client, sans preuve
-- d'un changement de mot de passe. Sa réapparition, même vidée, remettrait le
-- vecteur en place.
-- Le cast explicite lève l'ambiguïté entre les deux surcharges de
-- hasnt_function : celle qui prend une description et celle qui prend la
-- liste des types d'arguments de la fonction.
select hasnt_function(
  'public', 'confirmer_changement_mdp',
  'P-04 — la RPC de confirmation du mot de passe reste supprimée'::text
);

select has_trigger(
  'auth', 'users', 'on_auth_password_changed',
  'P-04 — le blocage est levé par le changement de mot de passe lui-même'
);

-- P-02 : le contrôle de majorité est porté par un trigger sur `profils`, donc
-- valable quel que soit le chemin d'écriture, pas seulement l'inscription.
select has_trigger(
  'public', 'profils', 'trg_profils_majeur',
  'P-02 — le contrôle de majorité s''applique à toute écriture de profil'
);

select * from finish();
rollback;
