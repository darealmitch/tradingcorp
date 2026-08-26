-- =============================================================================
-- TradingCorp — Les droits cessent d'annoncer ce qu'ils n'accordent pas
--
-- Audit du 31/07/2026, P-12, et les deux contrôles que la plateforme a ajoutés
-- depuis (0028/0029 : fonctions SECURITY DEFINER appelables sans être connecté).
--
-- 1. `profils` en insertion. `privileges_tables_versionnes` accorde `all` à
--    `anon` et `authenticated` avant de révoquer au cas par cas. L'INSERT y a
--    survécu, alors qu'aucune policy INSERT n'existe sur la table : RLS refuse
--    déjà toute insertion, mais le privilège laissait croire le contraire.
--    Les profils naissent d'un seul endroit — le trigger `handle_new_user`,
--    SECURITY DEFINER — et c'est ce qui doit rester vrai. Vérifié avant
--    révocation : aucun appelant côté front ou Edge Function n'insère dans
--    `profils` autrement qu'en rôle de service.
--
-- 2. `EXECUTE` sur les fonctions internes. Le linter signale huit fonctions
--    SECURITY DEFINER exécutables par `anon` via /rest/v1/rpc/. Toutes ne sont
--    pas à fermer, et se tromper casserait le site :
--
--    • `is_formateur_ou_admin()` GARDE son droit pour `anon` — les policies de
--      `formations` et `sections`, qui servent la vitrine publique, l'appellent.
--      Une expression de policy s'évalue avec les droits de l'appelant : la lui
--      retirer rendrait le catalogue illisible aux visiteurs.
--    • `verifier_certificat(text)` GARDE le sien : c'est un service de
--      vérification de diplôme, il doit répondre à un employeur non connecté.
--    • `lecon_debloquee(uuid)` garde le sien pour `authenticated` — l'Edge
--      Function de correction des quiz l'appelle avec le jeton porteur.
--
--    Les autres n'ont aucun appelant légitime dans ce rôle.
-- =============================================================================

revoke insert on public.profils from anon, authenticated;

-- Fonctions de garde : plus rien à faire pour un visiteur non connecté, dont
-- l'`auth.uid()` est nul de toute façon.
revoke execute on function public.is_admin()                    from anon;
revoke execute on function public.a_inscription_active(uuid)    from anon;
revoke execute on function public.lecon_debloquee(uuid)         from anon;

-- Fonction de trigger sur `auth.users` : elle n'a jamais eu de sens en RPC — un
-- appel direct échouerait faute de contexte `new`/`old`. Le trigger continue de
-- s'exécuter sous `supabase_auth_admin`, propriétaire de la table, que cette
-- révocation ne concerne pas.
revoke execute on function public.lever_changement_mdp_requis() from anon, authenticated;

-- Utilitaires internes, appelés uniquement depuis d'autres fonctions
-- SECURITY DEFINER, qui s'exécutent avec les droits de leur propriétaire.
revoke execute on function public.majeur_si_date_connue()       from anon, authenticated;
revoke execute on function public.numero_certificat()           from anon, authenticated;
