-- =============================================================================
-- TradingCorp — Fermeture effective des RPC de parcours aux appels anonymes
--
-- La migration précédente révoquait EXECUTE à `anon`, sans effet : Postgres
-- accorde EXECUTE à PUBLIC sur toute fonction créée, et PUBLIC englobe anon.
-- Vérifié après coup — lecon_contenu et etats_modules répondaient encore à un
-- appel anonyme. Seul delivrer_certificat s'était refermée, sa grant PUBLIC
-- ayant déjà été retirée ailleurs. D'où le motif employé ici, le même que
-- 20260724141508 : révoquer à PUBLIC puis accorder explicitement.
--
-- PÉRIMÈTRE — uniquement les points d'entrée appelés par le front avec une
-- session. Quatre fonctions en sont EXCLUES parce qu'elles sont invoquées à
-- l'intérieur de policies RLS (a_inscription_active, is_admin,
-- is_formateur_ou_admin, lecon_debloquee) : une policy s'évalue avec les
-- droits du rôle appelant, donc les fermer à anon ferait ÉCHOUER les requêtes
-- publiques au lieu de les filtrer — le contraire du but recherché.
-- verifier_certificat reste publique par vocation.
--
-- Les appels internes (lecon_contenu → lecon_debloquee, terminer_lecon →
-- video_lecon_terminee) ne sont pas concernés : ces fonctions sont SECURITY
-- DEFINER et s'exécutent avec les droits de leur propriétaire.
-- =============================================================================

revoke execute on function public.lecon_contenu(uuid) from public;
grant execute on function public.lecon_contenu(uuid) to authenticated;

revoke execute on function public.terminer_lecon(uuid) from public;
grant execute on function public.terminer_lecon(uuid) to authenticated;

revoke execute on function public.etats_lecons(uuid) from public;
grant execute on function public.etats_lecons(uuid) to authenticated;

revoke execute on function public.etats_modules(uuid) from public;
grant execute on function public.etats_modules(uuid) to authenticated;

revoke execute on function public.reponses_publiques(uuid) from public;
grant execute on function public.reponses_publiques(uuid) to authenticated;

revoke execute on function public.video_lecon_terminee(uuid) from public;
grant execute on function public.video_lecon_terminee(uuid) to authenticated;

revoke execute on function public.formation_achevee(uuid, uuid) from public;
grant execute on function public.formation_achevee(uuid, uuid) to authenticated;

revoke execute on function public.acces_demo() from public;
grant execute on function public.acces_demo() to authenticated;

revoke execute on function public.numero_certificat() from public;
