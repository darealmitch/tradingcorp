-- =============================================================================
-- TradingCorp — Les trois clés étrangères non couvertes reçoivent leur index
--
-- Audit du 31/07/2026, P-26. Sans index sur la colonne portante, PostgreSQL
-- balaie la table entière à chaque jointure — et surtout à chaque suppression
-- dans la table référencée, pour vérifier qu'aucune ligne ne pointe encore
-- dessus. Sans effet à trois profils ; coûteux dès quelques milliers.
--
-- Le cas de `inscriptions.id_paiement` est le plus concret : supprimer un
-- paiement impose aujourd'hui un balayage complet des inscriptions.
-- =============================================================================

create index if not exists idx_certificats_id_formation
  on public.certificats (id_formation);

create index if not exists idx_commentaires_id_profil
  on public.commentaires (id_profil);

create index if not exists idx_inscriptions_id_paiement
  on public.inscriptions (id_paiement);
