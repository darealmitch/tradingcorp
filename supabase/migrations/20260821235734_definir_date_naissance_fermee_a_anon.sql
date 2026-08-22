-- =============================================================================
-- TradingCorp — definir_date_naissance : fermeture effective aux anonymes
--
-- La migration précédente révoquait EXECUTE à PUBLIC puis l'accordait à
-- authenticated. Insuffisant, et vérifié après coup : un appel anonyme
-- atteignait le corps de la fonction (il échouait sur « Profil introuvable »,
-- faute d'auth.uid(), mais il l'atteignait).
--
-- La raison tient aux PRIVILÈGES PAR DÉFAUT de Supabase, qui accordent
-- EXECUTE à anon et authenticated sur toute fonction créée dans public. L'ACL
-- portait donc `anon=X/postgres` — une grant explicite, que révoquer PUBLIC ne
-- touche pas. Le motif employé pour les fonctions PRÉEXISTANTES (revoke
-- PUBLIC) ne suffit pas pour une fonction NOUVELLE : il faut révoquer
-- nommément à anon.
--
-- À retenir pour toute RPC ajoutée plus tard : elle naît exécutable par les
-- visiteurs anonymes, et c'est à la migration de la refermer.
-- =============================================================================

revoke execute on function public.definir_date_naissance(date) from anon;
