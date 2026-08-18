-- =============================================================================
-- TradingCorp — Apostrophe droite dans les titres de chapitres
--
-- Huit titres portaient « ‘ » (U+2018), une apostrophe-guillemet OUVRANTE :
-- « 3.2 Déclaration d‘impôts », « 4.1 Qu‘est-ce que la bourse ? »… En français
-- l'élision demande « ’ » (U+2019), jamais l'ouvrante — le caractère était donc
-- fautif, et invisible à la relecture.
--
-- Il créait surtout un écart avec seed_chapitres.sql, qui écrit ces mêmes
-- titres avec l'apostrophe droite : rejouer le seed sur cette base aurait
-- DUPLIQUÉ les huit chapitres, son test d'existence portant sur le titre.
--
-- Choix retenu : l'apostrophe droite partout, la plus simple à maintenir dans
-- un fichier SQL (où l'apostrophe se double déjà) comme dans un éditeur.
--
-- Aucun fichier du dépôt ne cible ces titres par leur ancienne graphie —
-- vérifié avant écriture ; le rattachement des quiz et des ressources passe par
-- d'autres intitulés, non touchés ici.
-- =============================================================================

update public.lecons
   set titre = translate(titre, '‘’', '''''')
 where titre like '%‘%' or titre like '%’%';
