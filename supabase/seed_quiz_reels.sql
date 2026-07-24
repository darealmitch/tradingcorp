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
      "quiz": "Quiz - Les bases de la monnaie",
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
      "quiz": "Quiz - Retraite et assurances",
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
      "quiz": "Quiz - Éducation financière",
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
      "quiz": "Quiz - Psychologie en investissement",
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
      "quiz": "Quiz - Déclaration d'impôts",
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
      "quiz": "Quiz - Optimisation fiscale",
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
      "quiz": "Quiz - Qu'est-ce que la bourse ?",
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
      "quiz": "Quiz - Qu'est-ce que la crypto ?",
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
      "quiz": "Quiz - La blockchain",
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
      "quiz": "Quiz - NFT",
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
      "quiz": "Quiz - Web 3",
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
      "quiz": "Quiz - Crypto",
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
      "quiz": "Quiz - Adoption",
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
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Initiation aux graphiques",
      "questions": [
        {
          "libelle": "Que signifie une bougie rouge ?",
          "reponses": [
            { "texte": "Que le prix a baissé",        "correcte": true },
            { "texte": "Que le prix est monté",       "correcte": false },
            { "texte": "Que le prix s'est stabilisé", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une tendance ?",
          "reponses": [
            { "texte": "Le sens dans lequel va le graphique", "correcte": false },
            { "texte": "Le sens dans lequel va le prix",      "correcte": false },
            { "texte": "Les deux réponses sont vraies",       "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une figure chartiste ?",
          "reponses": [
            { "texte": "Un mouvement de prix",                                              "correcte": false },
            { "texte": "Un mouvement de prix qui peut prédire le sens que va prendre le marché", "correcte": true },
            { "texte": "Les deux réponses sont vraies",                                     "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un indicateur technique ?",
          "reponses": [
            { "texte": "Un algorithme qui nous aide à prédire le marché",     "correcte": false },
            { "texte": "Un outil permettant d'assister à la prise de décision", "correcte": false },
            { "texte": "Un outil de polarité qui synthétise les informations", "correcte": false },
            { "texte": "Toutes les réponses sont vraies",                      "correcte": true }
          ]
        },
        {
          "libelle": "Que signifie BTCUSD ?",
          "reponses": [
            { "texte": "Le prix du Bitcoin en dollars",                        "correcte": true },
            { "texte": "Le prix du dollar exprimé en Bitcoin",                 "correcte": false },
            { "texte": "Le prix du Bitcoin converti en dollars canadiens",     "correcte": false },
            { "texte": "Le taux de change entre deux stablecoins adossés au dollar", "correcte": false }
          ]
        },
        {
          "libelle": "EURUSD",
          "reponses": [
            { "texte": "Est une question", "correcte": true },
            { "texte": "Une affirmation",  "correcte": false },
            { "texte": "Une information",  "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Trading",
      "questions": [
        {
          "libelle": "Qu'est-ce que le trading ?",
          "reponses": [
            { "texte": "Une activité d'achat et de vente à découvert", "correcte": true },
            { "texte": "Une activité d'investissement",               "correcte": false },
            { "texte": "Une activité de spéculation",                 "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le scalping ?",
          "reponses": [
            { "texte": "Le fait de maintenir ses positions de trading 1 à 2 jours",              "correcte": false },
            { "texte": "Le fait de maintenir ses positions de trading sur 1 à 2 mois",           "correcte": false },
            { "texte": "Le fait de maintenir ses positions de trading sur de petites unités de temps", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un broker ?",
          "reponses": [
            { "texte": "C'est un trader retail",                                    "correcte": false },
            { "texte": "C'est une entité permettant de mettre les retails en face du marché", "correcte": true },
            { "texte": "C'est une banque fournisseuse de liquidité",               "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un trade ?",
          "reponses": [
            { "texte": "De la spéculation",                                  "correcte": false },
            { "texte": "Le fait d'acheter ou de vendre un actif à découvert", "correcte": true },
            { "texte": "Investir sur un actif qu'on ne possède pas vraiment", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un CFD ?",
          "reponses": [
            { "texte": "Un outil qui permet de trader sur un contrat sans posséder l'actif sous-jacent", "correcte": true },
            { "texte": "Un outil qui permet de trader sur un contrat où le broker possède le sous-jacent", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un effet de levier ?",
          "reponses": [
            { "texte": "Le coefficient multiplicateur des gains et des pertes",   "correcte": true },
            { "texte": "Le coefficient multiplicateur des gains",                 "correcte": false },
            { "texte": "Un outil permettant de trader des actifs sans avoir d'argent", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Fondamentaux",
      "questions": [
        {
          "libelle": "Qu'est-ce que le money management ?",
          "reponses": [
            { "texte": "La gestion de la taille d'une position", "correcte": true },
            { "texte": "La gestion d'un trade",                  "correcte": false },
            { "texte": "La gestion d'un compte de trading",      "correcte": false }
          ]
        },
        {
          "libelle": "Combien y a-t-il de types d'ordre ?",
          "reponses": [
            { "texte": "4", "correcte": false },
            { "texte": "5", "correcte": false },
            { "texte": "6", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le forex ?",
          "reponses": [
            { "texte": "Le marché des changes",          "correcte": false },
            { "texte": "Le marché des devises mondiales", "correcte": true },
            { "texte": "Le marché de la monnaie",         "correcte": false }
          ]
        },
        {
          "libelle": "Quelle est l'unité qui mesure la distance parcourue par un trade ?",
          "type": "choix_multiple",
          "reponses": [
            { "texte": "Le dollar", "correcte": false },
            { "texte": "Le point",  "correcte": true },
            { "texte": "Le pips",   "correcte": true }
          ]
        },
        {
          "libelle": "Peut-on trader sur les marchés sur lesquels on a investi ?",
          "reponses": [
            { "texte": "Oui",         "correcte": false },
            { "texte": "Non",         "correcte": false },
            { "texte": "Pas toujours", "correcte": true }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Fibonacci",
      "questions": [
        {
          "libelle": "À quoi fait référence la suite de Fibonacci ?",
          "reponses": [
            { "texte": "Au chiffre univers",            "correcte": true },
            { "texte": "À une suite arithmétique",      "correcte": false },
            { "texte": "Aux chiffres les plus utilisés", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une propfirm ?",
          "reponses": [
            { "texte": "Une société de trading",                                    "correcte": false },
            { "texte": "Une société qui te fournit du capital en échange de tests",  "correcte": true },
            { "texte": "Un type de broker",                                          "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le retracement de Fibonacci ?",
          "reponses": [
            { "texte": "À trouver des points d'entrée et de sortie pertinents", "correcte": false },
            { "texte": "À trouver des points d'intérêt",                        "correcte": true },
            { "texte": "À se rassurer",                                         "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le prolongement selon la tendance de Fibonacci ?",
          "type": "choix_multiple",
          "reponses": [
            { "texte": "À identifier les potentielles zones de TP",     "correcte": true },
            { "texte": "À identifier les potentielles zones de SL",     "correcte": true },
            { "texte": "À identifier les potentielles zones d'entrée",  "correcte": true }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Contextes de marchés",
      "questions": [
        {
          "libelle": "Combien y a-t-il de contextes de marché ?",
          "reponses": [
            { "texte": "1", "correcte": false },
            { "texte": "2", "correcte": false },
            { "texte": "3", "correcte": false },
            { "texte": "4", "correcte": true },
            { "texte": "5", "correcte": false }
          ]
        },
        {
          "libelle": "Les contextes de marché ont-ils un ordre précis ou surgissent-ils de manière aléatoire ?",
          "reponses": [
            { "texte": "Aléatoire", "correcte": false },
            { "texte": "Ordre",     "correcte": true }
          ]
        },
        {
          "libelle": "Que se passe-t-il après un retracement ?",
          "reponses": [
            { "texte": "Expansion",     "correcte": true },
            { "texte": "Consolidation", "correcte": false },
            { "texte": "Reversal",      "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Concepts de base",
      "questions": [
        {
          "libelle": "Qu'est-ce que l'OTE ?",
          "reponses": [
            { "texte": "Le point parfait pour TP", "correcte": false },
            { "texte": "Le point parfait pour SL", "correcte": false },
            { "texte": "Le point parfait de PE",   "correcte": true }
          ]
        },
        {
          "libelle": "Les LRLR sont des points ?",
          "reponses": [
            { "texte": "Vulnérables", "correcte": true },
            { "texte": "Protégés",    "correcte": false },
            { "texte": "Égaux",       "correcte": false }
          ]
        },
        {
          "libelle": "La liquidité interne est quand le chart se trouve entre :",
          "reponses": [
            { "texte": "Le précédent plus haut et plus bas", "correcte": true },
            { "texte": "La précédente figure chartiste",     "correcte": false },
            { "texte": "Les moyennes mobiles",               "correcte": false }
          ]
        },
        {
          "libelle": "Le carnet d'ordre est :",
          "reponses": [
            { "texte": "Le carnet où sont inscrites toutes les transactions sur la blockchain", "correcte": false },
            { "texte": "Le cahier de trading",                                                  "correcte": false },
            { "texte": "L'endroit où sont affichées toutes les demandes de vente et d'achat",   "correcte": true }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Structures",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'une structure ?",
          "reponses": [
            { "texte": "Un schéma de prix qui permet de prédire le futur",       "correcte": false },
            { "texte": "Un schéma de prix qui nous indique ce qui pourrait se passer", "correcte": true },
            { "texte": "Un schéma de prix",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qui différencie une AMD d'une Accumulation / Distribution ?",
          "reponses": [
            { "texte": "Les patterns",  "correcte": false },
            { "texte": "Le chartisme",  "correcte": false },
            { "texte": "La liquidité",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que la fractalité ?",
          "reponses": [
            { "texte": "Quand une structure se brise",                                    "correcte": false },
            { "texte": "Le fait que des figures se répètent à différents intervalles de temps", "correcte": true },
            { "texte": "Une prise de liquidité",                                          "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une timeframe ?",
          "reponses": [
            { "texte": "Une unité de temps",                    "correcte": true },
            { "texte": "Le temps que va prendre un trade",      "correcte": false },
            { "texte": "L'heure à laquelle on va prendre un trade", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Kill zones",
      "questions": [
        {
          "libelle": "Combien y a-t-il de sessions ?",
          "reponses": [
            { "texte": "1", "correcte": false },
            { "texte": "2", "correcte": false },
            { "texte": "3", "correcte": false },
            { "texte": "4", "correcte": true }
          ]
        },
        {
          "libelle": "Quelle est la session la plus importante ?",
          "reponses": [
            { "texte": "Asie",     "correcte": true },
            { "texte": "New York", "correcte": false },
            { "texte": "Londres",  "correcte": false }
          ]
        },
        {
          "libelle": "Que font les sessions de Londres et New York ?",
          "reponses": [
            { "texte": "Ils vont dans le même sens",                     "correcte": false },
            { "texte": "Ils break l'asia session",                       "correcte": true },
            { "texte": "Ils suivent la tendance donnée par l'asia session", "correcte": false }
          ]
        },
        {
          "libelle": "À quelle heure se déroule l'asia session ?",
          "reponses": [
            { "texte": "20-02h", "correcte": false },
            { "texte": "02-09h", "correcte": false },
            { "texte": "00-09h", "correcte": true }
          ]
        },
        {
          "libelle": "À quelle heure sont les meilleures entrées pour New York ?",
          "reponses": [
            { "texte": "13h30 - 14h / 14h30 - 15h", "correcte": false },
            { "texte": "13 - 13h30 / 14h30 - 15h",  "correcte": true },
            { "texte": "12h30 - 13h / 13h30 - 14h", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Days of week",
      "questions": [
        {
          "libelle": "Qu'est-ce que le PDH/L ?",
          "reponses": [
            { "texte": "Le plus haut/bas du jour",       "correcte": true },
            { "texte": "Le plus haut/bas de la semaine", "correcte": false },
            { "texte": "Le plus haut/bas du mois",       "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un big figure ?",
          "reponses": [
            { "texte": "Un point où le prix se termine par 000", "correcte": true },
            { "texte": "Une grande figure chartiste",            "correcte": false },
            { "texte": "Aucune des deux réponses",               "correcte": false }
          ]
        },
        {
          "libelle": "Quels jours vas-tu généralement chercher les plus hauts et les plus bas de la semaine ?",
          "reponses": [
            { "texte": "Lundi / Mardi",     "correcte": false },
            { "texte": "Mardi / Mercredi",  "correcte": true },
            { "texte": "Mercredi / Jeudi",  "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Liquidités",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'une liquidité ?",
          "reponses": [
            { "texte": "Un point d'intérêt",               "correcte": true },
            { "texte": "De l'eau",                         "correcte": false },
            { "texte": "L'effet de levier des positions",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un EQX ?",
          "reponses": [
            { "texte": "Un pattern indiquant une expansion",     "correcte": false },
            { "texte": "Un pattern indiquant un reversal",       "correcte": true },
            { "texte": "Un pattern indiquant une consolidation", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'annonce un orderblock ?",
          "reponses": [
            { "texte": "Une consolidation", "correcte": false },
            { "texte": "Un reversal",       "correcte": false },
            { "texte": "Une expansion",     "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un BSL/SSL ?",
          "reponses": [
            { "texte": "Un pattern indiquant une expansion",     "correcte": false },
            { "texte": "Un pattern indiquant un reversal",       "correcte": true },
            { "texte": "Un pattern indiquant une consolidation", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un orderblock ?",
          "reponses": [
            { "texte": "Le dernier buy avant le sell",  "correcte": false },
            { "texte": "Le dernier sell avant le buy",  "correcte": false },
            { "texte": "Les deux réponses sont vraies", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le MTB ?",
          "reponses": [
            { "texte": "Un pattern d'aide à l'entrée en position",    "correcte": true },
            { "texte": "Un pattern d'aide à la sortie de position",   "correcte": false },
            { "texte": "Un pattern de retracement",                   "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le seek & destroy ?",
          "reponses": [
            { "texte": "Prévenir la prochaine AMD",                  "correcte": false },
            { "texte": "Anticiper les prochaines liquidités",        "correcte": true },
            { "texte": "Anticiper le biais de la prochaine session", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Mes stratégies",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'une moyenne mobile ?",
          "reponses": [
            { "texte": "La pondération des dernières cotations",       "correcte": true },
            { "texte": "La pondération du market cap",                 "correcte": false },
            { "texte": "La pondération des SL et des TP sur le chart", "correcte": false }
          ]
        },
        {
          "libelle": "Comment s'appelle-t-il quand deux moyennes mobiles se croisent à la hausse ?",
          "reponses": [
            { "texte": "Death cross",  "correcte": false },
            { "texte": "Golden cross", "correcte": true },
            { "texte": "High cross",   "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le market profile ?",
          "reponses": [
            { "texte": "Un pattern",                                                          "correcte": false },
            { "texte": "Un indicateur qui montre où est la liquidité",                        "correcte": false },
            { "texte": "Un indicateur qui résume et simplifie les derniers jours de pondération", "correcte": true }
          ]
        },
        {
          "libelle": "Comment s'appelle la zone où il y a eu le plus de transactions sur le market profile ?",
          "reponses": [
            { "texte": "La high area",         "correcte": false },
            { "texte": "La zone de haute valeur", "correcte": false },
            { "texte": "La value area",        "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le volume profile ?",
          "reponses": [
            { "texte": "Un indicateur qui montre les zones de support résistance", "correcte": false },
            { "texte": "Un indicateur qui montre les zones de TP et SL",           "correcte": false },
            { "texte": "Un indicateur qui montre où il y a eu le plus de liquidité", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le RSI ?",
          "reponses": [
            { "texte": "Un indicateur de surachat et de survente", "correcte": true },
            { "texte": "Un indicateur de tendance",                "correcte": false },
            { "texte": "Un indicateur de volatilité",              "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Trading",
      "quiz": "Quiz - Options",
      "questions": [
        {
          "libelle": "À quoi servent les options ?",
          "reponses": [
            { "texte": "Couvrir une position",    "correcte": false },
            { "texte": "Amplifier une position",  "correcte": false },
            { "texte": "Couvrir un portefeuille", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que les greeks ?",
          "reponses": [
            { "texte": "Alpha, beta, gamma, theta, vega", "correcte": false },
            { "texte": "Alpha, beta, gamma, rho",         "correcte": false },
            { "texte": "Delta, vega, gamma, rho, theta",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un alpha ?",
          "reponses": [
            { "texte": "Le chef d'une meute de loups",           "correcte": false },
            { "texte": "La mesure de la volatilité d'un actif",  "correcte": false },
            { "texte": "L'actif de référence d'un portefeuille", "correcte": true }
          ]
        },
        {
          "libelle": "À quoi sert le delta ?",
          "reponses": [
            { "texte": "Voir la volatilité sous-jacente",                              "correcte": false },
            { "texte": "Voir la corrélation au sous-jacent en termes de variation de prix", "correcte": true },
            { "texte": "Voir l'érosion temporelle",                                    "correcte": false }
          ]
        },
        {
          "libelle": "Comment s'appelle le fait de couvrir un portefeuille avec des options ?",
          "reponses": [
            { "texte": "Le hedging",    "correcte": true },
            { "texte": "La couverture", "correcte": false },
            { "texte": "L'optionage",   "correcte": false }
          ]
        },
        {
          "libelle": "À quoi servent les options ?",
          "reponses": [
            { "texte": "À couvrir un portefeuille sur des pertes latentes", "correcte": true },
            { "texte": "À faire du trading différemment",                   "correcte": false },
            { "texte": "À trader de manière plus sécuritaire",              "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le theta ?",
          "reponses": [
            { "texte": "Calculer la volatilité",                 "correcte": false },
            { "texte": "Calculer le rendement ajusté au risque", "correcte": false },
            { "texte": "Calculer l'érosion temporelle",          "correcte": true }
          ]
        },
        {
          "libelle": "À quoi sert le ratio de Sharpe ?",
          "reponses": [
            { "texte": "Calculer l'écart type",                    "correcte": false },
            { "texte": "Calculer la performance ajustée au risque", "correcte": true },
            { "texte": "Calculer la différence entre le plus haut et le plus bas d'un actif sur une période donnée", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une covariance ?",
          "reponses": [
            { "texte": "La différence de volatilité implicite entre deux sous-jacents", "correcte": true },
            { "texte": "La différence entre la volatilité du même actif sur deux horizons de temps différents", "correcte": false },
            { "texte": "Ni l'un ni l'autre", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Analyse fondamentale",
      "quiz": "Quiz - Économie",
      "questions": [
        {
          "libelle": "Quelle est la devise majeure du monde ?",
          "reponses": [
            { "texte": "Euro",   "correcte": false },
            { "texte": "Dollar", "correcte": true },
            { "texte": "Yen",    "correcte": false }
          ]
        },
        {
          "libelle": "Que signifie dovish ?",
          "reponses": [
            { "texte": "Que la banque est encline à augmenter les taux", "correcte": false },
            { "texte": "Que la banque est encline à baisser les taux",   "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une opération d'open market ?",
          "reponses": [
            { "texte": "Quand de nouveaux titres sont émis pour la première fois sur le marché", "correcte": false },
            { "texte": "Quand la banque centrale achète un titre pour stabiliser le cours",       "correcte": true },
            { "texte": "Quand de nouveaux intervenants arrivent sur le marché",                   "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le risk on ?",
          "reponses": [
            { "texte": "Quand les investisseurs sont enclins à prendre du risque", "correcte": true },
            { "texte": "Quand les investisseurs deviennent de nature prudente",    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la balance commerciale ?",
          "reponses": [
            { "texte": "La différence entre les importations et les exportations dans le pays", "correcte": true },
            { "texte": "Le total d'importation dans un pays",                                   "correcte": false },
            { "texte": "Le total d'exportation d'un pays",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'impact du déficit sur l'économie ?",
          "reponses": [
            { "texte": "Il cause des augmentations d'impôts qui pèsent sur les entreprises", "correcte": true },
            { "texte": "Il peut faire augmenter l'inflation",                                "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'inflation finalement ?",
          "reponses": [
            { "texte": "La hausse des prix",                        "correcte": false },
            { "texte": "La baisse de la valeur de l'argent",        "correcte": false },
            { "texte": "Un déséquilibre entre l'offre et la demande", "correcte": false },
            { "texte": "Toutes ces réponses sont vraies",           "correcte": true }
          ]
        }
      ]
    },
    {
      "module": "Analyse fondamentale",
      "quiz": "Quiz - Leaders économiques",
      "questions": [
        {
          "libelle": "Quel est le leader économique européen ?",
          "reponses": [
            { "texte": "France",    "correcte": false },
            { "texte": "Allemagne", "correcte": true },
            { "texte": "Suisse",    "correcte": false }
          ]
        },
        {
          "libelle": "Quel est le leader économique mondial ?",
          "reponses": [
            { "texte": "Russie",      "correcte": false },
            { "texte": "États-Unis",  "correcte": true },
            { "texte": "Japon",       "correcte": false }
          ]
        },
        {
          "libelle": "Le botseva est l'indice de quel pays ?",
          "reponses": [
            { "texte": "Amérique latine", "correcte": false },
            { "texte": "Brésil",          "correcte": true },
            { "texte": "Argentine",       "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'indice du dollar ?",
          "reponses": [
            { "texte": "DXYX", "correcte": false },
            { "texte": "DXX",  "correcte": false },
            { "texte": "DXY",  "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le principal secteur de dominance des États-Unis ?",
          "reponses": [
            { "texte": "La technologie", "correcte": true },
            { "texte": "La médecine",    "correcte": false },
            { "texte": "La manufacture", "correcte": false }
          ]
        },
        {
          "libelle": "Le FTSE250 est l'indice :",
          "reponses": [
            { "texte": "Du Japon",       "correcte": false },
            { "texte": "D'Australie",    "correcte": false },
            { "texte": "Du Royaume-Uni", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Nasdaq 100 ?",
          "reponses": [
            { "texte": "Les 100 plus grosses boîtes tech US", "correcte": true },
            { "texte": "Les 100 plus grosses boîtes US",      "correcte": false },
            { "texte": "C'est une bourse",                    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Nasdaq ?",
          "reponses": [
            { "texte": "Une bourse",                                                        "correcte": false },
            { "texte": "Les 3000 plus grosses boîtes non financières cotées aux États-Unis", "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                     "correcte": true }
          ]
        },
        {
          "libelle": "Combien y a-t-il de cycles immobiliers ?",
          "reponses": [
            { "texte": "4",         "correcte": true },
            { "texte": "5",         "correcte": false },
            { "texte": "ça dépend", "correcte": false }
          ]
        },
        {
          "libelle": "Quelle est la différence entre un ETF et un indice ?",
          "reponses": [
            { "texte": "Les ETF sont corrélés aux indices",                       "correcte": false },
            { "texte": "L'un peut être uniquement acheté, l'autre uniquement tradé", "correcte": false },
            { "texte": "Les deux réponses sont vraies",                           "correcte": true },
            { "texte": "Les deux réponses sont fausses",                          "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Analyse fondamentale",
      "quiz": "Quiz - Calendrier économique",
      "questions": [
        {
          "libelle": "Qu'est-ce que le FOMC ?",
          "reponses": [
            { "texte": "Réunion officielle de la FED",        "correcte": true },
            { "texte": "Communiqué sur les taux directeurs",  "correcte": false },
            { "texte": "Discours de la FED",                  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le JOLTS ?",
          "reponses": [
            { "texte": "Annonce de création d'emploi",   "correcte": true },
            { "texte": "Annonce du chômage",             "correcte": false },
            { "texte": "Annonce de recherche d'emploi",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le NFP ?",
          "reponses": [
            { "texte": "Annonce de création d'emploi",   "correcte": true },
            { "texte": "Annonce du chômage",             "correcte": false },
            { "texte": "Annonce de recherche d'emploi",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le retails sales ?",
          "reponses": [
            { "texte": "La rotation des stocks",     "correcte": false },
            { "texte": "Les ventes au détail",       "correcte": true },
            { "texte": "Les commandes fournisseurs", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'IPC ?",
          "reponses": [
            { "texte": "L'indice des prix à la consommation",  "correcte": true },
            { "texte": "L'indice de dépense des ménages",      "correcte": false },
            { "texte": "L'indice de confiance en l'économie",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le GDP Growth rate ?",
          "reponses": [
            { "texte": "L'annonce du PIB",             "correcte": false },
            { "texte": "Le taux de croissance du PIB", "correcte": true },
            { "texte": "Le PIB trimestriel",           "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'inflation rate ?",
          "reponses": [
            { "texte": "L'évolution de l'inflation",                                      "correcte": false },
            { "texte": "L'inflation YTD (du début de l'année jusqu'au jour de l'annonce)", "correcte": false },
            { "texte": "L'inflation sur 12 mois glissants",                               "correcte": true }
          ]
        }
      ]
    },
    {
      "module": "Analyse fondamentale",
      "quiz": "Quiz - Commodités",
      "questions": [
        {
          "libelle": "Qu'est-ce qu'un ratio financier ?",
          "reponses": [
            { "texte": "Indicateur permettant de connaître la valeur comptable d'une entreprise", "correcte": true },
            { "texte": "Calcul de rentabilité",                                                   "correcte": false },
            { "texte": "Calcul permettant de savoir combien gagne et perd une entreprise",        "correcte": false }
          ]
        },
        {
          "libelle": "Le pétrole est-il une commodité importante dans le monde ?",
          "reponses": [
            { "texte": "Oui",       "correcte": true },
            { "texte": "Non",       "correcte": false },
            { "texte": "ça dépend", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qui a le plus de valeur entre l'or et l'argent ?",
          "reponses": [
            { "texte": "L'or",           "correcte": true },
            { "texte": "L'argent",       "correcte": false },
            { "texte": "C'est différent", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un bilan ?",
          "reponses": [
            { "texte": "La santé financière de l'entreprise", "correcte": true },
            { "texte": "Les charges - moins le résultat",     "correcte": false },
            { "texte": "La rentabilité de l'entreprise",      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une obligation ?",
          "reponses": [
            { "texte": "Une dette émise par un État pour financer son déficit",           "correcte": false },
            { "texte": "Une dette émise par une entreprise pour régler ses problèmes",    "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                   "correcte": false },
            { "texte": "Une dette émise par une entreprise, par une société ou une entreprise", "correcte": true }
          ]
        },
        {
          "libelle": "Les obligations sont des produits :",
          "reponses": [
            { "texte": "De spéculation / trading",       "correcte": false },
            { "texte": "D'investissement peu risqué",    "correcte": true }
          ]
        },
        {
          "libelle": "Investir en obligation revient-il à investir sur un État ?",
          "reponses": [
            { "texte": "Oui", "correcte": true },
            { "texte": "Non", "correcte": false }
          ]
        },
        {
          "libelle": "Une obligation :",
          "reponses": [
            { "texte": "Est remboursée totalement à l'échéance",                        "correcte": false },
            { "texte": "Verse des intérêts constants pendant la période de détention",  "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                 "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le risque d'une obligation ?",
          "reponses": [
            { "texte": "Risque de crédit",    "correcte": true },
            { "texte": "Risque de faillite",  "correcte": false },
            { "texte": "Risque de liquidité", "correcte": false }
          ]
        }
      ]
    },
    {
      "module": "Optimisation",
      "quiz": "Quiz - Optimisation",
      "questions": [
        {
          "libelle": "Qu'est-ce que le A book ?",
          "reponses": [
            { "texte": "Une transmission directe des ordres du broker sur le marché", "correcte": true },
            { "texte": "Une transmission indirecte des ordres au marché",             "correcte": false }
          ]
        },
        {
          "libelle": "Le B book est-il de l'arnaque ?",
          "reponses": [
            { "texte": "Oui", "correcte": false },
            { "texte": "Non", "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le meilleur choix ?",
          "reponses": [
            { "texte": "A book",                             "correcte": false },
            { "texte": "B book",                             "correcte": false },
            { "texte": "tout dépend de la manière de trader", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une fusion en finance ?",
          "reponses": [
            { "texte": "2 entreprises du même secteur qui fusionnent", "correcte": false },
            { "texte": "2 entreprises qui fusionnent",                 "correcte": true },
            { "texte": "2 entreprises qui s'associent",               "correcte": false }
          ]
        },
        {
          "libelle": "Dans une acquisition, comment est appelée l'entreprise qui se fait acheter ?",
          "reponses": [
            { "texte": "Proie",    "correcte": false },
            { "texte": "Cible",    "correcte": true },
            { "texte": "Objectif", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un swap ?",
          "reponses": [
            { "texte": "Les frais payés pour laisser un trade tourner le soir",                "correcte": true },
            { "texte": "Les frais payés pour laisser un trade tourner le week-end",            "correcte": false },
            { "texte": "La différence entre le bid et le ask qui constitue la commission du broker", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un spread ?",
          "reponses": [
            { "texte": "Les frais payés pour laisser un trade tourner le soir",                "correcte": false },
            { "texte": "Les frais payés pour laisser un trade tourner le week-end",            "correcte": false },
            { "texte": "La différence entre le bid et le ask qui constitue la commission du broker", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une fusion verticale ?",
          "reponses": [
            { "texte": "Deux entreprises de taille similaire qui s'unissent pour former une nouvelle entité", "correcte": false },
            { "texte": "Des entreprises du même secteur d'activité qui se regroupent pour augmenter leur part de marché", "correcte": false },
            { "texte": "Des entreprises de la même chaîne de production qui se regroupent pour améliorer l'efficacité et réduire les coûts", "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le cycle économique le plus long ?",
          "reponses": [
            { "texte": "Celui de Kondratieff", "correcte": true },
            { "texte": "Celui de Juglar",      "correcte": false },
            { "texte": "Celui de Kitchin",     "correcte": false }
          ]
        },
        {
          "libelle": "Quel est le cycle économique le plus court ?",
          "reponses": [
            { "texte": "Celui de Kondratieff", "correcte": false },
            { "texte": "Celui de Juglar",      "correcte": false },
            { "texte": "Celui de Kitchin",     "correcte": true }
          ]
        },
        {
          "libelle": "Pendant une période de creux :",
          "reponses": [
            { "texte": "On revend nos mauvais investissements et on assume notre perte",       "correcte": false },
            { "texte": "On en profite pour racheter ce qui sous-performe pour revendre plus haut", "correcte": true },
            { "texte": "On attend la reprise économique",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Pendant une période de pic :",
          "reponses": [
            { "texte": "On revend les actifs spéculatifs à leur pic", "correcte": true },
            { "texte": "On revend les actifs safe à leur pic",        "correcte": false },
            { "texte": "On revend les actifs cycliques à leur pic",   "correcte": false },
            { "texte": "Les 3 réponses sont vraies",                  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la Due diligence ?",
          "reponses": [
            { "texte": "Une offre d'achat publique",         "correcte": false },
            { "texte": "L'audit et l'évaluation d'une cible", "correcte": true },
            { "texte": "Un montage fiscal pour le M&A",      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un LBO ?",
          "reponses": [
            { "texte": "L'offre d'action à bas prix envers les actionnaires existants pour éviter une OPA hostile", "correcte": false },
            { "texte": "L'achat d'une cible grâce à de la dette", "correcte": true },
            { "texte": "Des conditions favorables données à des employés après une fusion pour éviter qu'ils quittent la boîte", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un golden parachute ?",
          "reponses": [
            { "texte": "Compensation financière accordée à un gérant en cas de licenciement après une fusion ou acquisition", "correcte": true },
            { "texte": "Projet de restructuration pour une société en faillite",                  "correcte": false },
            { "texte": "Projet pour rentabiliser l'achat d'une société par une plus grosse",      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'Altman Z score ?",
          "reponses": [
            { "texte": "Modèle de scoring pour prédire la probabilité de surperformance",       "correcte": false },
            { "texte": "Modèle de scoring pour prédire la rentabilité de l'achat d'une société", "correcte": false },
            { "texte": "Modèle de scoring pour prédire la probabilité de faillite",             "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Sharpe ratio ?",
          "reponses": [
            { "texte": "Le rendement ajusté au risque",                              "correcte": true },
            { "texte": "Le rendement ajusté à la volatilité",                        "correcte": false },
            { "texte": "Le rendement ajusté à la volatilité implicite sur du CFD",   "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un roadshow ?",
          "reponses": [
            { "texte": "Un tour de table sur une levée de fonds",                                          "correcte": true },
            { "texte": "Quand un entrepreneur vend des actions pour faire autre chose",                    "correcte": false },
            { "texte": "La mobilité salariale permettant à un employé de changer de poste (au sein de la même structure)", "correcte": false }
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

      -- type par question : 'choix_unique' par défaut, 'choix_multiple' si précisé.
      insert into questions (id_quiz, libelle, position, type)
      values (v_id_quiz, q ->> 'libelle', v_pos, coalesce(q ->> 'type', 'choix_unique'))
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
