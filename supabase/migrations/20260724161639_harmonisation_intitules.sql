-- Harmonisation typographique des intitulés (chapitres vidéo, articles et quiz)
-- sur les 8 modules. Convention : quiz = « Quiz - <sujet> », vidéos multi-parties
-- suffixées « - Partie N », casse de phrase, corrections orthographiques évidentes,
-- alignement singulier/pluriel entre vidéo et quiz (assurances, marchés).
--
-- Les titres servent de clé (garde d'idempotence des seeds, matching quiz↔module).
-- On met donc à jour les lignes existantes pour rester cohérent avec les seeds
-- désormais renommés. IDEMPOTENT : réappliquer ne fait rien si les anciens titres
-- n'existent plus.

with correspondance(ancien, nouveau) as (
  values
    -- Module 1 — Développement personnel
    ('1.3 Tes Rêves', '1.3 Tes rêves'),
    -- Module 2 — Éducation financière
    ('2.1 Education financière', '2.1 Éducation financière'),
    ('Quizz éducation financière', 'Quiz - Éducation financière'),
    ('Quizz Les bases de la monnaie', 'Quiz - Les bases de la monnaie'),
    ('2.3 Retraite et assurance', '2.3 Retraite et assurances'),
    ('Quizz retraite et assurances', 'Quiz - Retraite et assurances'),
    ('Quizz psychologie en investissement', 'Quiz - Psychologie en investissement'),
    -- Module 3 — Fiscalité
    ('Quizz déclaration d''impôts', 'Quiz - Déclaration d''impôts'),
    ('3.3 Optimisation Fiscale', '3.3 Optimisation fiscale'),
    ('Quizz Optimisation fiscale', 'Quiz - Optimisation fiscale'),
    -- Module 4 — Les marchés
    ('4.1 Qu''est ce que la bourse ?', '4.1 Qu''est-ce que la bourse ?'),
    ('Quizz qu''est ce que la bourse ?', 'Quiz - Qu''est-ce que la bourse ?'),
    ('4.2 Qu''est ce que la crypto ? Partie 1', '4.2 Qu''est-ce que la crypto ? - Partie 1'),
    ('4.2 Qu''est ce la crypto ? Partie 2', '4.2 Qu''est-ce que la crypto ? - Partie 2'),
    ('Quizz qu''est ce que la crypto ?', 'Quiz - Qu''est-ce que la crypto ?'),
    ('Quizz La blockchain', 'Quiz - La blockchain'),
    ('4.4 Où acheter sa crypto ? Partie 1', '4.4 Où acheter sa crypto ? - Partie 1'),
    ('4.4 Où acheter sa crypto ? Partie 2', '4.4 Où acheter sa crypto ? - Partie 2'),
    ('Quizz NFT', 'Quiz - NFT'),
    ('4.6 Où acheter ses NFT''s ?', '4.6 Où acheter ses NFT ?'),
    ('4.7 Qu''est ce que le Web 3 ?', '4.7 Qu''est-ce que le Web 3 ?'),
    ('Quizz Web 3', 'Quiz - Web 3'),
    ('4.8 Crypto = entreprise = solution Partie 1', '4.8 Crypto = entreprise = solution - Partie 1'),
    ('4.8 Crypto = entreprise = solution Partie 2', '4.8 Crypto = entreprise = solution - Partie 2'),
    ('4.8 Crypto = entreprise = solution Partie 3', '4.8 Crypto = entreprise = solution - Partie 3'),
    ('Quizz crypto', 'Quiz - Crypto'),
    ('Quizz Adoption', 'Quiz - Adoption'),
    ('4.11 12 manières de générés du cash avec le Web 3', '4.11 12 manières de générer du cash avec le Web 3'),
    -- Module 5 — Trading
    ('5.1 Initiation au graphique Partie 1', '5.1 Initiation au graphique - Partie 1'),
    ('5.1 Initiation au graphique Partie 2', '5.1 Initiation au graphique - Partie 2'),
    ('5.1 Initiation au graphique Partie 3', '5.1 Initiation au graphique - Partie 3'),
    ('Quizz d''initiation au graphiques', 'Quiz - Initiation aux graphiques'),
    ('5.2 Le Trading Partie 1', '5.2 Le trading - Partie 1'),
    ('5.2 Le trading Partie 2', '5.2 Le trading - Partie 2'),
    ('5.2 Le trading Partie 3', '5.2 Le trading - Partie 3'),
    ('Quizz trading', 'Quiz - Trading'),
    ('Quizz fondamentaux', 'Quiz - Fondamentaux'),
    ('5.4 Fibonacci Partie 1', '5.4 Fibonacci - Partie 1'),
    ('5.4 Fibonacci Partie 2', '5.4 Fibonacci - Partie 2'),
    ('5.4 Fibonacci Partie 3', '5.4 Fibonacci - Partie 3'),
    ('Quizz fibonacci', 'Quiz - Fibonacci'),
    ('5.6 Contexte de marché', '5.6 Contextes de marchés'),
    ('Quizz contextes de marchés', 'Quiz - Contextes de marchés'),
    ('5.7 Les concept de base Partie 1', '5.7 Les concepts de base - Partie 1'),
    ('5.7 Les concept de base Partie 2', '5.7 Les concepts de base - Partie 2'),
    ('Quizz concept de base', 'Quiz - Concepts de base'),
    ('Quizz structures', 'Quiz - Structures'),
    ('Quizz kill zones', 'Quiz - Kill zones'),
    ('Quizz Days of week', 'Quiz - Days of week'),
    ('5.11 Les liquidités Partie 1', '5.11 Les liquidités - Partie 1'),
    ('5.11 Les liquidités Partie 2', '5.11 Les liquidités - Partie 2'),
    ('5.11 Les liquidités Partie 3', '5.11 Les liquidités - Partie 3'),
    ('Quizz liquidités', 'Quiz - Liquidités'),
    ('Quizz Mes stratégies', 'Quiz - Mes stratégies'),
    ('Quizz options', 'Quiz - Options'),
    -- Module 6 — Analyse fondamentale
    ('6.1 L''économie Partie 1', '6.1 L''économie - Partie 1'),
    ('6.1 L''économie Partie 2', '6.1 L''économie - Partie 2'),
    ('Quizz économie', 'Quiz - Économie'),
    ('6.2 Les leader économique Partie 1', '6.2 Les leaders économiques - Partie 1'),
    ('6.2 Les leader économiques Partie 2', '6.2 Les leaders économiques - Partie 2'),
    ('Quizz Leader économiques', 'Quiz - Leaders économiques'),
    ('Quizz Calendrier économiques', 'Quiz - Calendrier économique'),
    ('6.4 Les sites Fondamentaux', '6.4 Les sites fondamentaux'),
    ('Quizz commodités', 'Quiz - Commodités'),
    -- Module 7 — Investissement
    ('7.3 Portefeuille pratique action', '7.3 Portefeuille pratique actions'),
    ('7.4 Portefeuille pratique Crypto', '7.4 Portefeuille pratique cryptos'),
    ('7.6 Portefeuille pratique Obligations', '7.6 Portefeuille pratique obligations'),
    -- Module 8 — Optimisation
    ('Optimisation Partie 1', 'Optimisation - Partie 1'),
    ('Optimisation Partie 2', 'Optimisation - Partie 2'),
    ('Quizz Optimisation', 'Quiz - Optimisation')
)
update lecons l
set titre = c.nouveau
from correspondance c
where l.titre = c.ancien;

with correspondance(ancien, nouveau) as (
  values
    ('Quizz éducation financière', 'Quiz - Éducation financière'),
    ('Quizz Les bases de la monnaie', 'Quiz - Les bases de la monnaie'),
    ('Quizz retraite et assurances', 'Quiz - Retraite et assurances'),
    ('Quizz psychologie en investissement', 'Quiz - Psychologie en investissement'),
    ('Quizz déclaration d''impôts', 'Quiz - Déclaration d''impôts'),
    ('Quizz Optimisation fiscale', 'Quiz - Optimisation fiscale'),
    ('Quizz qu''est ce que la bourse ?', 'Quiz - Qu''est-ce que la bourse ?'),
    ('Quizz qu''est ce que la crypto ?', 'Quiz - Qu''est-ce que la crypto ?'),
    ('Quizz La blockchain', 'Quiz - La blockchain'),
    ('Quizz NFT', 'Quiz - NFT'),
    ('Quizz Web 3', 'Quiz - Web 3'),
    ('Quizz crypto', 'Quiz - Crypto'),
    ('Quizz Adoption', 'Quiz - Adoption'),
    ('Quizz d''initiation au graphiques', 'Quiz - Initiation aux graphiques'),
    ('Quizz trading', 'Quiz - Trading'),
    ('Quizz fondamentaux', 'Quiz - Fondamentaux'),
    ('Quizz fibonacci', 'Quiz - Fibonacci'),
    ('Quizz contextes de marchés', 'Quiz - Contextes de marchés'),
    ('Quizz concept de base', 'Quiz - Concepts de base'),
    ('Quizz structures', 'Quiz - Structures'),
    ('Quizz kill zones', 'Quiz - Kill zones'),
    ('Quizz Days of week', 'Quiz - Days of week'),
    ('Quizz liquidités', 'Quiz - Liquidités'),
    ('Quizz Mes stratégies', 'Quiz - Mes stratégies'),
    ('Quizz options', 'Quiz - Options'),
    ('Quizz économie', 'Quiz - Économie'),
    ('Quizz Leader économiques', 'Quiz - Leaders économiques'),
    ('Quizz Calendrier économiques', 'Quiz - Calendrier économique'),
    ('Quizz commodités', 'Quiz - Commodités'),
    ('Quizz Optimisation', 'Quiz - Optimisation')
)
update quiz q
set titre = c.nouveau
from correspondance c
where q.titre = c.ancien;
