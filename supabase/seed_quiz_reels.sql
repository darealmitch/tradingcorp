-- =============================================================================
-- TradingCorp — Contenu RÉEL des quiz (source unique)
--
-- Chaque quiz est identifié par son titre + son module. Le script purge ses
-- questions puis réinsère celles décrites ci-dessous : il est IDEMPOTENT et
-- se complète au fil de l'eau (ajouter un objet au tableau `c_quiz`).
--
--   • options insérées dans l'ordre voulu par l'auteur ;
--   • une seule bonne réponse par question (choix_unique) ;
--   • `correcte` n'est jamais renvoyé au client (correction dans l'Edge
--     Function corriger-quiz), et l'ordre d'affichage est mélangé côté serveur
--     par reponses_publiques — la position ne trahit donc rien.
--
-- Orthographe et grammaire relues ; le sens et les bonnes réponses sont
-- rigoureusement ceux fournis par l'auteur.
--
-- Seuil de réussite : 80 % pour tous les quiz (migration 20260723100000).
-- =============================================================================

do $$
declare
  v_id_quiz     uuid;
  v_id_question uuid;
  z             jsonb;
  q             jsonb;
  r             jsonb;
  v_pos         integer;
  v_total       integer := 0;

  c_quiz constant jsonb := $json$
  [
    {
      "module": "Éducation financière",
      "quiz": "Quizz Les bases de la monnaie",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'une monnaie fiduciaire ?",
          "reponses": [
            { "texte": "Une monnaie qui repose sur la confiance", "correcte": true },
            { "texte": "Une monnaie 100 % en ligne",              "correcte": false },
            { "texte": "Une monnaie ancienne",                    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'inflation ?",
          "reponses": [
            { "texte": "La baisse du pouvoir d'achat",         "correcte": false },
            { "texte": "La baisse de la valeur de la monnaie", "correcte": true },
            { "texte": "Les deux",                             "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la déflation ?",
          "reponses": [
            { "texte": "La hausse du pouvoir d'achat", "correcte": true },
            { "texte": "La baisse des prix",           "correcte": false }
          ]
        },
        {
          "libelle": "La déflation est-elle une bonne ou une mauvaise chose ?",
          "reponses": [
            { "texte": "Bonne",          "correcte": false },
            { "texte": "Mauvaise",       "correcte": true },
            { "texte": "Je ne sais pas", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une monnaie scripturale ?",
          "reponses": [
            { "texte": "Une monnaie physique",    "correcte": false },
            { "texte": "Une cryptomonnaie",       "correcte": false },
            { "texte": "Une monnaie digitalisée", "correcte": true }
          ]
        }
      ]
    },
    {
      "module": "Éducation financière",
      "quiz": "Quizz retraite et assurances",
      "questions": [
        {
          "libelle": "Quel est le meilleur investissement ?",
          "reponses": [
            { "texte": "Le plus risqué",         "correcte": false },
            { "texte": "Le plus sûr",            "correcte": false },
            { "texte": "Celui qui te ressemble", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un rendement passif ?",
          "reponses": [
            { "texte": "De l'argent gagné grâce à un actif",   "correcte": true },
            { "texte": "De l'argent perdu à cause d'un passif", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'analyse technique ?",
          "reponses": [
            { "texte": "L'analyse des graphiques",     "correcte": true },
            { "texte": "L'analyse de l'économie",      "correcte": false },
            { "texte": "L'analyse des autres traders", "correcte": false }
          ]
        },
        {
          "libelle": "Combien y a-t-il de types d'investissement ?",
          "reponses": [
            { "texte": "1", "correcte": false },
            { "texte": "2", "correcte": true },
            { "texte": "3", "correcte": false }
          ]
        },
        {
          "libelle": "Comment devenir plus riche ?",
          "reponses": [
            { "texte": "Avoir plus d'actifs que de passifs", "correcte": true },
            { "texte": "Avoir plus de passifs que d'actifs", "correcte": false },
            { "texte": "Braquer une banque",                 "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Éducation financière",
      "quiz": "Quizz éducation financière",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'un actif ?",
          "reponses": [
            { "texte": "Un achat qui prend de la valeur", "correcte": true },
            { "texte": "Un achat qui perd de la valeur",  "correcte": false },
            { "texte": "Les deux",                        "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'ancêtre des banques ?",
          "reponses": [
            { "texte": "Les banques centrales", "correcte": false },
            { "texte": "Les orfèvres",          "correcte": true },
            { "texte": "Les banques d'État",    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un passif ?",
          "reponses": [
            { "texte": "Un achat qui perd de la valeur",  "correcte": true },
            { "texte": "Un achat qui prend de la valeur", "correcte": false },
            { "texte": "Aucun des deux",                  "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'ancêtre de l'argent ?",
          "reponses": [
            { "texte": "Le troc",                        "correcte": false },
            { "texte": "Les emprunts",                   "correcte": false },
            { "texte": "Il y a toujours eu de l'argent", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une capitalisation boursière ?",
          "reponses": [
            { "texte": "Le chiffre d'affaires d'une société",                        "correcte": false },
            { "texte": "Son nombre d'actions en circulation multiplié par son prix", "correcte": true },
            { "texte": "Le bénéfice d'une société",                                  "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Éducation financière",
      "quiz": "Quizz psychologie en investissement",
      "questions": [
        {
          "libelle": "L'investissement est-il une activité risquée ?",
          "reponses": [
            { "texte": "Oui", "correcte": true },
            { "texte": "Non", "correcte": false }
          ]
        },
        {
          "libelle": "Les risques liés à l'investissement sont-ils :",
          "reponses": [
            { "texte": "Financiers", "correcte": false },
            { "texte": "Mentaux",    "correcte": false },
            { "texte": "Corporels",  "correcte": false },
            { "texte": "Les 3",      "correcte": true }
          ]
        },
        {
          "libelle": "Combien a-t-on vu de biais ?",
          "reponses": [
            { "texte": "4", "correcte": false },
            { "texte": "5", "correcte": false },
            { "texte": "6", "correcte": true }
          ]
        },
        {
          "libelle": "De quels biais a-t-on parlé ?",
          "reponses": [
            { "texte": "Confirmation, ancrage, surconfiance, représentativité, disponibilité, aversion à la perte", "correcte": true },
            { "texte": "Confirmation, peur, instabilité, aversion au risque, confiance, paranoïa",                   "correcte": false },
            { "texte": "Ancrage, disponibilité, surconfiance, modestie, frein, confirmation",                        "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Fiscalité",
      "quiz": "Quizz déclaration d'impôts",
      "questions": [
        {
          "libelle": "Que doit-on déclarer ?",
          "reponses": [
            { "texte": "Ses plus-values",  "correcte": false },
            { "texte": "Ses moins-values", "correcte": false },
            { "texte": "Les deux",         "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que la technique du 50/20/20/10 ?",
          "reponses": [
            { "texte": "50 % de charges, 20 % d'économies, 20 % d'investissement, 10 % de fonds d'urgence", "correcte": true },
            { "texte": "50 % d'investissement, 20 % de charges, 20 % de fonds d'urgence, 10 % d'économies", "correcte": false },
            { "texte": "Aucune des deux",                                                                   "correcte": false }
          ]
        },
        {
          "libelle": "De combien est la flat tax ?",
          "reponses": [
            { "texte": "30 %", "correcte": true },
            { "texte": "35 %", "correcte": false },
            { "texte": "40 %", "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'impôt le plus répandu ?",
          "reponses": [
            { "texte": "L'impôt sur le revenu",    "correcte": false },
            { "texte": "L'impôt sur les sociétés", "correcte": false },
            { "texte": "La TVA",                   "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un ETF ?",
          "reponses": [
            { "texte": "Un « panier d'actions »",            "correcte": true },
            { "texte": "Un groupe (comme LVMH, Bouygues…)",  "correcte": false },
            { "texte": "Un produit fiscal",                  "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Fiscalité",
      "quiz": "Quizz Optimisation fiscale",
      "questions": [
        {
          "libelle": "L'optimisation fiscale, c'est…",
          "reponses": [
            { "texte": "Des manières légales de réduire ses impôts",   "correcte": true },
            { "texte": "Des manières illégales de réduire ses impôts", "correcte": false },
            { "texte": "Fuir un pays pour ne pas payer d'impôts",      "correcte": false }
          ]
        },
        {
          "libelle": "À quoi dois-tu faire attention quand tu veux optimiser ta fiscalité ?",
          "reponses": [
            { "texte": "Ton taux d'imposition", "correcte": false },
            { "texte": "Ton statut juridique",  "correcte": false },
            { "texte": "Les deux",              "correcte": true }
          ]
        },
        {
          "libelle": "Anticiper tes dépenses est-il une pratique utile ?",
          "reponses": [
            { "texte": "Oui",       "correcte": true },
            { "texte": "Non",       "correcte": false },
            { "texte": "Ça dépend", "correcte": false }
          ]
        },
        {
          "libelle": "En général, quel va être le statut juridique des sociétés qui entrent en bourse ?",
          "reponses": [
            { "texte": "SA",   "correcte": true },
            { "texte": "SAS",  "correcte": false },
            { "texte": "SARL", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Les marchés",
      "quiz": "Quizz qu'est ce que la bourse ?",
      "questions": [
        {
          "libelle": "Quelle est la première étape avant d'investir ?",
          "reponses": [
            { "texte": "Acheter des actions au hasard",                             "correcte": false },
            { "texte": "Établir ses objectifs financiers et son profil de risque",  "correcte": true },
            { "texte": "Suivre les tendances des réseaux sociaux",                  "correcte": false },
            { "texte": "Investir uniquement dans des produits sans risque",         "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la diversification en investissement ?",
          "reponses": [
            { "texte": "Placer tout son capital dans un seul actif",                 "correcte": false },
            { "texte": "Répartir ses investissements sur plusieurs types d'actifs",  "correcte": true },
            { "texte": "Se spécialiser dans un domaine d'investissement",            "correcte": false },
            { "texte": "Suivre les conseils d'un seul expert",                       "correcte": false }
          ]
        },
        {
          "libelle": "Quel type d'investissement est généralement considéré comme le moins risqué ?",
          "reponses": [
            { "texte": "Les actions",               "correcte": false },
            { "texte": "Les obligations de l'État", "correcte": true },
            { "texte": "Les cryptomonnaies",        "correcte": false },
            { "texte": "Les matières premières",    "correcte": false }
          ]
        },
        {
          "libelle": "Quel est le principal avantage de l'investissement à long terme ?",
          "reponses": [
            { "texte": "La possibilité de faire des bénéfices rapides",                                          "correcte": false },
            { "texte": "L'effet de capitalisation et la réduction des risques liés aux fluctuations à court terme", "correcte": true },
            { "texte": "La minimisation des impôts dès la première année",                                       "correcte": false },
            { "texte": "Une garantie contre toute perte",                                                        "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Les marchés",
      "quiz": "Quizz qu'est ce que la crypto ?",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'une banque centrale ?",
          "reponses": [
            { "texte": "Une banque au milieu d'une ville",                             "correcte": false },
            { "texte": "Une banque nationale",                                         "correcte": false },
            { "texte": "L'organisme qui régule les banques et l'émission de monnaie",  "correcte": true }
          ]
        },
        {
          "libelle": "Bitcoin est-il la première cryptomonnaie ?",
          "reponses": [
            { "texte": "Oui", "correcte": false },
            { "texte": "Non", "correcte": true }
          ]
        },
        {
          "libelle": "Sur quel consensus se base Ether ?",
          "reponses": [
            { "texte": "Proof of work",   "correcte": false },
            { "texte": "Proof of stake",  "correcte": true },
            { "texte": "Proof of useful", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un smart contract ?",
          "reponses": [
            { "texte": "Un contrat intelligent sur la blockchain", "correcte": true },
            { "texte": "Un contrat de petite taille",              "correcte": false },
            { "texte": "Un type de minage",                        "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le mining ?",
          "reponses": [
            { "texte": "La sécurisation du réseau",            "correcte": true },
            { "texte": "La recherche de métaux dans une mine", "correcte": false },
            { "texte": "La création de cryptomonnaie",         "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un nœud ?",
          "reponses": [
            { "texte": "Un lien entre deux ou plusieurs cordes", "correcte": false },
            { "texte": "Un ordinateur",                          "correcte": true },
            { "texte": "La blockchain",                          "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Les marchés",
      "quiz": "Quizz La blockchain",
      "questions": [
        {
          "libelle": "Qu'est-ce que le trilemme de la blockchain ?",
          "reponses": [
            { "texte": "Scalabilité, décentralisation, sécurité", "correcte": true },
            { "texte": "Rapidité, décentralisation, pollution",   "correcte": false },
            { "texte": "Décentralisation, sécurité, coûts",       "correcte": false }
          ]
        },
        {
          "libelle": "Que faut-il à la blockchain pour être plus rapide ?",
          "reponses": [
            { "texte": "De la décentralisation", "correcte": false },
            { "texte": "De l'argent",            "correcte": false },
            { "texte": "De la sécurité",         "correcte": true }
          ]
        },
        {
          "libelle": "Que faut-il à la blockchain pour être sécurisée ?",
          "reponses": [
            { "texte": "De l'argent",            "correcte": false },
            { "texte": "De la décentralisation", "correcte": false },
            { "texte": "De la scalabilité",      "correcte": true }
          ]
        },
        {
          "libelle": "Que veut dire être décentralisé ?",
          "reponses": [
            { "texte": "Qu'il n'y a pas de centre",                                 "correcte": false },
            { "texte": "Que le réseau est indépendant",                             "correcte": false },
            { "texte": "Que le réseau fonctionne sans intermédiaire de confiance",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un layer 2 ?",
          "reponses": [
            { "texte": "Une blockchain qui vient se greffer sur une blockchain existante",  "correcte": true },
            { "texte": "Toute blockchain autre que celle de Bitcoin",                       "correcte": false },
            { "texte": "Une solution centralisée pour régler le trilemme de la blockchain", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Les marchés",
      "quiz": "Quizz NFT",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'un NFT ?",
          "reponses": [
            { "texte": "Un token non fongible",                             "correcte": false },
            { "texte": "De l'art numérique",                                "correcte": false },
            { "texte": "Un token avec un certificat de propriété en ligne",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qui fait d'un NFT un NFT ?",
          "reponses": [
            { "texte": "Son certificat d'authenticité", "correcte": true },
            { "texte": "Sa fongibilité",                "correcte": false },
            { "texte": "Sa traçabilité",                "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le métavers ?",
          "reponses": [
            { "texte": "Un monde virtuel en ligne",                   "correcte": false },
            { "texte": "Un monde virtuel en ligne sur la blockchain", "correcte": true },
            { "texte": "Un film",                                     "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Web 3 ?",
          "reponses": [
            { "texte": "Un web décentralisé",                                     "correcte": true },
            { "texte": "Un web décentralisé sur lequel tu peux faire ce que tu veux", "correcte": false },
            { "texte": "Une mise à jour du dark web",                             "correcte": false }
          ]
        },
        {
          "libelle": "Les NFT sont-ils des outils de spéculation ?",
          "reponses": [
            { "texte": "Oui",                          "correcte": false },
            { "texte": "Non",                          "correcte": false },
            { "texte": "Les deux réponses sont vraies", "correcte": true }
          ]
        },
        {
          "libelle": "Les NFT ont-ils une utilité dans le monde réel ?",
          "reponses": [
            { "texte": "Oui",                           "correcte": true },
            { "texte": "Non",                           "correcte": false },
            { "texte": "Les deux réponses sont vraies", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Les marchés",
      "quiz": "Quizz Web 3",
      "questions": [
        {
          "libelle": "Qu'y avait-il avant le Web 3 ?",
          "reponses": [
            { "texte": "Le Web 1", "correcte": false },
            { "texte": "Le Web 2", "correcte": true },
            { "texte": "Rien",     "correcte": false }
          ]
        },
        {
          "libelle": "Quelle est la principale différence entre le Web 3 et ses prédécesseurs ?",
          "reponses": [
            { "texte": "La décentralisation", "correcte": true },
            { "texte": "L'interopérabilité",  "correcte": false },
            { "texte": "L'anonymat",          "correcte": false }
          ]
        },
        {
          "libelle": "Cette mise à jour est-elle bonne pour les GAFAM ?",
          "reponses": [
            { "texte": "Oui", "correcte": false },
            { "texte": "Non", "correcte": true }
          ]
        }
      ]
    },
    {
      "module": "Les marchés",
      "quiz": "Quizz crypto",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'un narratif ?",
          "reponses": [
            { "texte": "Un domaine de cryptomonnaie",    "correcte": true },
            { "texte": "Une histoire",                   "correcte": false },
            { "texte": "Les deux réponses sont vraies",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'adoption ?",
          "reponses": [
            { "texte": "Un usage étatique de la blockchain",              "correcte": false },
            { "texte": "L'acceptation de la cryptomonnaie par la masse",  "correcte": true },
            { "texte": "Avoir un enfant qui n'est pas le sien",           "correcte": false }
          ]
        },
        {
          "libelle": "Pourquoi le gaming pourrait-il être la porte d'adoption de la crypto ?",
          "reponses": [
            { "texte": "Parce que les enfants en parleront à leurs parents", "correcte": false },
            { "texte": "Ça ne sera pas la porte d'adoption",                 "correcte": false },
            { "texte": "En raison de la taille du marché du gaming",         "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'IBC ?",
          "reponses": [
            { "texte": "Le consensus de la blockchain",                          "correcte": false },
            { "texte": "Un moyen pour les blockchains de communiquer entre elles", "correcte": true },
            { "texte": "La solution au trilemme de la blockchain",                "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Les marchés",
      "quiz": "Quizz Adoption",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'un airdrop ?",
          "reponses": [
            { "texte": "Un système de rémunération sur la blockchain",                       "correcte": false },
            { "texte": "Le moyen qu'utilise un projet pour rémunérer les acteurs du projet", "correcte": true },
            { "texte": "Un ensemble de tâches réalisées pour recevoir des tokens gratuits",  "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'avantage des airdrops ?",
          "reponses": [
            { "texte": "La gratuité",             "correcte": false },
            { "texte": "La rapidité",             "correcte": false },
            { "texte": "Des tâches souvent simples", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une lowcap ?",
          "reponses": [
            { "texte": "Une cryptomonnaie à moins de 100 M de marketcap", "correcte": true },
            { "texte": "Une cryptomonnaie qui n'est pas connue",          "correcte": false },
            { "texte": "Un projet qui vient de sortir",                   "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'avantage des lowcaps ?",
          "reponses": [
            { "texte": "Un risque modéré",             "correcte": false },
            { "texte": "Un potentiel de gros rendement", "correcte": true },
            { "texte": "De faibles coûts",             "correcte": false }
          ]
        },
        {
          "libelle": "Un ETF crypto, bonne ou mauvaise chose ?",
          "reponses": [
            { "texte": "Bonne",    "correcte": true },
            { "texte": "Mauvaise", "correcte": false }
          ]
        },
        {
          "libelle": "Que signifie un ETF dans le secteur des cryptos ?",
          "reponses": [
            { "texte": "Que les institutions cherchent à détourner l'usage de Bitcoin", "correcte": false },
            { "texte": "Rien",                                                          "correcte": false },
            { "texte": "Un signe d'adoption par les institutions financières",          "correcte": true }
          ]
        }
      ]
    }
  ]
  $json$::jsonb;
begin
  for z in select * from jsonb_array_elements(c_quiz)
  loop
    select q2.id_quiz into v_id_quiz
    from quiz q2
    join lecons l on l.id_lecon = q2.id_lecon
    join sections s on s.id_section = l.id_section
    where q2.titre = (z ->> 'quiz')
      and s.titre = (z ->> 'module');

    if v_id_quiz is null then
      raise exception 'Quiz « % » (module « % ») introuvable.', z ->> 'quiz', z ->> 'module';
    end if;

    delete from questions where id_quiz = v_id_quiz;

    v_pos := 0;
    for q in select * from jsonb_array_elements(z -> 'questions')
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

    v_total := v_total + 1;
    raise notice 'Quiz « % » : % questions.', z ->> 'quiz', v_pos;
  end loop;

  raise notice '% quiz mis à jour.', v_total;
end $$;
