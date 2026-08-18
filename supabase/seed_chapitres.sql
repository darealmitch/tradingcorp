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
-- Ce script pose la STRUCTURE, jamais de texte d'attente : les descriptions et
-- le corps des articles restent vides tant que le contenu réel n'est pas
-- rédigé, et les écrans savent l'annoncer eux-mêmes.
--
-- Chaque chapitre vidéo porte en revanche son identifiant Bunny et sa durée
-- réelle : une base rejouée à froid retrouve donc ses vidéos sans intervention.
-- Le script posait auparavant un lien de démonstration hébergé chez Google
-- (BigBuckBunny.mp4) en publiant le chapitre : ce lien a cessé de répondre
-- (403) sans prévenir, et 63 chapitres publiés se sont mis à ouvrir un lecteur
-- mort chez des apprenants qui avaient payé. D'où la règle posée ici — un
-- chapitre vidéo n'est publié que si sa vidéo existe.
-- IDEMPOTENT : ré-exécutable sans doublon (garde sur le titre du chapitre).
-- =============================================================================

do $$
declare
  v_id_formation uuid;
  v_id_section   uuid;
  v_id_lecon     uuid;
  v_id_quiz      uuid;
  m              jsonb;
  ch             record;

  -- Zone CDN de la bibliothèque Bunny Stream 708929 du projet. Les URL de
  -- lecture se construisent à partir du seul identifiant de vidéo — inutile de
  -- les recopier depuis Bunny.
  c_zone_cdn constant text := 'https://vz-8e333926-6ea.b-cdn.net/';

  -- Les 8 modules (nom + position) avec l'intégralité de leurs chapitres.
  -- Un chapitre vidéo porte « v » (identifiant Bunny) et « d » (durée réelle du
  -- fichier, en secondes) : la durée n'est jamais déduite de la vidéo par le
  -- code, c'est le champ qu'on oublie le plus souvent.
  c_modules constant jsonb := $json$
  [
    { "titre": "Développement personnel", "position": 1, "chapitres": [
      { "t": "1.1 Le processus",     "ty": "video", "v": "366a949b-cd21-4ef6-a2e0-0384d327d901", "d": 1742 },
      { "t": "1.2 Confiance en soi", "ty": "video", "v": "b6915daf-f67a-45ef-8b13-fa1c1afb0801", "d": 1164 },
      { "t": "1.3 Tes rêves",        "ty": "video", "v": "3959f925-3b02-410e-a41f-48dc0b72b666", "d": 767 },
      { "t": "1.4 Lis",              "ty": "video", "v": "e3713d4b-af2f-4a4e-a209-c15ce657ad75", "d": 737 },
      { "t": "1.5 Gratitude",        "ty": "video", "v": "f5a896b5-34ab-43f6-921b-ba47f93c7278", "d": 725 }
    ]},
    { "titre": "Éducation financière", "position": 2, "chapitres": [
      { "t": "2.1 Éducation financière",             "ty": "video", "v": "09044263-9a72-480f-a710-66bf3d463a2e", "d": 3977 },
      { "t": "Quiz - Éducation financière",          "ty": "quiz" },
      { "t": "2.2 Les bases de la monnaie",          "ty": "video", "v": "dd4fb1b3-2c20-459f-960a-a5b76c0fa522", "d": 1422 },
      { "t": "Quiz - Les bases de la monnaie",       "ty": "quiz" },
      { "t": "2.3 Retraite et assurances",           "ty": "video", "v": "e31298d9-e6f4-43eb-8a58-7728f1312764", "d": 2407 },
      { "t": "Quiz - Retraite et assurances",        "ty": "quiz" },
      { "t": "2.4 Profil d'investisseur",            "ty": "article" },
      { "t": "2.5 Psychologie",                      "ty": "video", "v": "71900b2a-b7b1-4b2b-9f1f-b4f7c033107e", "d": 2560 },
      { "t": "Quiz - Psychologie en investissement", "ty": "quiz" }
    ]},
    { "titre": "Fiscalité", "position": 3, "chapitres": [
      { "t": "3.1 Créer sa société",        "ty": "video", "v": "886e2ce2-93e6-4389-8131-ba92c6bc010e", "d": 709 },
      { "t": "3.2 Déclaration d'impôts",    "ty": "video", "v": "0234a50b-9fe6-4713-a91b-ad26f9d088b5", "d": 4497 },
      { "t": "Quiz - Déclaration d'impôts", "ty": "quiz" },
      { "t": "3.3 Optimisation fiscale",    "ty": "video", "v": "2201a2b4-0f39-49ed-ac1d-0ae3361871a2", "d": 1422 },
      { "t": "Quiz - Optimisation fiscale", "ty": "quiz" }
    ]},
    { "titre": "Les marchés", "position": 4, "chapitres": [
      { "t": "4.1 Qu'est-ce que la bourse ?",                 "ty": "video", "v": "df1eef7f-c3d3-4b4b-a703-f2eeb7f61e95", "d": 3669 },
      { "t": "Quiz - Qu'est-ce que la bourse ?",              "ty": "quiz" },
      { "t": "4.2 Qu'est-ce que la crypto ? - Partie 1",      "ty": "video", "v": "b3ab95a8-3e69-4590-90bc-f6dba4b76eb2", "d": 4464 },
      { "t": "4.2 Qu'est-ce que la crypto ? - Partie 2",      "ty": "video", "v": "2558e2b9-e8aa-43e5-990e-b9f1881a774f", "d": 1920 },
      { "t": "Quiz - Qu'est-ce que la crypto ?",              "ty": "quiz" },
      { "t": "4.3 La blockchain",                             "ty": "video", "v": "73be78a3-c44a-4c54-adaf-037f18241344", "d": 1156 },
      { "t": "Quiz - La blockchain",                          "ty": "quiz" },
      { "t": "4.4 Où acheter sa crypto ? - Partie 1",         "ty": "video", "v": "3ec2270f-50b8-4c6f-8649-2bb480601bb9", "d": 2262 },
      { "t": "4.4 Où acheter sa crypto ? - Partie 2",         "ty": "video", "v": "1447d4bc-2c10-423b-9526-8d5de0c9711f", "d": 3110 },
      { "t": "4.5 NFT",                                       "ty": "video", "v": "8e841355-156e-48da-accb-567d4dd56179", "d": 3017 },
      { "t": "Quiz - NFT",                                    "ty": "quiz" },
      { "t": "4.6 Où acheter ses NFT ?",                      "ty": "video", "v": "6436d4d4-277d-44c3-97e6-776e48f5cc14", "d": 1716 },
      { "t": "4.7 Qu'est-ce que le Web 3 ?",                  "ty": "video", "v": "df678614-ef24-48fc-b879-85aa77734465", "d": 1141 },
      { "t": "Quiz - Web 3",                                  "ty": "quiz" },
      { "t": "4.8 Crypto = entreprise = solution - Partie 1", "ty": "video", "v": "55935bff-1222-499d-9b13-3113eec878bd", "d": 1596 },
      { "t": "4.8 Crypto = entreprise = solution - Partie 2", "ty": "video", "v": "9f2ac2b9-00d5-47cb-bd72-43b2672cd69c", "d": 2515 },
      { "t": "4.8 Crypto = entreprise = solution - Partie 3", "ty": "video", "v": "8631f397-5ba0-4473-bf27-4c884dba1b4c", "d": 2682 },
      { "t": "Quiz - Crypto",                                 "ty": "quiz" },
      { "t": "4.9 Trouver une crypto",                        "ty": "video", "v": "fd3c6c22-7a78-4a76-ae2f-f0616d910434", "d": 1198 },
      { "t": "4.10 Adoption",                                 "ty": "video", "v": "41f9777b-8ab0-4683-a9f9-7175decb9177", "d": 4290 },
      { "t": "Quiz - Adoption",                               "ty": "quiz" },
      { "t": "4.11 12 manières de générer du cash avec le Web 3", "ty": "video", "v": "84ceb6e6-8b4e-4765-a153-e403a6ce82b6", "d": 1340 }
    ]},
    { "titre": "Trading", "position": 5, "chapitres": [
      { "t": "5.1 Initiation au graphique - Partie 1", "ty": "video", "v": "a2d6f69c-2f31-4c53-8508-2b2c2394de2d", "d": 4475 },
      { "t": "5.1 Initiation au graphique - Partie 2", "ty": "video", "v": "7e5345e7-6408-4e3c-a7c7-f6d7d76d9228", "d": 2089 },
      { "t": "5.1 Initiation au graphique - Partie 3", "ty": "video", "v": "5d0a6ca8-fb94-4645-80c8-7dabc13d2ebd", "d": 1988 },
      { "t": "Quiz - Initiation aux graphiques",       "ty": "quiz" },
      { "t": "5.2 Le trading - Partie 1",              "ty": "video", "v": "296561e8-fe0f-4045-a689-e41af7700b3b", "d": 1926 },
      { "t": "5.2 Le trading - Partie 2",              "ty": "video", "v": "fbc73053-65cf-4d87-8926-cd2aa7fd1c4c", "d": 3628 },
      { "t": "5.2 Le trading - Partie 3",              "ty": "video", "v": "e40f1c28-640f-463c-bfa0-773e35ef7e34", "d": 1443 },
      { "t": "Quiz - Trading",                         "ty": "quiz" },
      { "t": "5.3 Fondamentaux",                      "ty": "video", "v": "7a970887-3bc7-43f7-8d6a-963897b499dd", "d": 3168 },
      { "t": "Quiz - Fondamentaux",                   "ty": "quiz" },
      { "t": "5.4 Fibonacci - Partie 1",              "ty": "video", "v": "7ae248ea-138b-4179-80a3-deb54f642263", "d": 2008 },
      { "t": "5.4 Fibonacci - Partie 2",              "ty": "video", "v": "769da7dc-a578-4761-8ebb-3adb6a7bb9a0", "d": 1745 },
      { "t": "5.4 Fibonacci - Partie 3",              "ty": "video", "v": "a6010bbd-1155-4765-8f06-8e1d63b789af", "d": 1920 },
      { "t": "Quiz - Fibonacci",                      "ty": "quiz" },
      { "t": "5.5 Méthodologie",                      "ty": "video", "v": "544c7373-e90a-4006-b5e8-7f540c33b316", "d": 3760 },
      { "t": "5.6 Contextes de marchés",              "ty": "video", "v": "4aecb7b1-9940-44aa-b5ac-14c407cfc8c6", "d": 2581 },
      { "t": "Quiz - Contextes de marchés",           "ty": "quiz" },
      { "t": "5.7 Les concepts de base - Partie 1",   "ty": "video", "v": "93dee4af-3d5e-435d-9185-51f9a41634b0", "d": 1935 },
      { "t": "5.7 Les concepts de base - Partie 2",   "ty": "video", "v": "2356b3e3-d8b8-4049-b1fa-c23059775e62", "d": 2800 },
      { "t": "Quiz - Concepts de base",               "ty": "quiz" },
      { "t": "5.8 Structures",                        "ty": "video", "v": "b53c1de8-a5f1-4fa6-84c8-968ae64c515b", "d": 2408 },
      { "t": "Quiz - Structures",                     "ty": "quiz" },
      { "t": "5.9 Kill zones",                        "ty": "video", "v": "caf75a4a-405f-4837-97be-87d530a61b4a", "d": 1639 },
      { "t": "Quiz - Kill zones",                     "ty": "quiz" },
      { "t": "5.10 Days of week",                     "ty": "video", "v": "ad59f852-2eb4-4646-80f2-a214a95da575", "d": 1345 },
      { "t": "Quiz - Days of week",                   "ty": "quiz" },
      { "t": "5.11 Les liquidités - Partie 1",        "ty": "video", "v": "86ada143-a5bd-4533-95ef-331e3bda64a8", "d": 1894 },
      { "t": "5.11 Les liquidités - Partie 2",        "ty": "video", "v": "8296d809-ce34-40fa-b2b8-f151a38d909b", "d": 2202 },
      { "t": "5.11 Les liquidités - Partie 3",        "ty": "video" },
      { "t": "Quiz - Liquidités",                     "ty": "quiz" },
      { "t": "5.12 Mes stratégies",                   "ty": "video", "v": "92ec0ca4-ab38-471c-9829-22341fa10f09", "d": 3298 },
      { "t": "Quiz - Mes stratégies",                 "ty": "quiz" },
      { "t": "5.13 Options",                          "ty": "video", "v": "4cd3e1d5-ad61-442a-b782-44101fa320cd", "d": 4447 },
      { "t": "Quiz - Options",                        "ty": "quiz" }
    ]},
    { "titre": "Analyse fondamentale", "position": 6, "chapitres": [
      { "t": "6.1 L'économie - Partie 1",            "ty": "video", "v": "72dc564a-0393-4568-8128-f2d7a2736a53", "d": 4957 },
      { "t": "6.1 L'économie - Partie 2",            "ty": "video", "v": "5b843635-88e8-47f0-93c3-1815a4126e41", "d": 1025 },
      { "t": "Quiz - Économie",                      "ty": "quiz" },
      { "t": "6.2 Les leaders économiques - Partie 1", "ty": "video", "v": "bf7af45d-0925-4640-bcbd-e03b5e2bdc11", "d": 2262 },
      { "t": "6.2 Les leaders économiques - Partie 2", "ty": "video", "v": "d97aaec7-a3af-4c17-afe0-90e0f30f532d", "d": 2933 },
      { "t": "Quiz - Leaders économiques",           "ty": "quiz" },
      { "t": "6.3 Calendrier économique",            "ty": "video", "v": "787fc949-d67f-489b-bc7d-8cc76aaff720", "d": 3300 },
      { "t": "Quiz - Calendrier économique",         "ty": "quiz" },
      { "t": "6.4 Les sites fondamentaux",           "ty": "video", "v": "3336f139-1308-4b1c-90f4-e6f99452f9d4", "d": 1867 },
      { "t": "6.5 Les commodités",                   "ty": "video", "v": "09480a48-6d9c-4742-80e1-6faf2afe85cb", "d": 2096 },
      { "t": "Quiz - Commodités",                    "ty": "quiz" }
    ]},
    { "titre": "Investissement", "position": 7, "chapitres": [
      { "t": "7.1 Méthodologie d'investissement",     "ty": "video", "v": "15e40b2f-0514-4159-a558-ab22e40d5308", "d": 1129 },
      { "t": "7.2 Portefeuille pratique commodités",  "ty": "video", "v": "63367ac3-e422-47e9-b70d-1d3bd69115e4", "d": 587 },
      { "t": "7.3 Portefeuille pratique actions",     "ty": "video", "v": "505d5368-c02f-4b0a-8692-9c577b3f1aa1", "d": 4435 },
      { "t": "7.4 Portefeuille pratique cryptos",     "ty": "video", "v": "cf1b3bc1-ace8-4cb2-b5f8-fd5fd08a25f4", "d": 1052 },
      { "t": "7.5 Portefeuille pratique ETF",         "ty": "video", "v": "d3001c09-5a8d-4f2e-9729-b7b767101bbb", "d": 799 },
      { "t": "7.6 Portefeuille pratique obligations", "ty": "video", "v": "3365d3d7-6a5e-4be4-8752-bcc071d56689", "d": 375 }
    ]},
    { "titre": "Optimisation", "position": 8, "chapitres": [
      { "t": "8.1 Optimisation - Partie 1", "ty": "video", "v": "60402222-16ac-4321-b2e6-0228e9c5779f", "d": 2030 },
      { "t": "8.2 Optimisation - Partie 2", "ty": "video", "v": "5c8f8545-a515-4a08-a9bf-1d11a66e79a6", "d": 3760 },
      { "t": "Quiz - Optimisation",     "ty": "quiz" }
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
      select elem ->> 't'  as titre,
             elem ->> 'ty' as type,
             elem ->> 'v'  as video,   -- identifiant Bunny Stream, absent si non tournée
             (elem ->> 'd')::integer as duree,
             ord as position
      from jsonb_array_elements(m -> 'chapitres') with ordinality as t(elem, ord)
    loop
      if exists (
        select 1 from lecons where id_section = v_id_section and titre = ch.titre
      ) then
        continue;
      end if;

      insert into lecons (
        id_section, titre, type, contenu, description, position, duree_s,
        video_provider, video_provider_id, video_url, video_metadata, est_publiee
      )
      values (
        v_id_section,
        ch.titre,
        ch.type,
        -- Contenu et description laissés VIDES plutôt que remplis d'un texte
        -- d'attente. Les écrans savent déjà dire « le contenu de cet article
        -- sera publié prochainement » quand il n'y a rien : un texte posé en
        -- base, lui, survit à l'arrivée du vrai contenu et finit par mentir —
        -- 63 chapitres ont ainsi annoncé une « vidéo de démonstration » alors
        -- que leur vidéo définitive était en ligne depuis des semaines.
        null,
        null,
        ch.position,
        ch.duree,
        'bunny',
        ch.video,
        case
          when ch.video is not null
          then c_zone_cdn || ch.video || '/playlist.m3u8'
        end,
        '{}'::jsonb,
        -- Un chapitre vidéo n'est publié que si sa vidéo existe. Le publier sans
        -- elle ferait s'ouvrir un lecteur vide chez un apprenant qui a payé.
        -- Un seul chapitre est dans ce cas aujourd'hui : « 5.11 Partie 3 »,
        -- jamais tournée (voir VIDEOS-BUNNY.md).
        ch.type <> 'video' or ch.video is not null
      )
      returning id_lecon into v_id_lecon;

      -- Chapitre quiz : crée le quiz VIDE. Ses questions viennent de
      -- `seed_quiz_reels.sql`, source unique du contenu réel.
      --
      -- Ce script posait auparavant trois « questions de démonstration » avec
      -- leurs « bonne / mauvaise réponse » : un quiz factice se franchit, donc
      -- rien ne signalait qu'il n'avait jamais été rédigé. Un quiz sans
      -- question, lui, s'annonce comme tel à l'écran et bloque l'étape — ce
      -- qui est le comportement voulu tant que le contenu manque.
      if ch.type = 'quiz' then
        -- score_requis hérité du défaut de la colonne (80 %), règle unique.
        insert into quiz (id_formation, id_lecon, titre, position)
        values (v_id_formation, v_id_lecon, ch.titre, ch.position)
        returning id_quiz into v_id_quiz;
      end if;
    end loop;
  end loop;

  raise notice 'Chapitres des modules 1 à 3 créés ; 8 modules publiés.';
end $$;
