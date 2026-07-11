-- =============================================================================
-- OPTIONNEL — Amorce les 8 MODULES de la formation (noms fournis par le client,
-- aucun contenu inventé). À exécuter dans le SQL editor quand tu veux.
--
-- Les 103 ÉTAPES (leçons) NE sont PAS créées ici : leurs titres n'étant pas
-- fournis, elles seront ajoutées via la gestion de contenu. Le nombre d'étapes
-- attendu par module est rappelé en commentaire à titre indicatif.
--
-- Rattaché à la formation de slug 'trader-pro' (adapte si nécessaire).
-- Idempotent : ré-exécutable sans créer de doublon.
-- =============================================================================

insert into sections (id_formation, titre, position, est_publiee)
select f.id_formation, m.titre, m.position, false
from formations f
cross join (values
  ('Développement personnel', 1),  -- 6 étapes
  ('Éducation financière',    2),  -- 10 étapes
  ('Fiscalité',               3),  -- 6 étapes
  ('Les marchés',             4),  -- 23 étapes
  ('Trading',                 5),  -- 35 étapes
  ('Analyse fondamentale',    6),  -- 12 étapes
  ('Investissement',          7),  -- 7 étapes
  ('Optimisation',            8)   -- 4 étapes
) as m(titre, position)
where f.slug = 'trader-pro'
  and not exists (
    select 1 from sections s
    where s.id_formation = f.id_formation and s.titre = m.titre
  );
