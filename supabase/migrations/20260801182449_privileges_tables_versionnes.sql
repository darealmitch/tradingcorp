-- =============================================================================
-- TradingCorp — Les privilèges de table entrent enfin dans le dépôt
--
-- Ce que la CI a révélé au premier passage : reconstruite à partir des seules
-- migrations, la base n'accorde AUCUN privilège aux rôles `anon` et
-- `authenticated`. Les tests d'autorisation échouaient tous sur
-- « permission denied for table profils ».
--
-- Pourquoi personne ne l'avait vu : Supabase pose, à la création du projet,
-- des privilèges PAR DÉFAUT (`alter default privileges … grant all on tables`)
-- dont hérite toute table créée ensuite. Les migrations en ont donc toujours
-- profité sans jamais les écrire — au point que plusieurs d'entre elles font
-- un `revoke update on profils …` qui présuppose un `grant` absent du dépôt.
-- En production tout fonctionne ; sur une base neuve, rien.
--
-- C'est le même défaut que P-01, déplacé du schéma vers les droits : le dépôt
-- ne suffisait pas à reconstruire la base. Il le peut désormais.
--
-- CETTE MIGRATION NE CHANGE RIEN EN PRODUCTION. Vérifié avant application :
-- rejouée sur la base réelle, elle laisse zéro écart, ni sur les privilèges de
-- table ni sur ceux de colonne.
-- =============================================================================

-- 1. Privilèges par défaut : ce dont héritera toute table créée plus tard.
--    Sans eux, la prochaine migration qui ajoute une table recréerait
--    exactement l'écart qu'on est en train de combler.
--
--    Volontairement limité aux TABLES : les fonctions et les séquences ne sont
--    pas concernées par le défaut constaté, et le projet durcit délibérément
--    les droits d'exécution (voir durcissement_execute_rpc).
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

-- 2. Les tables déjà créées, que le point 1 ne couvre pas rétroactivement.
--    La RLS reste l'autorité : ouvrir la table ne donne accès à aucune ligne
--    tant qu'une policy ne l'autorise pas.
grant all on all tables in schema public to anon, authenticated;

-- 3. Les deux restrictions décidées ailleurs, ré-appliquées APRÈS le grant
--    global — sans quoi celui-ci les défairait silencieusement, et avec elles
--    deux verrous essentiels :
--
--    • `profils` en écriture : sans cette révocation, un utilisateur pourrait
--      se promouvoir administrateur ou lever son propre blocage de mot de
--      passe (P-04). Les modifications légitimes passent par des RPC ;
--    • `progression_lecons` : `terminee_le` n'est écrite que par
--      `terminer_lecon()` ou l'Edge Function de correction des quiz. Accordée
--      au client, elle ouvrirait tout le parcours d'un seul UPDATE.
revoke update on public.profils from anon, authenticated;

revoke insert, update on public.progression_lecons from authenticated;

grant insert (id_profil, id_lecon, position_video_s, video_terminee_le)
  on public.progression_lecons to authenticated;

grant update (position_video_s, video_terminee_le)
  on public.progression_lecons to authenticated;
