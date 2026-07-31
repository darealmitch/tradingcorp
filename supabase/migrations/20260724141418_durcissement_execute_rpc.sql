-- Durcissement des privilèges d'exécution (rapport du linter Supabase).
--
-- Problème : PostgreSQL accorde EXECUTE à PUBLIC sur toute nouvelle fonction.
-- `anon` ET `authenticated` héritent de PUBLIC : révoquer d'un seul rôle est
-- donc inefficace tant que PUBLIC garde le privilège. On révoque à la racine
-- (PUBLIC) puis on ré-accorde explicitement à `authenticated` là où le client
-- connecté en a besoin. Chaque fonction admin vérifie is_admin() en interne ;
-- le grant `authenticated` reste sûr.
--
-- Périmètre VOLONTAIREMENT restreint aux mutations privilégiées et aux triggers.
-- On NE touche PAS aux helpers RLS (is_admin, is_formateur_ou_admin,
-- a_inscription_active) ni aux fonctions de lecture : elles sont évaluées à
-- l'intérieur des politiques RLS, leur retirer EXECUTE casserait le contrôle
-- d'accès (une requête anonyme légitime lèverait une erreur de permission au
-- lieu de renvoyer zéro ligne).

-- Mutations réservées aux administrateurs (appelées par le client admin connecté).
revoke execute on function public.changer_role(uuid, text) from public;
grant execute on function public.changer_role(uuid, text) to authenticated;

revoke execute on function public.definir_compte_test(uuid, boolean) from public;
grant execute on function public.definir_compte_test(uuid, boolean) to authenticated;

revoke execute on function public.corriger_identite(uuid, text, text) from public;
grant execute on function public.corriger_identite(uuid, text, text) to authenticated;

revoke execute on function public.lister_profils_admin() from public;
grant execute on function public.lister_profils_admin() to authenticated;

-- changer_surnom : le surnom a été retiré du produit (cf. retrait_surnom),
-- plus aucun appelant. On coupe tout accès direct.
--
-- Conditionnel : retrait_surnom (20260717130000) est ANTÉRIEURE et supprime
-- déjà la fonction. Sur une base rejouée depuis zéro elle n'existe donc plus
-- ici, et un revoke sec interromprait la migration. Le cas s'est présenté en
-- réel : retrait_surnom n'avait jamais été appliquée sur la base distante, où
-- la fonction survivait — d'où ce revoke qui y fonctionnait.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'changer_surnom'
  ) then
    execute 'revoke execute on function public.changer_surnom(text) from public';
  end if;
end $$;

-- Triggers : jamais appelés en RPC (ils s'exécutent via le déclencheur, pas via
-- un GRANT). On retire tout accès direct à la racine PUBLIC.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.set_date_modification() from public;

-- Fixe le search_path du trigger SECURITY DEFINER (parade à l'injection par
-- résolution de nom : sans schéma explicite, un objet malveillant placé dans un
-- schéma prioritaire pourrait détourner l'appel).
alter function public.set_date_modification() set search_path = '';
