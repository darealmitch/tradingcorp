-- =============================================================================
-- TradingCorp — Chapitres réels des modules (titres fournis par le client)
--
-- Reproduit à l'identique la structure de l'ancienne plateforme : chaque module
-- est une liste ordonnée de chapitres TYPÉS. Le chapitre 1 (page de
-- présentation) est porté par la section elle-même — il n'apparaît donc pas
-- ici ; ce script crée les chapitres 2..N sous forme de leçons typées.
--
-- Couvre pour l'instant les 3 PREMIERS modules (les autres suivront). Publie
-- au passage la formation et les 8 sections pour rendre le parcours navigable.
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

  -- Les 8 modules (nom + position). Les chapitres ne sont renseignés que pour
  -- les 3 premiers ; les autres restent en présentation seule pour l'instant.
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
    { "titre": "Les marchés",          "position": 4, "chapitres": [] },
    { "titre": "Trading",              "position": 5, "chapitres": [] },
    { "titre": "Analyse fondamentale", "position": 6, "chapitres": [] },
    { "titre": "Investissement",       "position": 7, "chapitres": [] },
    { "titre": "Optimisation",         "position": 8, "chapitres": [] }
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
        insert into quiz (id_formation, id_lecon, titre, score_requis, position)
        values (v_id_formation, v_id_lecon, ch.titre, 70, ch.position)
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
