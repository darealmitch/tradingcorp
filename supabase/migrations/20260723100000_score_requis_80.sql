-- =============================================================================
-- TradingCorp — Seuil de réussite des quiz porté à 80 %
--
-- Règle métier : un quiz n'est validé qu'à partir de 80 % de bonnes réponses,
-- pour TOUS les quiz — existants comme futurs.
--
--   • le défaut de la colonne passe de 70 à 80 (tout nouveau quiz hérite du
--     bon seuil, y compris ceux créés via le gabarit SQL) ;
--   • les quiz déjà en base sont alignés.
--
-- Idempotent : ré-exécutable sans effet de bord.
-- =============================================================================

alter table quiz alter column score_requis set default 80;

update quiz set score_requis = 80 where score_requis <> 80;
