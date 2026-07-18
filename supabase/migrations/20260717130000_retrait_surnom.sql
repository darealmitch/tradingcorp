-- =============================================================================
-- TradingCorp — Retrait complet de la notion de « surnom »
--
-- Annule le sous-système surnom introduit par 20260710170000_identite_surnom
-- (colonnes profils.surnom + profils.surnom_modifie_le, RPC changer_surnom).
-- Le reste de cette ancienne migration (retrait avatar, revoke update,
-- corriger_identite) reste en place et n'est pas touché.
--
-- Idempotent. La fonction est supprimée AVANT les colonnes (elle les référence).
-- Aucune vue/fonction ne dépend de ces colonnes (lister_profils_admin liste
-- ses colonnes explicitement, sans surnom) : un drop simple suffit.
-- =============================================================================

drop function if exists public.changer_surnom(text);

alter table profils drop column if exists surnom;
alter table profils drop column if exists surnom_modifie_le;
