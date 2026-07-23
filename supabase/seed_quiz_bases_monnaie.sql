-- =============================================================================
-- TradingCorp — Contenu réel du quiz « Quizz Les bases de la monnaie »
-- (module « Éducation financière »)
--
-- Remplace les questions de démonstration par les vraies questions fournies.
-- Les options sont insérées dans l'ordre voulu par l'auteur ; une seule bonne
-- réponse par question (choix_unique). La colonne `correcte` n'est jamais
-- envoyée au client : la correction se fait dans l'Edge Function corriger-quiz.
--
-- Le seuil de réussite (80 %) est porté par la migration 20260723100000.
-- IDEMPOTENT : purge les questions du quiz puis réinsère (ré-exécutable).
-- =============================================================================

do $$
declare
  v_id_quiz     uuid;
  v_id_question uuid;
  q             jsonb;
  r             jsonb;
  v_pos         integer := 0;

  c_questions constant jsonb := $json$
  [
    {
      "libelle": "Qu'est ce qu'une Monnaie fiduciaire ?",
      "reponses": [
        { "texte": "Une monnaie qui repose sur la confiance", "correcte": true },
        { "texte": "Une monnaie 100% en ligne",              "correcte": false },
        { "texte": "Une monnaie ancienne",                   "correcte": false }
      ]
    },
    {
      "libelle": "Qu'est ce que l'inflation ?",
      "reponses": [
        { "texte": "La baisse du pouvoir d'achat",          "correcte": false },
        { "texte": "La baisse de la valeur de la monnaie",  "correcte": true },
        { "texte": "Les deux",                              "correcte": false }
      ]
    },
    {
      "libelle": "Qu'est ce que la déflation",
      "reponses": [
        { "texte": "La hausse du pouvoir d'achat", "correcte": true },
        { "texte": "La baisse des prix",           "correcte": false }
      ]
    },
    {
      "libelle": "La déflation, est une bonne une mauvaise chose ?",
      "reponses": [
        { "texte": "Bonne",       "correcte": false },
        { "texte": "Mauvaise",    "correcte": true },
        { "texte": "Je sais pas", "correcte": false }
      ]
    },
    {
      "libelle": "Qu'est ce qu'une monnaie scripturale ?",
      "reponses": [
        { "texte": "Une monnaie physique",    "correcte": false },
        { "texte": "Une cryptomonnaie",       "correcte": false },
        { "texte": "Une monnaie digitalisé",  "correcte": true }
      ]
    }
  ]
  $json$::jsonb;
begin
  select q2.id_quiz into v_id_quiz
  from quiz q2
  join lecons l on l.id_lecon = q2.id_lecon
  join sections s on s.id_section = l.id_section
  where q2.titre = 'Quizz Les bases de la monnaie'
    and s.titre = 'Éducation financière';

  if v_id_quiz is null then
    raise exception 'Quiz « Quizz Les bases de la monnaie » introuvable.';
  end if;

  -- Purge des questions existantes (les réponses suivent en cascade).
  delete from questions where id_quiz = v_id_quiz;

  for q in select * from jsonb_array_elements(c_questions)
  loop
    v_pos := v_pos + 1;

    insert into questions (id_quiz, libelle, position, type)
    values (v_id_quiz, q ->> 'libelle', v_pos, 'choix_unique')
    returning id_question into v_id_question;

    for r in select * from jsonb_array_elements(q -> 'reponses')
    loop
      insert into reponses (id_question, contenu, correcte)
      values (v_id_question, r ->> 'texte', (r ->> 'correcte')::boolean);
    end loop;
  end loop;

  raise notice 'Quiz « Les bases de la monnaie » : % questions réelles insérées.', v_pos;
end $$;
