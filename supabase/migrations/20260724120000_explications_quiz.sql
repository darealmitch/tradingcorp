-- Retour pédagogique des quiz : deux explications par question.
--
-- À la correction, l'apprenant doit comprendre POURQUOI sa réponse est juste
-- ou fausse — pas seulement voir son score. On stocke donc, au niveau de la
-- QUESTION (et non de la réponse, conformément au besoin « 2 explications par
-- question ») :
--   • explication_reussite : renforce le concept quand la réponse est correcte ;
--   • explication_echec : explique l'erreur et rappelle le raisonnement vers la
--     bonne réponse quand la réponse est incorrecte.
--
-- Nullable : une question sans explication rédigée n'affiche simplement pas de
-- retour (compatibilité avec les quiz pas encore enrichis). Aucune autre
-- mécanique n'est modifiée — la correction et le déblocage restent inchangés.

alter table questions add column if not exists explication_reussite text;
alter table questions add column if not exists explication_echec text;
