-- =============================================================================
-- TradingCorp — L'introduction d'un module devient une vraie ÉTAPE
--
-- Jusqu'ici la page de présentation d'un module était portée par la section
-- (accroche/introduction/objectifs) mais n'était PAS suivie : la 1re vidéo
-- n'avait aucun prérequis. On en fait une étape à part entière, SANS nouveau
-- mécanisme : une leçon de type 'intro' en position 0.
--
--   • Elle est comptée par lecon_debloquee comme prédécesseur de la 1re vidéo
--     (position 1) → la vidéo reste verrouillée tant que l'intro n'est pas
--     validée (terminee_le), via la progression existante.
--   • terminer_lecon la valide librement (type ≠ quiz/video), comme un article.
--   • Son CONTENU reste sur la section (affiché par app-module-intro) ; la
--     leçon 'intro' ne sert que d'ancre de progression, jamais de chapitre du
--     lecteur (filtrée côté client).
--
-- Seule évolution de schéma : étendre le type autorisé. Toutes les fonctions
-- de gating (lecon_debloquee, terminer_lecon, etats_lecons, etats_modules)
-- fonctionnent telles quelles.
-- =============================================================================

alter table lecons drop constraint if exists lecons_type_check;
alter table lecons add constraint lecons_type_check
  check (type in ('intro', 'article', 'video', 'quiz'));
