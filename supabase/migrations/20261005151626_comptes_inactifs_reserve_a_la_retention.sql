-- comptes_inactifs : réservée à la rétention quotidienne.
--
-- La fonction rend, pour chaque compte sans connexion depuis au moins un an :
-- son identifiant, sa dernière activité, s'il a payé et son rôle. La migration
-- 20260826102000 l'avait ouverte à tout compte connecté, sans contrôle du rôle
-- de l'appelant : dès juillet 2027 — un an après le plus ancien compte —, un
-- élève aurait lu ces informations sur tous les autres (audit du 05/10/2026).
--
-- Son seul appelant, appliquer_retention, est lancé chaque nuit par la tâche
-- retention_rgpd et s'exécute avec les droits du propriétaire : il n'a pas
-- besoin de ce droit. Aucun écran ni aucune fonction Edge ne l'appelle. Un
-- futur écran d'administration passerait par une fonction gardée par is_admin().

revoke execute on function public.comptes_inactifs(integer) from public, anon, authenticated;
