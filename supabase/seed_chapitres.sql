-- =============================================================================
-- TradingCorp — Chapitres réels des modules (titres fournis par le client)
--
-- Reproduit à l'identique la structure de l'ancienne plateforme : chaque module
-- est une liste ordonnée de chapitres TYPÉS. Le chapitre 1 (page de
-- présentation) est porté par la section elle-même — il n'apparaît donc pas
-- ici ; ce script crée les chapitres 2..N sous forme de leçons typées.
--
-- Couvre les 8 modules COMPLETS (103 chapitres au total). Publie au passage la
-- formation et les 8 sections pour rendre le parcours navigable.
--
-- Placeholders : les vidéos pointent vers une URL de démonstration (à remplacer
-- par les vidéos Bunny), les articles et quiz reçoivent un contenu temporaire.
-- IDEMPOTENT : ré-exécutable sans doublon (garde sur le titre du chapitre).
-- =============================================================================

do $$
declare
  v_id_formation uuid;
  v_id_section   uuid;
  v_id_lecon     uuid;
  v_id_quiz      uuid;
  v_id_question  uuid;
  m              jsonb;
  ch             record;
  q              integer;

  c_video_url constant text :=
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  -- Les 8 modules (nom + position) avec l'intégralité de leurs chapitres.
  c_modules constant jsonb := $json$
  [
    { "titre": "Développement personnel", "position": 1, "chapitres": [
      { "t": "1.1 Le processus",     "ty": "video" },
      { "t": "1.2 Confiance en soi", "ty": "video" },
      { "t": "1.3 Tes Rêves",        "ty": "video" },
      { "t": "1.4 Lis",              "ty": "video" },
      { "t": "1.5 Gratitude",        "ty": "video" }
    ]},
    { "titre": "Éducation financière", "position": 2, "chapitres": [
      { "t": "2.1 Education financière",             "ty": "video" },
      { "t": "Quizz éducation financière",           "ty": "quiz" },
      { "t": "2.2 Les bases de la monnaie",          "ty": "video" },
      { "t": "Quizz Les bases de la monnaie",        "ty": "quiz" },
      { "t": "2.3 Retraite et assurance",            "ty": "video" },
      { "t": "Quizz retraite et assurances",         "ty": "quiz" },
      { "t": "2.4 Profil d'investisseur",            "ty": "article" },
      { "t": "2.5 Psychologie",                      "ty": "video" },
      { "t": "Quizz psychologie en investissement",  "ty": "quiz" }
    ]},
    { "titre": "Fiscalité", "position": 3, "chapitres": [
      { "t": "3.1 Créer sa société",        "ty": "video" },
      { "t": "3.2 Déclaration d'impôts",    "ty": "video" },
      { "t": "Quizz déclaration d'impôts",  "ty": "quiz" },
      { "t": "3.3 Optimisation Fiscale",    "ty": "video" },
      { "t": "Quizz Optimisation fiscale",  "ty": "quiz" }
    ]},
    { "titre": "Les marchés", "position": 4, "chapitres": [
      { "t": "4.1 Qu'est ce que la bourse ?",                 "ty": "video" },
      { "t": "Quizz qu'est ce que la bourse ?",               "ty": "quiz" },
      { "t": "4.2 Qu'est ce que la crypto ? Partie 1",        "ty": "video" },
      { "t": "4.2 Qu'est ce la crypto ? Partie 2",            "ty": "video" },
      { "t": "Quizz qu'est ce que la crypto ?",               "ty": "quiz" },
      { "t": "4.3 La blockchain",                             "ty": "video" },
      { "t": "Quizz La blockchain",                           "ty": "quiz" },
      { "t": "4.4 Où acheter sa crypto ? Partie 1",           "ty": "video" },
      { "t": "4.4 Où acheter sa crypto ? Partie 2",           "ty": "video" },
      { "t": "4.5 NFT",                                       "ty": "video" },
      { "t": "Quizz NFT",                                     "ty": "quiz" },
      { "t": "4.6 Où acheter ses NFT's ?",                    "ty": "video" },
      { "t": "4.7 Qu'est ce que le Web 3 ?",                  "ty": "video" },
      { "t": "Quizz Web 3",                                   "ty": "quiz" },
      { "t": "4.8 Crypto = entreprise = solution Partie 1",   "ty": "video" },
      { "t": "4.8 Crypto = entreprise = solution Partie 2",   "ty": "video" },
      { "t": "4.8 Crypto = entreprise = solution Partie 3",   "ty": "video" },
      { "t": "Quizz crypto",                                  "ty": "quiz" },
      { "t": "4.9 Trouver une crypto",                        "ty": "video" },
      { "t": "4.10 Adoption",                                 "ty": "video" },
      { "t": "Quizz Adoption",                                "ty": "quiz" },
      { "t": "4.11 12 manières de générés du cash avec le Web 3", "ty": "video" }
    ]},
    { "titre": "Trading", "position": 5, "chapitres": [
      { "t": "5.1 Initiation au graphique Partie 1",  "ty": "video" },
      { "t": "5.1 Initiation au graphique Partie 2",  "ty": "video" },
      { "t": "5.1 Initiation au graphique Partie 3",  "ty": "video" },
      { "t": "Quizz d'initiation au graphiques",      "ty": "quiz" },
      { "t": "5.2 Le Trading Partie 1",               "ty": "video" },
      { "t": "5.2 Le trading Partie 2",               "ty": "video" },
      { "t": "5.2 Le trading Partie 3",               "ty": "video" },
      { "t": "Quizz trading",                         "ty": "quiz" },
      { "t": "5.3 Fondamentaux",                      "ty": "video" },
      { "t": "Quizz fondamentaux",                    "ty": "quiz" },
      { "t": "5.4 Fibonacci Partie 1",                "ty": "video" },
      { "t": "5.4 Fibonacci Partie 2",                "ty": "video" },
      { "t": "5.4 Fibonacci Partie 3",                "ty": "video" },
      { "t": "Quizz fibonacci",                       "ty": "quiz" },
      { "t": "5.5 Méthodologie",                      "ty": "video" },
      { "t": "5.6 Contexte de marché",                "ty": "video" },
      { "t": "Quizz contextes de marchés",            "ty": "quiz" },
      { "t": "5.7 Les concept de base Partie 1",      "ty": "video" },
      { "t": "5.7 Les concept de base Partie 2",      "ty": "video" },
      { "t": "Quizz concept de base",                 "ty": "quiz" },
      { "t": "5.8 Structures",                        "ty": "video" },
      { "t": "Quizz structures",                      "ty": "quiz" },
      { "t": "5.9 Kill zones",                        "ty": "video" },
      { "t": "Quizz kill zones",                      "ty": "quiz" },
      { "t": "5.10 Days of week",                     "ty": "video" },
      { "t": "Quizz Days of week",                    "ty": "quiz" },
      { "t": "5.11 Les liquidités Partie 1",          "ty": "video" },
      { "t": "5.11 Les liquidités Partie 2",          "ty": "video" },
      { "t": "5.11 Les liquidités Partie 3",          "ty": "video" },
      { "t": "Quizz liquidités",                      "ty": "quiz" },
      { "t": "5.12 Mes stratégies",                   "ty": "video" },
      { "t": "Quizz Mes stratégies",                  "ty": "quiz" },
      { "t": "5.13 Options",                          "ty": "video" },
      { "t": "Quizz options",                         "ty": "quiz" }
    ]},
    { "titre": "Analyse fondamentale", "position": 6, "chapitres": [
      { "t": "6.1 L'économie Partie 1",              "ty": "video" },
      { "t": "6.1 L'économie Partie 2",              "ty": "video" },
      { "t": "Quizz économie",                       "ty": "quiz" },
      { "t": "6.2 Les leader économique Partie 1",   "ty": "video" },
      { "t": "6.2 Les leader économiques Partie 2",  "ty": "video" },
      { "t": "Quizz Leader économiques",             "ty": "quiz" },
      { "t": "6.3 Calendrier économique",            "ty": "video" },
      { "t": "Quizz Calendrier économiques",         "ty": "quiz" },
      { "t": "6.4 Les sites Fondamentaux",           "ty": "video" },
      { "t": "6.5 Les commodités",                   "ty": "video" },
      { "t": "Quizz commodités",                     "ty": "quiz" }
    ]},
    { "titre": "Investissement", "position": 7, "chapitres": [
      { "t": "7.1 Méthodologie d'investissement",     "ty": "video" },
      { "t": "7.2 Portefeuille pratique commodités",  "ty": "video" },
      { "t": "7.3 Portefeuille pratique action",      "ty": "video" },
      { "t": "7.4 Portefeuille pratique Crypto",      "ty": "video" },
      { "t": "7.5 Portefeuille pratique ETF",         "ty": "video" },
      { "t": "7.6 Portefeuille pratique Obligations", "ty": "video" }
    ]},
    { "titre": "Optimisation", "position": 8, "chapitres": [
      { "t": "Optimisation Partie 1", "ty": "video" },
      { "t": "Optimisation Partie 2", "ty": "video" },
      { "t": "Quizz Optimisation",    "ty": "quiz" }
    ]}
  ]
  $json$::jsonb;
begin
  select id_formation into v_id_formation from formations where slug = 'trader-pro';
  if v_id_formation is null then
    raise exception 'Formation "trader-pro" introuvable — crée-la d''abord.';
  end if;

  update formations set est_publiee = true where id_formation = v_id_formation;

  for m in select * from jsonb_array_elements(c_modules)
  loop
    -- Section : créée si absente, publiée dans tous les cas.
    select id_section into v_id_section
    from sections
    where id_formation = v_id_formation and titre = (m ->> 'titre');

    if v_id_section is null then
      insert into sections (id_formation, titre, position, est_publiee)
      values (v_id_formation, m ->> 'titre', (m ->> 'position')::integer, true)
      returning id_section into v_id_section;
    else
      update sections set est_publiee = true, position = (m ->> 'position')::integer
      where id_section = v_id_section;
    end if;

    -- Chapitres (leçons typées), position = ordre dans la liste.
    for ch in
      select elem ->> 't' as titre, elem ->> 'ty' as type, ord as position
      from jsonb_array_elements(m -> 'chapitres') with ordinality as t(elem, ord)
    loop
      if exists (
        select 1 from lecons where id_section = v_id_section and titre = ch.titre
      ) then
        continue;
      end if;

      insert into lecons (
        id_section, titre, type, contenu, description, position, duree_s,
        video_provider, video_url, video_metadata, est_publiee
      )
      values (
        v_id_section,
        ch.titre,
        ch.type,
        case when ch.type = 'article'
             then 'Contenu de cet article à venir.'
             else null end,
        case when ch.type = 'video'
             then 'Vidéo de démonstration — le contenu définitif sera publié prochainement.'
             else null end,
        ch.position,
        case when ch.type = 'video' then 3600 else null end,
        'bunny',
        case when ch.type = 'video' then c_video_url else null end,
        '{}'::jsonb,
        true
      )
      returning id_lecon into v_id_lecon;

      -- Chapitre quiz : crée le quiz + questions de démonstration.
      if ch.type = 'quiz' then
        -- score_requis hérité du défaut de la colonne (80 %), règle unique.
        insert into quiz (id_formation, id_lecon, titre, position)
        values (v_id_formation, v_id_lecon, ch.titre, ch.position)
        returning id_quiz into v_id_quiz;

        for q in 1 .. 3 loop
          insert into questions (id_quiz, libelle, position, type)
          values (v_id_quiz, format('Question de démonstration n°%s', q), q, 'choix_unique')
          returning id_question into v_id_question;

          insert into reponses (id_question, contenu, correcte) values
            (v_id_question, 'Bonne réponse',      true),
            (v_id_question, 'Mauvaise réponse A', false),
            (v_id_question, 'Mauvaise réponse B', false),
            (v_id_question, 'Mauvaise réponse C', false);
        end loop;
      end if;
    end loop;
  end loop;

  raise notice 'Chapitres des modules 1 à 3 créés ; 8 modules publiés.';
end $$;
