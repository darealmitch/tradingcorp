-- =============================================================================
-- TradingCorp — Durées alignées sur la longueur réelle des fichiers Bunny
--
-- Treize chapitres portaient exactement une seconde de plus que leur fichier :
-- un arrondi supérieur au moment où les durées ont été saisies à la main. Sans
-- conséquence pour l'apprenant, mais c'était la dernière divergence entre la
-- base et seed_chapitres.sql, qui porte désormais les durées relevées via
-- l'API Bunny — et une divergence non expliquée finit toujours par se faire
-- passer pour un bug.
-- =============================================================================

update public.lecons l
   set duree_s = v.duree
  from (values
    ('4.3 La blockchain', 1156),
    ('5.4 Fibonacci - Partie 3', 1920),
    ('5.5 Méthodologie', 3760),
    ('5.7 Les concepts de base - Partie 1', 1935),
    ('5.10 Days of week', 1345),
    ('6.3 Calendrier économique', 3300),
    ('6.4 Les sites fondamentaux', 1867),
    ('6.5 Les commodités', 2096),
    ('7.2 Portefeuille pratique commodités', 587),
    ('7.3 Portefeuille pratique actions', 4435),
    ('7.5 Portefeuille pratique ETF', 799),
    ('7.6 Portefeuille pratique obligations', 375),
    ('8.2 Optimisation - Partie 2', 3760)
  ) as v(titre, duree)
 where l.titre = v.titre and l.type = 'video';
