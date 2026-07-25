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
          "explication_reussite": "Exact : une monnaie fiduciaire n'a pas de valeur intrinsèque (contrairement à l'or). Sa valeur repose entièrement sur la confiance accordée à son émetteur et sur le fait que tout le monde l'accepte.",
          "explication_echec": "Une monnaie fiduciaire ne tire sa valeur ni de sa matière ni de son ancienneté : chacun l'accepte parce qu'il sait que les autres l'accepteront aussi. C'est ce lien de confiance qui la définit.",
          "reponses": [
            { "texte": "Une monnaie qui repose sur la confiance", "correcte": true },
            { "texte": "Une monnaie 100 % en ligne",              "correcte": false },
            { "texte": "Une monnaie ancienne",                    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'inflation ?",
          "explication_reussite": "Exact : l'inflation est la hausse générale des prix. Concrètement, une même somme d'argent achète moins qu'avant : la valeur de la monnaie baisse.",
          "explication_echec": "La baisse du pouvoir d'achat est une conséquence de l'inflation, pas sa définition. Le cœur du phénomène, c'est la perte de valeur de la monnaie elle-même quand les prix montent.",
          "reponses": [
            { "texte": "La baisse du pouvoir d'achat",         "correcte": false },
            { "texte": "La baisse de la valeur de la monnaie", "correcte": true },
            { "texte": "Les deux",                             "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la déflation ?",
          "explication_reussite": "Exact : la déflation est une baisse générale des prix. Avec la même somme, on achète davantage : le pouvoir d'achat augmente.",
          "explication_echec": "La déflation correspond à une baisse des prix, mais son effet direct est une hausse du pouvoir d'achat : avec le même argent, on peut acheter plus. C'est cet effet qui la caractérise.",
          "reponses": [
            { "texte": "La hausse du pouvoir d'achat", "correcte": true },
            { "texte": "La baisse des prix",           "correcte": false }
          ]
        },
        {
          "libelle": "La déflation est-elle une bonne ou une mauvaise chose ?",
          "explication_reussite": "Exact : des prix qui baissent durablement poussent chacun à reporter ses achats (on attend moins cher), ce qui freine la consommation, la production et l'emploi. Ce cercle vicieux rend la déflation dangereuse.",
          "explication_echec": "Contre-intuitivement, la déflation est néfaste : quand les prix baissent durablement, les achats sont reportés, l'activité ralentit et le chômage augmente. C'est pourquoi elle est considérée comme une mauvaise chose.",
          "reponses": [
            { "texte": "Bonne",          "correcte": false },
            { "texte": "Mauvaise",       "correcte": true },
            { "texte": "Je ne sais pas", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une monnaie scripturale ?",
          "explication_reussite": "Exact : la monnaie scripturale est l'argent inscrit sur les comptes bancaires sous forme d'écritures, sans existence physique. Elle représente aujourd'hui l'essentiel de la masse monétaire.",
          "explication_echec": "La monnaie scripturale n'est ni les pièces et billets (monnaie physique) ni une cryptomonnaie : c'est l'argent inscrit sur les comptes bancaires, sous forme d'écritures — donc une monnaie digitalisée.",
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
          "explication_reussite": "Exact : le meilleur placement est celui qui correspond à TON profil — tes objectifs, ton horizon, ta tolérance au risque. Il n'existe pas de placement idéal universel.",
          "explication_echec": "Il n'y a pas de « meilleur » placement dans l'absolu : ni le plus risqué ni le plus sûr ne conviennent à tous. Le bon investissement est celui qui correspond à ton profil.",
          "reponses": [
            { "texte": "Le plus risqué",         "correcte": false },
            { "texte": "Le plus sûr",            "correcte": false },
            { "texte": "Celui qui te ressemble", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un rendement passif ?",
          "explication_reussite": "Exact : un rendement passif, c'est un revenu généré par un actif (loyers, dividendes, intérêts) sans avoir à travailler activement pour l'obtenir.",
          "explication_echec": "Un rendement passif, c'est de l'argent que rapporte un actif (loyers, dividendes…) sans effort actif — pas une perte causée par un passif.",
          "reponses": [
            { "texte": "De l'argent gagné grâce à un actif",   "correcte": true },
            { "texte": "De l'argent perdu à cause d'un passif", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'analyse technique ?",
          "explication_reussite": "Exact : l'analyse technique étudie les graphiques de prix et les volumes pour anticiper les mouvements, par opposition à l'analyse fondamentale qui étudie l'économie.",
          "explication_echec": "L'analyse technique, c'est l'étude des graphiques (prix, volumes, figures). Elle se distingue de l'analyse fondamentale, qui s'intéresse à l'économie et aux comptes.",
          "reponses": [
            { "texte": "L'analyse des graphiques",     "correcte": true },
            { "texte": "L'analyse de l'économie",      "correcte": false },
            { "texte": "L'analyse des autres traders", "correcte": false }
          ]
        },
        {
          "libelle": "Combien y a-t-il de types d'investissement ?",
          "explication_reussite": "Exact : le cours distingue deux grands types d'investissement. Retiens ce nombre : 2.",
          "explication_echec": "D'après le cours, il existe deux grands types d'investissement — ni un, ni trois. La bonne réponse est 2.",
          "reponses": [
            { "texte": "1", "correcte": false },
            { "texte": "2", "correcte": true },
            { "texte": "3", "correcte": false }
          ]
        },
        {
          "libelle": "Comment devenir plus riche ?",
          "explication_reussite": "Exact : s'enrichir, c'est accumuler des actifs (qui rapportent) et limiter les passifs (qui coûtent). Quand les actifs l'emportent, le patrimoine croît.",
          "explication_echec": "On s'enrichit en ayant plus d'actifs que de passifs : ce sont les actifs qui génèrent des revenus, les passifs qui les grignotent.",
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
          "explication_reussite": "Exact : un actif met de l'argent dans ta poche ou prend de la valeur avec le temps (immobilier locatif, actions, entreprise). C'est ce qui enrichit.",
          "explication_echec": "Un actif, c'est ce qui prend de la valeur ou te rapporte de l'argent — à l'inverse d'un passif, qui t'en coûte. Retiens : l'actif nourrit ton patrimoine.",
          "reponses": [
            { "texte": "Un achat qui prend de la valeur", "correcte": true },
            { "texte": "Un achat qui perd de la valeur",  "correcte": false },
            { "texte": "Les deux",                        "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'ancêtre des banques ?",
          "explication_reussite": "Exact : les orfèvres gardaient l'or des gens dans leurs coffres contre un reçu. Ces reçus, échangeables, sont devenus les premiers billets — l'ancêtre de la banque.",
          "explication_echec": "Ce sont les orfèvres : en entreposant l'or d'autrui contre un reçu échangeable, ils ont inventé le dépôt et le billet, à l'origine du métier de banquier.",
          "reponses": [
            { "texte": "Les banques centrales", "correcte": false },
            { "texte": "Les orfèvres",          "correcte": true },
            { "texte": "Les banques d'État",    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un passif ?",
          "explication_reussite": "Exact : un passif te coûte de l'argent ou perd de la valeur (voiture, gadgets, crédits à la consommation). Il appauvrit, à l'inverse de l'actif.",
          "explication_echec": "Un passif est ce qui sort de l'argent de ta poche ou se déprécie avec le temps. C'est l'opposé de l'actif : il faut en limiter le poids.",
          "reponses": [
            { "texte": "Un achat qui perd de la valeur",  "correcte": true },
            { "texte": "Un achat qui prend de la valeur", "correcte": false },
            { "texte": "Aucun des deux",                  "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'ancêtre de l'argent ?",
          "explication_reussite": "Exact : sous des formes variées (troc, coquillages, métaux, sel…), un moyen d'échange a toujours existé pour faciliter le commerce. L'argent moderne n'en est qu'une évolution.",
          "explication_echec": "L'argent n'a pas d'ancêtre unique : depuis toujours, les humains ont utilisé un moyen d'échange (troc, coquillages, métaux). Ce sont ses formes qui ont changé, pas son existence.",
          "reponses": [
            { "texte": "Le troc",                        "correcte": false },
            { "texte": "Les emprunts",                   "correcte": false },
            { "texte": "Il y a toujours eu de l'argent", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une capitalisation boursière ?",
          "explication_reussite": "Exact : la capitalisation boursière = nombre d'actions en circulation × cours de l'action. Elle mesure la valeur totale d'une entreprise en bourse.",
          "explication_echec": "La capitalisation boursière se calcule en multipliant le nombre d'actions en circulation par le prix d'une action : c'est la valeur de marché totale de l'entreprise, pas seulement son cours.",
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
          "explication_reussite": "Exact : tout investissement comporte un risque de perte — il n'existe pas de rendement sans risque. L'objectif est de le comprendre et de le maîtriser, pas de le nier.",
          "explication_echec": "Oui : investir expose toujours à un risque de perte. Le nier est dangereux ; mieux vaut l'identifier et le gérer (diversification, horizon, taille de position).",
          "reponses": [
            { "texte": "Oui", "correcte": true },
            { "texte": "Non", "correcte": false }
          ]
        },
        {
          "libelle": "Les risques liés à l'investissement sont-ils :",
          "explication_reussite": "Exact : les trois dimensions de risque évoquées coexistent — les ignorer serait incomplet. La bonne réponse les englobe toutes.",
          "explication_echec": "Les risques évoqués ne s'excluent pas : les trois s'appliquent en même temps. C'est pourquoi « Les 3 » est la bonne réponse.",
          "reponses": [
            { "texte": "Financiers", "correcte": false },
            { "texte": "Mentaux",    "correcte": false },
            { "texte": "Corporels",  "correcte": false },
            { "texte": "Les 3",      "correcte": true }
          ]
        },
        {
          "libelle": "Combien a-t-on vu de biais ?",
          "explication_reussite": "Exact : le module présente six biais cognitifs qui piègent l'investisseur. Les connaître aide à s'en prémunir.",
          "explication_echec": "Le cours détaille six biais cognitifs. La bonne réponse est 6.",
          "reponses": [
            { "texte": "4", "correcte": false },
            { "texte": "5", "correcte": false },
            { "texte": "6", "correcte": true }
          ]
        },
        {
          "libelle": "De quels biais a-t-on parlé ?",
          "explication_reussite": "Exact : ces six biais — confirmation, ancrage, surconfiance, représentativité, disponibilité et aversion à la perte — déforment nos décisions d'investissement. Les repérer, c'est mieux décider.",
          "explication_echec": "Les six biais vus sont : confirmation, ancrage, surconfiance, représentativité, disponibilité et aversion à la perte. C'est la liste complète attendue.",
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
          "explication_reussite": "Exact : l'administration fiscale attend une déclaration de l'ensemble de tes revenus concernés — les deux catégories proposées, pas une seule.",
          "explication_echec": "Il ne faut pas choisir entre les deux : les deux types de revenus proposés doivent être déclarés. La bonne réponse est « Les deux ».",
          "reponses": [
            { "texte": "Ses plus-values",  "correcte": false },
            { "texte": "Ses moins-values", "correcte": false },
            { "texte": "Les deux",         "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que la technique du 50/20/20/10 ?",
          "explication_reussite": "Exact : cette règle répartit tes revenus en 50 % de charges, 20 % d'économies, 20 % d'investissement et 10 % de fonds d'urgence — un cadre simple pour gérer son budget.",
          "explication_echec": "La technique du 50/20/20/10 répartit le revenu ainsi : 50 % de charges, 20 % d'économies, 20 % d'investissement, 10 % de fonds d'urgence. C'est cette ventilation qui est attendue.",
          "reponses": [
            { "texte": "50 % de charges, 20 % d'économies, 20 % d'investissement, 10 % de fonds d'urgence", "correcte": true },
            { "texte": "50 % d'investissement, 20 % de charges, 20 % de fonds d'urgence, 10 % d'économies", "correcte": false },
            { "texte": "Aucune des deux",                                                                   "correcte": false }
          ]
        },
        {
          "libelle": "De combien est la flat tax ?",
          "explication_reussite": "Exact : la flat tax (prélèvement forfaitaire unique) s'élève à 30 % — soit 12,8 % d'impôt sur le revenu et 17,2 % de prélèvements sociaux.",
          "explication_echec": "La flat tax, ou prélèvement forfaitaire unique sur les revenus du capital, est de 30 % (12,8 % + 17,2 %). C'est ce taux qui est attendu.",
          "reponses": [
            { "texte": "30 %", "correcte": true },
            { "texte": "35 %", "correcte": false },
            { "texte": "40 %", "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'impôt le plus répandu ?",
          "explication_reussite": "Exact : la TVA est payée par tout le monde à chaque achat, sans exception. C'est l'impôt le plus universel et la première recette de l'État.",
          "explication_echec": "L'impôt le plus répandu est la TVA : tout le monde la paie à chaque achat, contrairement aux impôts qui ne touchent que certains contribuables.",
          "reponses": [
            { "texte": "L'impôt sur le revenu",    "correcte": false },
            { "texte": "L'impôt sur les sociétés", "correcte": false },
            { "texte": "La TVA",                   "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un ETF ?",
          "explication_reussite": "Exact : un ETF est un « panier d'actions » que l'on achète en une seule fois. Il réplique un indice et offre une diversification immédiate à moindre coût.",
          "explication_echec": "Un ETF est un « panier d'actions » : un seul produit qui regroupe de nombreux titres et suit un indice. C'est l'outil de diversification par excellence.",
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
          "explication_reussite": "Exact : l'optimisation fiscale consiste à utiliser les dispositifs légaux (niches, statuts, enveloppes) pour réduire ses impôts. À ne pas confondre avec la fraude, qui est illégale.",
          "explication_echec": "L'optimisation fiscale reste dans la légalité : elle utilise les règles existantes pour payer moins d'impôts. Ce qui est illégal, c'est la fraude ou l'évasion fiscale.",
          "reponses": [
            { "texte": "Des manières légales de réduire ses impôts",   "correcte": true },
            { "texte": "Des manières illégales de réduire ses impôts", "correcte": false },
            { "texte": "Fuir un pays pour ne pas payer d'impôts",      "correcte": false }
          ]
        },
        {
          "libelle": "À quoi dois-tu faire attention quand tu veux optimiser ta fiscalité ?",
          "explication_reussite": "Exact : les deux points de vigilance proposés comptent tous les deux. Une bonne optimisation les prend en compte ensemble, pas séparément.",
          "explication_echec": "Il ne faut pas en négliger un : les deux éléments de vigilance s'appliquent en même temps. La bonne réponse est « Les deux ».",
          "reponses": [
            { "texte": "Ton taux d'imposition", "correcte": false },
            { "texte": "Ton statut juridique",  "correcte": false },
            { "texte": "Les deux",              "correcte": true }
          ]
        },
        {
          "libelle": "Anticiper tes dépenses est-il une pratique utile ?",
          "explication_reussite": "Exact : anticiper ses dépenses permet de planifier, d'éviter les mauvaises surprises et de dégager de quoi épargner et investir. C'est un pilier d'une bonne gestion.",
          "explication_echec": "Oui : anticiper ses dépenses est une pratique saine — elle évite les découverts, aide à budgétiser et libère de la marge pour investir.",
          "reponses": [
            { "texte": "Oui",       "correcte": true },
            { "texte": "Non",       "correcte": false },
            { "texte": "Ça dépend", "correcte": false }
          ]
        },
        {
          "libelle": "En général, quel va être le statut juridique des sociétés qui entrent en bourse ?",
          "explication_reussite": "Exact : les sociétés cotées sont généralement des SA (sociétés anonymes), la forme adaptée à un capital divisé en actions et ouvert au public.",
          "explication_echec": "Pour entrer en bourse, une société adopte en général le statut de SA (société anonyme) : c'est la forme conçue pour un capital en actions ouvert aux investisseurs.",
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
          "explication_reussite": "Exact : avant tout placement, on définit ses objectifs financiers et son profil de risque. C'est ce cadre qui guide ensuite tous les choix d'investissement.",
          "explication_echec": "La toute première étape n'est pas de choisir un produit, mais d'établir ses objectifs et son profil de risque : c'est ce qui détermine ce qui te convient.",
          "reponses": [
            { "texte": "Acheter des actions au hasard",                             "correcte": false },
            { "texte": "Établir ses objectifs financiers et son profil de risque",  "correcte": true },
            { "texte": "Suivre les tendances des réseaux sociaux",                  "correcte": false },
            { "texte": "Investir uniquement dans des produits sans risque",         "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la diversification en investissement ?",
          "explication_reussite": "Exact : diversifier, c'est répartir son argent sur plusieurs types d'actifs pour ne pas tout risquer au même endroit. Si l'un chute, les autres amortissent.",
          "explication_echec": "La diversification consiste à répartir ses investissements sur plusieurs types d'actifs : c'est la règle du « ne pas mettre tous ses œufs dans le même panier ».",
          "reponses": [
            { "texte": "Placer tout son capital dans un seul actif",                 "correcte": false },
            { "texte": "Répartir ses investissements sur plusieurs types d'actifs",  "correcte": true },
            { "texte": "Se spécialiser dans un domaine d'investissement",            "correcte": false },
            { "texte": "Suivre les conseils d'un seul expert",                       "correcte": false }
          ]
        },
        {
          "libelle": "Quel type d'investissement est généralement considéré comme le moins risqué ?",
          "explication_reussite": "Exact : les obligations d'État sont considérées parmi les placements les moins risqués, car un État solvable rembourse presque toujours sa dette. En contrepartie, le rendement est faible.",
          "explication_echec": "Le placement le moins risqué est l'obligation d'État : le risque de défaut d'un État solvable est très faible. Moins de risque signifie aussi moins de rendement.",
          "reponses": [
            { "texte": "Les actions",               "correcte": false },
            { "texte": "Les obligations de l'État", "correcte": true },
            { "texte": "Les cryptomonnaies",        "correcte": false },
            { "texte": "Les matières premières",    "correcte": false }
          ]
        },
        {
          "libelle": "Quel est le principal avantage de l'investissement à long terme ?",
          "explication_reussite": "Exact : sur le long terme, l'effet de capitalisation (les intérêts qui génèrent des intérêts) joue à plein, et les fluctuations de court terme se lissent.",
          "explication_echec": "L'atout majeur du long terme, c'est l'effet de capitalisation combiné au lissage des fluctuations de court terme : le temps travaille pour l'investisseur patient.",
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
          "explication_reussite": "Exact : une banque centrale (BCE, FED…) régule les banques et pilote l'émission de monnaie ainsi que les taux directeurs. Elle est la gardienne du système monétaire.",
          "explication_echec": "La banque centrale n'est pas une banque comme les autres : c'est l'institution qui régule les banques et contrôle l'émission de monnaie et les taux.",
          "reponses": [
            { "texte": "Une banque au milieu d'une ville",                             "correcte": false },
            { "texte": "Une banque nationale",                                         "correcte": false },
            { "texte": "L'organisme qui régule les banques et l'émission de monnaie",  "correcte": true }
          ]
        },
        {
          "libelle": "Bitcoin est-il la première cryptomonnaie ?",
          "explication_reussite": "Exact : Bitcoin (2009) est la première cryptomonnaie décentralisée à avoir réussi, mais des tentatives l'ont précédé (DigiCash, b-money, Bit Gold…). Il n'est donc pas le tout premier essai.",
          "explication_echec": "Non : Bitcoin est la première crypto à s'être imposée, mais plusieurs projets de monnaie numérique l'ont précédé. Il a popularisé le concept, sans l'inventer de zéro.",
          "reponses": [
            { "texte": "Oui", "correcte": false },
            { "texte": "Non", "correcte": true }
          ]
        },
        {
          "libelle": "Sur quel consensus se base Ether ?",
          "explication_reussite": "Exact : depuis « The Merge » (2022), Ethereum fonctionne en Proof of Stake — la validation repose sur des jetons mis en jeu plutôt que sur la puissance de calcul, bien moins énergivore.",
          "explication_echec": "Ethereum utilise le Proof of Stake (preuve d'enjeu) depuis 2022 : ce sont les validateurs qui bloquent des ethers, et non les mineurs, qui sécurisent le réseau.",
          "reponses": [
            { "texte": "Proof of work",   "correcte": false },
            { "texte": "Proof of stake",  "correcte": true },
            { "texte": "Proof of useful", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un smart contract ?",
          "explication_reussite": "Exact : un smart contract est un programme qui s'exécute automatiquement sur la blockchain quand ses conditions sont réunies — un « contrat intelligent » sans intermédiaire.",
          "explication_echec": "Un smart contract est un contrat intelligent inscrit sur la blockchain : il s'exécute tout seul, automatiquement, dès que ses conditions sont remplies.",
          "reponses": [
            { "texte": "Un contrat intelligent sur la blockchain", "correcte": true },
            { "texte": "Un contrat de petite taille",              "correcte": false },
            { "texte": "Un type de minage",                        "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le mining ?",
          "explication_reussite": "Exact : le minage valide les transactions et sécurise le réseau (en Proof of Work). La création de nouvelles pièces n'est que la récompense de ce travail de sécurisation.",
          "explication_echec": "Le rôle premier du minage est de sécuriser le réseau en validant les transactions ; l'émission de nouvelles cryptos n'en est que la récompense.",
          "reponses": [
            { "texte": "La sécurisation du réseau",            "correcte": true },
            { "texte": "La recherche de métaux dans une mine", "correcte": false },
            { "texte": "La création de cryptomonnaie",         "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un nœud ?",
          "explication_reussite": "Exact : un nœud est un ordinateur qui participe au réseau en conservant une copie de la blockchain et en relayant les transactions. Plus il y a de nœuds, plus le réseau est décentralisé.",
          "explication_echec": "Un nœud, c'est simplement un ordinateur connecté au réseau qui détient une copie de la blockchain et vérifie les transactions.",
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
          "explication_reussite": "Exact : le trilemme oppose trois propriétés — scalabilité, décentralisation et sécurité. Une blockchain peut difficilement exceller dans les trois à la fois ; améliorer l'une se fait souvent au détriment d'une autre.",
          "explication_echec": "Le trilemme de la blockchain, ce sont trois exigences à concilier : scalabilité, décentralisation et sécurité. Le défi est qu'on ne peut généralement pas maximiser les trois en même temps.",
          "reponses": [
            { "texte": "Scalabilité, décentralisation, sécurité", "correcte": true },
            { "texte": "Rapidité, décentralisation, pollution",   "correcte": false },
            { "texte": "Décentralisation, sécurité, coûts",       "correcte": false }
          ]
        },
        {
          "libelle": "Que faut-il à la blockchain pour être plus rapide ?",
          "explication_reussite": "D'après le trilemme enseigné, gagner en rapidité se fait en jouant sur le pilier de la sécurité. Retiens la réponse du cours : la sécurité.",
          "explication_echec": "Selon le raisonnement du cours sur le trilemme, la rapidité de la blockchain s'obtient du côté de la sécurité. C'est la réponse attendue.",
          "reponses": [
            { "texte": "De la décentralisation", "correcte": false },
            { "texte": "De l'argent",            "correcte": false },
            { "texte": "De la sécurité",         "correcte": true }
          ]
        },
        {
          "libelle": "Que faut-il à la blockchain pour être sécurisée ?",
          "explication_reussite": "D'après le trilemme enseigné, la sécurité se gagne en jouant sur le pilier de la scalabilité. Retiens la réponse du cours : la scalabilité.",
          "explication_echec": "Selon le raisonnement du cours sur le trilemme, la sécurité de la blockchain s'obtient du côté de la scalabilité. C'est la réponse attendue.",
          "reponses": [
            { "texte": "De l'argent",            "correcte": false },
            { "texte": "De la décentralisation", "correcte": false },
            { "texte": "De la scalabilité",      "correcte": true }
          ]
        },
        {
          "libelle": "Que veut dire être décentralisé ?",
          "explication_reussite": "Exact : un réseau décentralisé fonctionne sans autorité ni intermédiaire de confiance — ce sont les participants eux-mêmes qui valident, sans qu'aucun ne contrôle l'ensemble.",
          "explication_echec": "Être décentralisé, c'est fonctionner sans intermédiaire de confiance : aucune entité centrale ne détient le pouvoir, la validation est répartie entre les participants.",
          "reponses": [
            { "texte": "Qu'il n'y a pas de centre",                                 "correcte": false },
            { "texte": "Que le réseau est indépendant",                             "correcte": false },
            { "texte": "Que le réseau fonctionne sans intermédiaire de confiance",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un layer 2 ?",
          "explication_reussite": "Exact : un layer 2 est une seconde couche qui se greffe sur une blockchain existante (le layer 1) pour la soulager — traiter plus de transactions, plus vite et moins cher.",
          "explication_echec": "Un layer 2 n'est pas une blockchain indépendante : c'est une couche qui vient se greffer sur une blockchain existante pour améliorer sa rapidité et ses frais.",
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
          "explication_reussite": "Exact : un NFT est un token unique portant un certificat de propriété inscrit sur la blockchain. Il prouve qui possède un bien numérique (ou physique) de façon infalsifiable.",
          "explication_echec": "Un NFT est un token associé à un certificat de propriété en ligne : c'est ce titre de propriété vérifiable sur la blockchain qui le caractérise, pas l'image elle-même.",
          "reponses": [
            { "texte": "Un token non fongible",                             "correcte": false },
            { "texte": "De l'art numérique",                                "correcte": false },
            { "texte": "Un token avec un certificat de propriété en ligne",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qui fait d'un NFT un NFT ?",
          "explication_reussite": "Exact : ce qui distingue un NFT, c'est son certificat d'authenticité unique inscrit sur la blockchain — il rend le token non fongible, c'est-à-dire non interchangeable.",
          "explication_echec": "Ce n'est ni l'image ni le prix qui fait un NFT, mais son certificat d'authenticité : c'est lui qui garantit son unicité et sa non-fongibilité.",
          "reponses": [
            { "texte": "Son certificat d'authenticité", "correcte": true },
            { "texte": "Sa fongibilité",                "correcte": false },
            { "texte": "Sa traçabilité",                "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le métavers ?",
          "explication_reussite": "Exact : le métavers est un monde virtuel en ligne, souvent adossé à la blockchain, où l'on peut interagir, posséder des biens numériques (terrains, objets, NFT) et échanger.",
          "explication_echec": "Le métavers est un monde virtuel en ligne bâti sur la blockchain : un univers persistant où l'on possède et échange des actifs numériques, pas un simple jeu vidéo.",
          "reponses": [
            { "texte": "Un monde virtuel en ligne",                   "correcte": false },
            { "texte": "Un monde virtuel en ligne sur la blockchain", "correcte": true },
            { "texte": "Un film",                                     "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Web 3 ?",
          "explication_reussite": "Exact : le Web 3 est un web décentralisé, bâti sur la blockchain, où l'utilisateur reprend le contrôle de ses données et de ses actifs, sans dépendre de grandes plateformes centrales.",
          "explication_echec": "Le Web 3, c'est le web décentralisé : contrairement au Web 2 dominé par quelques plateformes, il rend aux utilisateurs la propriété de leurs données et de leurs actifs.",
          "reponses": [
            { "texte": "Un web décentralisé",                                     "correcte": true },
            { "texte": "Un web décentralisé sur lequel tu peux faire ce que tu veux", "correcte": false },
            { "texte": "Une mise à jour du dark web",                             "correcte": false }
          ]
        },
        {
          "libelle": "Les NFT sont-ils des outils de spéculation ?",
          "explication_reussite": "Exact : les NFT sont à la fois des supports de spéculation (revente à profit) ET des outils d'usage (propriété, accès, identité numérique). Les deux dimensions coexistent.",
          "explication_echec": "Réduire les NFT à un seul rôle est incomplet : ils servent à la fois d'objets spéculatifs et d'outils d'usage réel. C'est pourquoi les deux réponses sont vraies.",
          "reponses": [
            { "texte": "Oui",                          "correcte": false },
            { "texte": "Non",                          "correcte": false },
            { "texte": "Les deux réponses sont vraies", "correcte": true }
          ]
        },
        {
          "libelle": "Les NFT ont-ils une utilité dans le monde réel ?",
          "explication_reussite": "Exact : au-delà de l'art numérique, les NFT servent à certifier des billets, des diplômes, des titres de propriété ou des accès — partout où prouver l'authenticité et la propriété compte.",
          "explication_echec": "Oui : les NFT ont des usages concrets (billetterie, certificats, titres de propriété, accès exclusifs). Leur intérêt dépasse la simple spéculation sur des images.",
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
          "explication_reussite": "Exact : avant le Web 3 venait le Web 2, celui des réseaux sociaux et des grandes plateformes où l'on crée du contenu mais où les données appartiennent aux géants du web.",
          "explication_echec": "Avant le Web 3, il y avait le Web 2 : le web interactif des plateformes (réseaux sociaux, applis) où l'utilisateur produit le contenu sans en posséder les données.",
          "reponses": [
            { "texte": "Le Web 1", "correcte": false },
            { "texte": "Le Web 2", "correcte": true },
            { "texte": "Rien",     "correcte": false }
          ]
        },
        {
          "libelle": "Quelle est la principale différence entre le Web 3 et ses prédécesseurs ?",
          "explication_reussite": "Exact : la grande rupture du Web 3, c'est la décentralisation. Le pouvoir et les données ne sont plus concentrés chez quelques plateformes mais répartis sur la blockchain.",
          "explication_echec": "Ce qui distingue vraiment le Web 3, c'est la décentralisation : la fin de la mainmise des grandes plateformes sur les données et les échanges.",
          "reponses": [
            { "texte": "La décentralisation", "correcte": true },
            { "texte": "L'interopérabilité",  "correcte": false },
            { "texte": "L'anonymat",          "correcte": false }
          ]
        },
        {
          "libelle": "Cette mise à jour est-elle bonne pour les GAFAM ?",
          "explication_reussite": "Exact : le Web 3 menace le modèle des GAFAM, dont la puissance repose sur la centralisation des données. En rendant le contrôle aux utilisateurs, il affaiblit leur position.",
          "explication_echec": "Non : le Web 3 va à l'encontre des intérêts des GAFAM. Leur domination vient de la centralisation des données ; la décentralisation la remet en cause.",
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
          "explication_reussite": "Exact : un narratif est un grand thème qui porte l'attention et les capitaux sur un secteur de la crypto (IA, DeFi, gaming, RWA…). Suivre les narratifs aide à repérer les tendances.",
          "explication_echec": "Un narratif, c'est un domaine ou une tendance de la cryptomonnaie (IA, DeFi, gaming…) autour duquel se concentrent l'attention et les investissements.",
          "reponses": [
            { "texte": "Un domaine de cryptomonnaie",    "correcte": true },
            { "texte": "Une histoire",                   "correcte": false },
            { "texte": "Les deux réponses sont vraies",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'adoption ?",
          "explication_reussite": "Exact : l'adoption, c'est l'acceptation et l'usage de la cryptomonnaie par le grand public et les institutions. Plus l'adoption progresse, plus la crypto s'installe durablement.",
          "explication_echec": "L'adoption désigne l'acceptation de la crypto par la masse : son passage d'un outil de niche à un usage courant, par les particuliers comme par les institutions.",
          "reponses": [
            { "texte": "Un usage étatique de la blockchain",              "correcte": false },
            { "texte": "L'acceptation de la cryptomonnaie par la masse",  "correcte": true },
            { "texte": "Avoir un enfant qui n'est pas le sien",           "correcte": false }
          ]
        },
        {
          "libelle": "Pourquoi le gaming pourrait-il être la porte d'adoption de la crypto ?",
          "explication_reussite": "Exact : le marché du jeu vidéo est immense (des milliards de joueurs). En y intégrant la crypto, on expose d'un coup une population énorme, souvent jeune et à l'aise avec le numérique.",
          "explication_echec": "C'est la taille colossale du marché du gaming qui en fait une porte d'adoption : intégrer la crypto au jeu, c'est toucher des milliards d'utilisateurs.",
          "reponses": [
            { "texte": "Parce que les enfants en parleront à leurs parents", "correcte": false },
            { "texte": "Ça ne sera pas la porte d'adoption",                 "correcte": false },
            { "texte": "En raison de la taille du marché du gaming",         "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'IBC ?",
          "explication_reussite": "Exact : l'IBC (Inter-Blockchain Communication) est un protocole qui permet à des blockchains différentes de communiquer et d'échanger des données ou des actifs entre elles.",
          "explication_echec": "L'IBC est un moyen pour les blockchains de communiquer entre elles : il relie des réseaux qui, sans lui, resteraient isolés. C'est un pilier de l'interopérabilité.",
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
          "explication_reussite": "Exact : un airdrop est une distribution de tokens qu'un projet offre pour récompenser et fidéliser les acteurs qui l'utilisent ou le promeuvent — un moyen d'amorcer sa communauté.",
          "explication_echec": "Un airdrop est le moyen qu'utilise un projet pour rémunérer ses acteurs en leur distribuant des tokens, souvent en échange de tâches ou d'une utilisation précoce.",
          "reponses": [
            { "texte": "Un système de rémunération sur la blockchain",                       "correcte": false },
            { "texte": "Le moyen qu'utilise un projet pour rémunérer les acteurs du projet", "correcte": true },
            { "texte": "Un ensemble de tâches réalisées pour recevoir des tokens gratuits",  "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'avantage des airdrops ?",
          "explication_reussite": "Exact : les airdrops demandent souvent des tâches simples (tester une appli, interagir avec un protocole) pour une récompense potentielle — un moyen accessible d'obtenir des tokens sans gros capital.",
          "explication_echec": "L'atout des airdrops, c'est que les tâches à accomplir sont souvent simples : peu de barrière à l'entrée pour une récompense possible en tokens.",
          "reponses": [
            { "texte": "La gratuité",             "correcte": false },
            { "texte": "La rapidité",             "correcte": false },
            { "texte": "Des tâches souvent simples", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une lowcap ?",
          "explication_reussite": "Exact : une lowcap est une cryptomonnaie à faible capitalisation (moins de 100 M). Potentiel de forte hausse, mais aussi risque et volatilité élevés.",
          "explication_echec": "Une lowcap est une crypto dont la capitalisation (marketcap) est faible — moins de 100 M ici. C'est ce petit marché qui la définit, avec son fort potentiel et son fort risque.",
          "reponses": [
            { "texte": "Une cryptomonnaie à moins de 100 M de marketcap", "correcte": true },
            { "texte": "Une cryptomonnaie qui n'est pas connue",          "correcte": false },
            { "texte": "Un projet qui vient de sortir",                   "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'avantage des lowcaps ?",
          "explication_reussite": "Exact : avec une petite capitalisation, une lowcap peut prendre beaucoup de valeur si le projet réussit — d'où un potentiel de gros rendement. En contrepartie, le risque est élevé.",
          "explication_echec": "L'attrait des lowcaps, c'est leur potentiel de gros rendement : une faible capitalisation laisse plus de marge de hausse. Ce potentiel s'accompagne toutefois d'un risque important.",
          "reponses": [
            { "texte": "Un risque modéré",             "correcte": false },
            { "texte": "Un potentiel de gros rendement", "correcte": true },
            { "texte": "De faibles coûts",             "correcte": false }
          ]
        },
        {
          "libelle": "Un ETF crypto, bonne ou mauvaise chose ?",
          "explication_reussite": "Exact : un ETF crypto facilite l'accès des investisseurs traditionnels et des institutions au marché. C'est un signe de maturité et d'adoption — donc une bonne chose.",
          "explication_echec": "Un ETF crypto est vu comme une bonne chose : il ouvre le marché aux investisseurs institutionnels et grand public, signe d'adoption et de légitimation.",
          "reponses": [
            { "texte": "Bonne",    "correcte": true },
            { "texte": "Mauvaise", "correcte": false }
          ]
        },
        {
          "libelle": "Que signifie un ETF dans le secteur des cryptos ?",
          "explication_reussite": "Exact : le lancement d'ETF crypto signale que les institutions financières s'emparent du secteur. C'est un marqueur fort d'adoption par la finance traditionnelle.",
          "explication_echec": "Un ETF dans la crypto est avant tout un signe d'adoption par les institutions financières : leur arrivée marque l'entrée de la crypto dans la finance classique.",
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
          "explication_reussite": "Exact : une bougie rouge indique que le prix a clôturé plus bas qu'il n'a ouvert sur la période — la baisse l'a emporté.",
          "explication_echec": "Une bougie rouge signale une baisse : la clôture est inférieure à l'ouverture. Le vert marquerait une hausse, pas le rouge.",
          "reponses": [
            { "texte": "Que le prix a baissé",        "correcte": true },
            { "texte": "Que le prix est monté",       "correcte": false },
            { "texte": "Que le prix s'est stabilisé", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une tendance ?",
          "explication_reussite": "Exact : la tendance est le sens dans lequel va le prix, et donc le graphique. Les deux formulations décrivent la même chose — d'où « les deux réponses sont vraies ».",
          "explication_echec": "Le prix et le graphique vont dans le même sens : dire « le sens du prix » ou « le sens du graphique » revient au même. Les deux réponses sont donc justes.",
          "reponses": [
            { "texte": "Le sens dans lequel va le graphique", "correcte": false },
            { "texte": "Le sens dans lequel va le prix",      "correcte": false },
            { "texte": "Les deux réponses sont vraies",       "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une figure chartiste ?",
          "explication_reussite": "Exact : une figure chartiste est un motif de prix récurrent (tête-épaules, triangle, drapeau…) qui aide à anticiper la direction probable du marché.",
          "explication_echec": "Une figure chartiste n'est pas qu'un simple mouvement de prix : c'est un motif reconnaissable qui permet de prédire le sens que le marché pourrait prendre.",
          "reponses": [
            { "texte": "Un mouvement de prix",                                              "correcte": false },
            { "texte": "Un mouvement de prix qui peut prédire le sens que va prendre le marché", "correcte": true },
            { "texte": "Les deux réponses sont vraies",                                     "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un indicateur technique ?",
          "explication_reussite": "Exact : un indicateur technique est à la fois un outil de calcul, une aide à la décision et un synthétiseur d'informations. Les trois définitions sont vraies à la fois.",
          "explication_echec": "Chacune des définitions proposées décrit une facette de l'indicateur technique : outil de décision, de polarité, de synthèse. C'est pourquoi « toutes les réponses sont vraies ».",
          "reponses": [
            { "texte": "Un algorithme qui nous aide à prédire le marché",     "correcte": false },
            { "texte": "Un outil permettant d'assister à la prise de décision", "correcte": false },
            { "texte": "Un outil de polarité qui synthétise les informations", "correcte": false },
            { "texte": "Toutes les réponses sont vraies",                      "correcte": true }
          ]
        },
        {
          "libelle": "Que signifie BTCUSD ?",
          "explication_reussite": "Exact : BTCUSD exprime le prix du Bitcoin (BTC) en dollars américains (USD). La première devise est cotée dans la seconde.",
          "explication_echec": "BTCUSD, c'est le prix du Bitcoin en dollars : on lit toujours la première devise (BTC) valorisée dans la seconde (USD), pas l'inverse.",
          "reponses": [
            { "texte": "Le prix du Bitcoin en dollars",                        "correcte": true },
            { "texte": "Le prix du dollar exprimé en Bitcoin",                 "correcte": false },
            { "texte": "Le prix du Bitcoin converti en dollars canadiens",     "correcte": false },
            { "texte": "Le taux de change entre deux stablecoins adossés au dollar", "correcte": false }
          ]
        },
        {
          "libelle": "EURUSD",
          "explication_reussite": "Exact : selon la lecture du cours, une paire de devises formule une question — EURUSD demande « combien de dollars vaut un euro ? ». C'est donc une question posée au marché.",
          "explication_echec": "D'après le cours, une paire comme EURUSD se lit comme une question : « combien de dollars pour un euro ? ». La bonne réponse est donc « Est une question ».",
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
          "explication_reussite": "Exact : le trading est une activité d'achat et de vente à découvert visant à profiter des mouvements de prix à court terme, contrairement à l'investissement de long terme.",
          "explication_echec": "Le trading se définit comme l'achat et la vente à découvert pour profiter des variations de prix — à distinguer de l'investissement, qui vise le long terme.",
          "reponses": [
            { "texte": "Une activité d'achat et de vente à découvert", "correcte": true },
            { "texte": "Une activité d'investissement",               "correcte": false },
            { "texte": "Une activité de spéculation",                 "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le scalping ?",
          "explication_reussite": "Exact : le scalping consiste à ouvrir et fermer des positions sur de très petites unités de temps (secondes à minutes), pour capter de nombreux petits mouvements.",
          "explication_echec": "Le scalping ne se compte pas en jours ni en mois : c'est du trading sur de petites unités de temps, avec des positions très courtes et nombreuses.",
          "reponses": [
            { "texte": "Le fait de maintenir ses positions de trading 1 à 2 jours",              "correcte": false },
            { "texte": "Le fait de maintenir ses positions de trading sur 1 à 2 mois",           "correcte": false },
            { "texte": "Le fait de maintenir ses positions de trading sur de petites unités de temps", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un broker ?",
          "explication_reussite": "Exact : le broker est l'intermédiaire qui met les traders particuliers (retails) en relation avec le marché. Il fournit l'accès et exécute les ordres.",
          "explication_echec": "Un broker n'est ni un trader ni une banque : c'est l'entité qui met les particuliers (retails) en face du marché et leur permet de passer leurs ordres.",
          "reponses": [
            { "texte": "C'est un trader retail",                                    "correcte": false },
            { "texte": "C'est une entité permettant de mettre les retails en face du marché", "correcte": true },
            { "texte": "C'est une banque fournisseuse de liquidité",               "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un trade ?",
          "explication_reussite": "Exact : un trade, c'est l'action d'acheter ou de vendre un actif à découvert dans le but de profiter de la variation de son prix.",
          "explication_echec": "Un trade est concrètement le fait d'acheter ou de vendre un actif à découvert — l'opération elle-même, pas seulement l'idée de spéculer.",
          "reponses": [
            { "texte": "De la spéculation",                                  "correcte": false },
            { "texte": "Le fait d'acheter ou de vendre un actif à découvert", "correcte": true },
            { "texte": "Investir sur un actif qu'on ne possède pas vraiment", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un CFD ?",
          "explication_reussite": "Exact : un CFD (Contract For Difference) permet de spéculer sur la variation d'un actif sans jamais le posséder — on échange seulement la différence de prix.",
          "explication_echec": "Avec un CFD, ni toi ni le broker ne détenez l'actif sous-jacent : tu trades le contrat, c'est-à-dire la différence de prix, pas l'actif lui-même.",
          "reponses": [
            { "texte": "Un outil qui permet de trader sur un contrat sans posséder l'actif sous-jacent", "correcte": true },
            { "texte": "Un outil qui permet de trader sur un contrat où le broker possède le sous-jacent", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un effet de levier ?",
          "explication_reussite": "Exact : le levier est un coefficient qui multiplie l'exposition — donc à la fois les gains ET les pertes. Un levier x10 amplifie les deux dans les mêmes proportions.",
          "explication_echec": "Le levier ne multiplie pas que les gains : il amplifie aussi les pertes, dans la même mesure. C'est un multiplicateur à double tranchant.",
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
          "explication_reussite": "Exact : le money management, c'est la gestion de la taille de tes positions en fonction du risque accepté. Bien dimensionner, c'est protéger son capital sur la durée.",
          "explication_echec": "Le money management ne concerne pas un trade isolé ni le compte en général, mais la gestion de la taille de chaque position selon le risque — la clé de la survie du capital.",
          "reponses": [
            { "texte": "La gestion de la taille d'une position", "correcte": true },
            { "texte": "La gestion d'un trade",                  "correcte": false },
            { "texte": "La gestion d'un compte de trading",      "correcte": false }
          ]
        },
        {
          "libelle": "Combien y a-t-il de types d'ordre ?",
          "explication_reussite": "Exact : le cours dénombre six types d'ordre (au marché, limite, stop, etc.). Retiens ce nombre : 6.",
          "explication_echec": "D'après le cours, il existe six types d'ordre. La bonne réponse est 6.",
          "reponses": [
            { "texte": "4", "correcte": false },
            { "texte": "5", "correcte": false },
            { "texte": "6", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le forex ?",
          "explication_reussite": "Exact : le forex (FOReign EXchange) est le marché mondial des devises, où s'échangent les monnaies du monde entier. C'est le plus grand marché financier qui existe.",
          "explication_echec": "Le forex est le marché des devises mondiales : on y échange les monnaies entre elles (EUR, USD, JPY…). C'est plus large que la seule notion de « marché des changes » ou « de la monnaie ».",
          "reponses": [
            { "texte": "Le marché des changes",          "correcte": false },
            { "texte": "Le marché des devises mondiales", "correcte": true },
            { "texte": "Le marché de la monnaie",         "correcte": false }
          ]
        },
        {
          "libelle": "Quelle est l'unité qui mesure la distance parcourue par un trade ?",
          "type": "choix_multiple",
          "explication_reussite": "Exact : la distance d'un trade se mesure en points et en pips — deux unités valides (le pip est la plus petite variation standard, le point une graduation du prix). Il fallait cocher les deux.",
          "explication_echec": "Cette question attend deux réponses : le point ET le pips mesurent tous deux la distance parcourue par un trade. Le dollar, lui, exprime un montant, pas une distance.",
          "reponses": [
            { "texte": "Le dollar", "correcte": false },
            { "texte": "Le point",  "correcte": true },
            { "texte": "Le pips",   "correcte": true }
          ]
        },
        {
          "libelle": "Peut-on trader sur les marchés sur lesquels on a investi ?",
          "explication_reussite": "Exact : ce n'est pas toujours possible ni pertinent — cela dépend du marché, de l'horizon et de la stratégie. La bonne réponse nuance : « pas toujours ».",
          "explication_echec": "La réponse n'est ni un « oui » ni un « non » catégorique : selon le marché et la stratégie, on peut parfois trader là où l'on a investi, parfois non. D'où « pas toujours ».",
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
          "explication_reussite": "Exact : le « chiffre univers » associé à la suite de Fibonacci s'obtient en concaténant ses termes dans l'ordre croissant. C'est la référence retenue par le cours.",
          "explication_echec": "D'après le cours, la suite de Fibonacci renvoie au « chiffre univers » (obtenu en concaténant ses termes). C'est cette réponse qui est attendue.",
          "reponses": [
            { "texte": "Au chiffre univers",            "correcte": true },
            { "texte": "À une suite arithmétique",      "correcte": false },
            { "texte": "Aux chiffres les plus utilisés", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une propfirm ?",
          "explication_reussite": "Exact : une propfirm (proprietary trading firm) confie du capital à un trader après lui avoir fait passer des tests d'évaluation. Le trader partage ensuite les gains réalisés.",
          "explication_echec": "Une propfirm n'est pas un simple broker : c'est une société qui te fournit du capital en échange de la réussite d'un test, puis partage les profits.",
          "reponses": [
            { "texte": "Une société de trading",                                    "correcte": false },
            { "texte": "Une société qui te fournit du capital en échange de tests",  "correcte": true },
            { "texte": "Un type de broker",                                          "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le retracement de Fibonacci ?",
          "explication_reussite": "Exact : le retracement de Fibonacci met en évidence des points d'intérêt (niveaux 0,5 ; 0,618…) où le prix a tendance à réagir — utiles pour repérer entrées et sorties.",
          "explication_echec": "Le retracement de Fibonacci sert à trouver des points d'intérêt sur le graphique : des niveaux où le prix réagit souvent. Ce n'est pas un outil pour « se rassurer ».",
          "reponses": [
            { "texte": "À trouver des points d'entrée et de sortie pertinents", "correcte": false },
            { "texte": "À trouver des points d'intérêt",                        "correcte": true },
            { "texte": "À se rassurer",                                         "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le prolongement selon la tendance de Fibonacci ?",
          "type": "choix_multiple",
          "explication_reussite": "Exact : le prolongement de Fibonacci projette plusieurs zones utiles à la fois — de take profit (TP), de stop loss (SL) et d'entrée. Les trois réponses étaient à cocher.",
          "explication_echec": "Cette question attend les trois réponses : le prolongement de Fibonacci sert à identifier des zones de TP, de SL et d'entrée. En cocher une seule est incomplet.",
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
          "explication_reussite": "Exact : le cours identifie quatre contextes de marché. Savoir dans lequel on se trouve oriente toute la stratégie. Retiens : 4.",
          "explication_echec": "D'après le cours, il existe quatre contextes de marché. La bonne réponse est 4.",
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
          "explication_reussite": "Exact : les contextes de marché s'enchaînent selon un ordre, pas au hasard. Comprendre cette séquence permet d'anticiper la phase suivante.",
          "explication_echec": "Les contextes de marché ne surgissent pas de façon aléatoire : ils suivent un ordre. C'est justement ce qui les rend exploitables pour anticiper.",
          "reponses": [
            { "texte": "Aléatoire", "correcte": false },
            { "texte": "Ordre",     "correcte": true }
          ]
        },
        {
          "libelle": "Que se passe-t-il après un retracement ?",
          "explication_reussite": "Exact : après un retracement (repli temporaire), le marché repart dans le sens de la tendance : c'est l'expansion, la reprise du mouvement.",
          "explication_echec": "Après un retracement vient l'expansion : le prix reprend sa marche dans le sens de la tendance. Ce n'est ni une consolidation ni un retournement.",
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
          "explication_reussite": "Exact : l'OTE (Optimal Trade Entry) désigne la zone d'entrée optimale — le point parfait pour placer son point d'entrée (PE) sur un mouvement.",
          "explication_echec": "L'OTE (Optimal Trade Entry) est le point parfait de PE (point d'entrée) : la zone offrant le meilleur rapport rendement/risque pour entrer, pas un point de TP ou de SL.",
          "reponses": [
            { "texte": "Le point parfait pour TP", "correcte": false },
            { "texte": "Le point parfait pour SL", "correcte": false },
            { "texte": "Le point parfait de PE",   "correcte": true }
          ]
        },
        {
          "libelle": "Les LRLR sont des points ?",
          "explication_reussite": "Exact : les LRLR (Low Resistance Liquidity Run) sont des zones de faible résistance — donc des points vulnérables, que le prix peut facilement venir balayer.",
          "explication_echec": "Les LRLR sont des points vulnérables : peu de résistance s'y oppose, le prix vient donc facilement y chercher la liquidité. Ils ne sont ni protégés ni égaux.",
          "reponses": [
            { "texte": "Vulnérables", "correcte": true },
            { "texte": "Protégés",    "correcte": false },
            { "texte": "Égaux",       "correcte": false }
          ]
        },
        {
          "libelle": "La liquidité interne est quand le chart se trouve entre :",
          "explication_reussite": "Exact : la liquidité interne se situe entre le précédent plus haut et le précédent plus bas — à l'intérieur de la fourchette, par opposition à la liquidité externe, au-delà des extrêmes.",
          "explication_echec": "La liquidité interne vit à l'intérieur de la range, entre le précédent plus haut et le précédent plus bas — pas au niveau d'une figure ni des moyennes mobiles.",
          "reponses": [
            { "texte": "Le précédent plus haut et plus bas", "correcte": true },
            { "texte": "La précédente figure chartiste",     "correcte": false },
            { "texte": "Les moyennes mobiles",               "correcte": false }
          ]
        },
        {
          "libelle": "Le carnet d'ordre est :",
          "explication_reussite": "Exact : le carnet d'ordres affiche en temps réel toutes les demandes d'achat et de vente en attente, avec leurs prix et quantités. Il révèle l'offre et la demande.",
          "explication_echec": "Le carnet d'ordres est l'endroit où s'affichent toutes les demandes d'achat et de vente en attente — ce n'est ni un journal de trading, ni une inscription sur la blockchain.",
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
          "explication_reussite": "Exact : une structure de marché est un schéma de prix (successions de sommets et creux) qui indique ce qui pourrait se passer ensuite — sans jamais rien garantir.",
          "explication_echec": "Une structure ne « prédit le futur » avec certitude : c'est un schéma de prix qui suggère ce qui pourrait se passer. Elle éclaire les probabilités, pas les certitudes.",
          "reponses": [
            { "texte": "Un schéma de prix qui permet de prédire le futur",       "correcte": false },
            { "texte": "Un schéma de prix qui nous indique ce qui pourrait se passer", "correcte": true },
            { "texte": "Un schéma de prix",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qui différencie une AMD d'une Accumulation / Distribution ?",
          "explication_reussite": "Exact : ce qui distingue une AMD (Accumulation-Manipulation-Distribution) d'une simple accumulation/distribution, c'est la phase de manipulation qui vient chercher la liquidité.",
          "explication_echec": "La différence tient à la liquidité : l'AMD ajoute une phase de manipulation qui va prendre la liquidité, absente d'une accumulation/distribution classique.",
          "reponses": [
            { "texte": "Les patterns",  "correcte": false },
            { "texte": "Le chartisme",  "correcte": false },
            { "texte": "La liquidité",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que la fractalité ?",
          "explication_reussite": "Exact : la fractalité, c'est le fait que les mêmes figures se répètent à toutes les échelles de temps — une structure vue en 1 min peut se retrouver en 1 h ou en journalier.",
          "explication_echec": "La fractalité désigne la répétition des mêmes figures à différents intervalles de temps, pas une cassure de structure ni une prise de liquidité.",
          "reponses": [
            { "texte": "Quand une structure se brise",                                    "correcte": false },
            { "texte": "Le fait que des figures se répètent à différents intervalles de temps", "correcte": true },
            { "texte": "Une prise de liquidité",                                          "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une timeframe ?",
          "explication_reussite": "Exact : une timeframe (unité de temps) est l'intervalle que représente chaque bougie — 1 min, 1 h, 1 jour… Elle détermine l'échelle à laquelle on lit le marché.",
          "explication_echec": "Une timeframe est une unité de temps (la durée d'une bougie), pas la durée d'un trade ni l'heure de prise de position.",
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
          "explication_reussite": "Exact : le cours retient quatre sessions de marché (Asie, Londres, New York, et la transition). Chacune a son comportement propre. Retiens : 4.",
          "explication_echec": "D'après le cours, il y a quatre sessions de marché. La bonne réponse est 4.",
          "reponses": [
            { "texte": "1", "correcte": false },
            { "texte": "2", "correcte": false },
            { "texte": "3", "correcte": false },
            { "texte": "4", "correcte": true }
          ]
        },
        {
          "libelle": "Quelle est la session la plus importante ?",
          "explication_reussite": "Exact : dans l'approche du cours, la session Asie est déterminante — elle pose le range de référence que Londres et New York viennent ensuite exploiter.",
          "explication_echec": "Selon le cours, c'est la session Asie qui est la plus importante : elle établit le cadre que les autres sessions viennent « casser ». Ce ne sont donc ni Londres ni New York.",
          "reponses": [
            { "texte": "Asie",     "correcte": true },
            { "texte": "New York", "correcte": false },
            { "texte": "Londres",  "correcte": false }
          ]
        },
        {
          "libelle": "Que font les sessions de Londres et New York ?",
          "explication_reussite": "Exact : Londres et New York viennent généralement casser (break) le range posé par la session Asie, pour aller chercher la liquidité au-delà de ses bornes.",
          "explication_echec": "Londres et New York ne suivent pas passivement l'Asie : elles cassent (break) son range pour prendre la liquidité. C'est ce mouvement qu'il fallait retenir.",
          "reponses": [
            { "texte": "Ils vont dans le même sens",                     "correcte": false },
            { "texte": "Ils break l'asia session",                       "correcte": true },
            { "texte": "Ils suivent la tendance donnée par l'asia session", "correcte": false }
          ]
        },
        {
          "libelle": "À quelle heure se déroule l'asia session ?",
          "explication_reussite": "Exact : selon le cours, l'asia session couvre la plage 00-09h. C'est durant cette fenêtre que se construit le range de référence de la journée.",
          "explication_echec": "D'après le cours, l'asia session se déroule de 00h à 09h. C'est la plage horaire attendue.",
          "reponses": [
            { "texte": "20-02h", "correcte": false },
            { "texte": "02-09h", "correcte": false },
            { "texte": "00-09h", "correcte": true }
          ]
        },
        {
          "libelle": "À quelle heure sont les meilleures entrées pour New York ?",
          "explication_reussite": "Exact : selon le cours, les meilleures fenêtres d'entrée sur New York sont 13-13h30 et 14h30-15h — les moments où la volatilité et les mouvements sont les plus exploitables.",
          "explication_echec": "D'après le cours, les meilleures entrées New York se situent sur les créneaux 13-13h30 et 14h30-15h. C'est cette plage qui est attendue.",
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
          "explication_reussite": "Exact : PDH/L signifie Previous Day High/Low — le plus haut et le plus bas de la veille. Ces niveaux servent souvent de cibles de liquidité.",
          "explication_echec": "Le PDH/L (Previous Day High/Low) désigne le plus haut et le plus bas du jour précédent — pas de la semaine ni du mois.",
          "reponses": [
            { "texte": "Le plus haut/bas du jour",       "correcte": true },
            { "texte": "Le plus haut/bas de la semaine", "correcte": false },
            { "texte": "Le plus haut/bas du mois",       "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un big figure ?",
          "explication_reussite": "Exact : un big figure est un niveau de prix rond, se terminant par 000 (ex. 1,2000). Ces niveaux psychologiques concentrent souvent des ordres et de la liquidité.",
          "explication_echec": "Un big figure n'est pas une figure chartiste : c'est un prix rond terminé par 000, un niveau psychologique où se logent beaucoup d'ordres.",
          "reponses": [
            { "texte": "Un point où le prix se termine par 000", "correcte": true },
            { "texte": "Une grande figure chartiste",            "correcte": false },
            { "texte": "Aucune des deux réponses",               "correcte": false }
          ]
        },
        {
          "libelle": "Quels jours vas-tu généralement chercher les plus hauts et les plus bas de la semaine ?",
          "explication_reussite": "Exact : d'après le cours, les extrêmes de la semaine se forment souvent le mardi ou le mercredi — le lundi sert de mise en place, la fin de semaine à exploiter le mouvement.",
          "explication_echec": "Selon le cours, les plus hauts et plus bas hebdomadaires se forment généralement mardi/mercredi, pas en début (lundi) ni en fin de semaine.",
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
          "explication_reussite": "Exact : en trading, une liquidité est un point d'intérêt où se concentrent des ordres (stops, prises de position). Le prix a tendance à venir la chercher.",
          "explication_echec": "Une liquidité n'est pas « de l'eau » ni un effet de levier : c'est un point d'intérêt du marché où se logent des ordres, que le prix vient souvent balayer.",
          "reponses": [
            { "texte": "Un point d'intérêt",               "correcte": true },
            { "texte": "De l'eau",                         "correcte": false },
            { "texte": "L'effet de levier des positions",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un EQX ?",
          "explication_reussite": "Exact : un EQX (Equal highs/lows) est un pattern de niveaux égaux qui signale souvent un reversal — le marché vient y prendre la liquidité avant de se retourner.",
          "explication_echec": "Un EQX est un pattern indiquant un reversal (retournement), pas une expansion ni une consolidation. Ces niveaux égaux attirent le prix avant l'inversion.",
          "reponses": [
            { "texte": "Un pattern indiquant une expansion",     "correcte": false },
            { "texte": "Un pattern indiquant un reversal",       "correcte": true },
            { "texte": "Un pattern indiquant une consolidation", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'annonce un orderblock ?",
          "explication_reussite": "Exact : un orderblock annonce généralement une expansion — une reprise franche du mouvement dans le sens du bloc d'ordres institutionnels.",
          "explication_echec": "Un orderblock annonce une expansion (accélération du prix), pas une consolidation ni un simple reversal. C'est la zone d'où repart le mouvement.",
          "reponses": [
            { "texte": "Une consolidation", "correcte": false },
            { "texte": "Un reversal",       "correcte": false },
            { "texte": "Une expansion",     "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un BSL/SSL ?",
          "explication_reussite": "Exact : BSL/SSL (Buy Side / Sell Side Liquidity) sont des zones de liquidité que le prix vient chercher, souvent avant un reversal.",
          "explication_echec": "Un BSL/SSL (liquidité côté achat / côté vente) est un pattern indiquant un reversal : le prix va prendre cette liquidité puis se retourne.",
          "reponses": [
            { "texte": "Un pattern indiquant une expansion",     "correcte": false },
            { "texte": "Un pattern indiquant un reversal",       "correcte": true },
            { "texte": "Un pattern indiquant une consolidation", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un orderblock ?",
          "explication_reussite": "Exact : un orderblock est le dernier bloc d'ordres avant un mouvement inverse — le dernier achat avant une vente, ou la dernière vente avant un achat. Les deux définitions sont vraies.",
          "explication_echec": "Un orderblock se définit dans les deux sens : dernier buy avant le sell ET dernier sell avant le buy. C'est pourquoi les deux réponses sont vraies.",
          "reponses": [
            { "texte": "Le dernier buy avant le sell",  "correcte": false },
            { "texte": "Le dernier sell avant le buy",  "correcte": false },
            { "texte": "Les deux réponses sont vraies", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le MTB ?",
          "explication_reussite": "Exact : le MTB est un pattern qui aide à trouver le bon moment pour entrer en position — un signal d'entrée, pas de sortie.",
          "explication_echec": "Le MTB est un pattern d'aide à l'entrée en position, pas à la sortie ni un simple retracement. Il sert à déclencher le trade au bon endroit.",
          "reponses": [
            { "texte": "Un pattern d'aide à l'entrée en position",    "correcte": true },
            { "texte": "Un pattern d'aide à la sortie de position",   "correcte": false },
            { "texte": "Un pattern de retracement",                   "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le seek & destroy ?",
          "explication_reussite": "Exact : le seek & destroy sert à anticiper les prochaines liquidités — repérer où le marché va aller chercher les ordres avant de poursuivre son mouvement.",
          "explication_echec": "Le seek & destroy vise à anticiper les prochaines liquidités que le prix va balayer, pas à prévenir une AMD ni à deviner le biais de session.",
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
          "explication_reussite": "Exact : une moyenne mobile pondère les dernières cotations pour lisser le prix et dégager la tendance. Elle glisse dans le temps à chaque nouvelle bougie.",
          "explication_echec": "Une moyenne mobile est une pondération des dernières cotations (les derniers prix), pas du market cap ni des SL/TP. Elle sert à lisser et suivre la tendance.",
          "reponses": [
            { "texte": "La pondération des dernières cotations",       "correcte": true },
            { "texte": "La pondération du market cap",                 "correcte": false },
            { "texte": "La pondération des SL et des TP sur le chart", "correcte": false }
          ]
        },
        {
          "libelle": "Comment s'appelle-t-il quand deux moyennes mobiles se croisent à la hausse ?",
          "explication_reussite": "Exact : un golden cross survient quand une moyenne mobile courte passe au-dessus d'une longue — un signal haussier classique. Le death cross en est l'inverse baissier.",
          "explication_echec": "Le croisement haussier de deux moyennes mobiles s'appelle un golden cross. Le death cross, lui, est le croisement baissier — c'est l'inverse.",
          "reponses": [
            { "texte": "Death cross",  "correcte": false },
            { "texte": "Golden cross", "correcte": true },
            { "texte": "High cross",   "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le market profile ?",
          "explication_reussite": "Exact : le market profile résume et simplifie l'activité des dernières séances en montrant à quels prix le marché a le plus échangé — utile pour repérer les zones de valeur.",
          "explication_echec": "Le market profile n'est pas un pattern : c'est un indicateur qui résume et simplifie les dernières séances pour visualiser où le marché s'est le plus négocié.",
          "reponses": [
            { "texte": "Un pattern",                                                          "correcte": false },
            { "texte": "Un indicateur qui montre où est la liquidité",                        "correcte": false },
            { "texte": "Un indicateur qui résume et simplifie les derniers jours de pondération", "correcte": true }
          ]
        },
        {
          "libelle": "Comment s'appelle la zone où il y a eu le plus de transactions sur le market profile ?",
          "explication_reussite": "Exact : la value area est la zone où s'est concentré l'essentiel des échanges — le « cœur » de la valeur négociée, où le prix revient souvent.",
          "explication_echec": "La zone la plus échangée du market profile s'appelle la value area, pas la « high area » ni la « zone de haute valeur ».",
          "reponses": [
            { "texte": "La high area",         "correcte": false },
            { "texte": "La zone de haute valeur", "correcte": false },
            { "texte": "La value area",        "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le volume profile ?",
          "explication_reussite": "Exact : le volume profile montre à quels niveaux de prix le plus de volume (donc de liquidité) a été échangé. Ces zones agissent souvent comme des aimants ou des supports/résistances.",
          "explication_echec": "Le volume profile indique où il y a eu le plus de liquidité échangée, pas directement les supports/résistances ni les zones de TP/SL.",
          "reponses": [
            { "texte": "Un indicateur qui montre les zones de support résistance", "correcte": false },
            { "texte": "Un indicateur qui montre les zones de TP et SL",           "correcte": false },
            { "texte": "Un indicateur qui montre où il y a eu le plus de liquidité", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le RSI ?",
          "explication_reussite": "Exact : le RSI (Relative Strength Index) mesure la force du mouvement pour repérer les zones de surachat (>70) et de survente (<30), signes d'un possible essoufflement.",
          "explication_echec": "Le RSI est un indicateur de surachat et de survente, pas de tendance ni de volatilité. Il signale quand le prix est monté ou descendu trop vite.",
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
          "explication_reussite": "Exact : au-delà d'une simple position, les options servent à couvrir tout un portefeuille — se protéger contre une baisse générale, comme une assurance.",
          "explication_echec": "Les options ne servent pas seulement à couvrir ou amplifier une position isolée : leur usage clé est de couvrir un portefeuille entier contre le risque.",
          "reponses": [
            { "texte": "Couvrir une position",    "correcte": false },
            { "texte": "Amplifier une position",  "correcte": false },
            { "texte": "Couvrir un portefeuille", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que les greeks ?",
          "explication_reussite": "Exact : les greeks (delta, vega, gamma, rho, theta) sont les mesures de sensibilité d'une option — au prix, à la volatilité, au temps, aux taux. Elles pilotent la gestion du risque.",
          "explication_echec": "Les greeks sont delta, vega, gamma, rho et theta — les lettres grecques qui mesurent la sensibilité d'une option. Attention aux listes incomplètes ou mal orthographiées.",
          "reponses": [
            { "texte": "Alpha, beta, gamma, theta, vega", "correcte": false },
            { "texte": "Alpha, beta, gamma, rho",         "correcte": false },
            { "texte": "Delta, vega, gamma, rho, theta",  "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un alpha ?",
          "explication_reussite": "D'après le cours, l'alpha correspond à l'actif de référence d'un portefeuille — la base à laquelle on compare sa performance.",
          "explication_echec": "Selon le cours, l'alpha désigne l'actif de référence d'un portefeuille. C'est la réponse attendue ici.",
          "reponses": [
            { "texte": "Le chef d'une meute de loups",           "correcte": false },
            { "texte": "La mesure de la volatilité d'un actif",  "correcte": false },
            { "texte": "L'actif de référence d'un portefeuille", "correcte": true }
          ]
        },
        {
          "libelle": "À quoi sert le delta ?",
          "explication_reussite": "Exact : le delta mesure de combien le prix de l'option varie quand le sous-jacent bouge — sa sensibilité, ou corrélation, aux variations de prix du sous-jacent.",
          "explication_echec": "Le delta traduit le lien entre le prix de l'option et celui du sous-jacent (variation de prix), pas la volatilité sous-jacente ni l'érosion dans le temps (c'est le theta).",
          "reponses": [
            { "texte": "Voir la volatilité sous-jacente",                              "correcte": false },
            { "texte": "Voir la corrélation au sous-jacent en termes de variation de prix", "correcte": true },
            { "texte": "Voir l'érosion temporelle",                                    "correcte": false }
          ]
        },
        {
          "libelle": "Comment s'appelle le fait de couvrir un portefeuille avec des options ?",
          "explication_reussite": "Exact : couvrir un portefeuille avec des options s'appelle le hedging — une protection qui limite les pertes en cas de baisse, à la manière d'une assurance.",
          "explication_echec": "Le terme consacré est le hedging (couverture). « L'optionage » n'existe pas ; « la couverture » en est la traduction, mais le mot attendu est hedging.",
          "reponses": [
            { "texte": "Le hedging",    "correcte": true },
            { "texte": "La couverture", "correcte": false },
            { "texte": "L'optionage",   "correcte": false }
          ]
        },
        {
          "libelle": "À quoi servent les options ?",
          "explication_reussite": "Exact : les options permettent de couvrir un portefeuille contre ses pertes latentes — protéger des positions en moins-value sans les vendre, en attendant un rebond.",
          "explication_echec": "L'usage visé ici est de couvrir un portefeuille sur ses pertes latentes (positions en moins-value), pas de trader différemment ni de « trader plus sûr » en général.",
          "reponses": [
            { "texte": "À couvrir un portefeuille sur des pertes latentes", "correcte": true },
            { "texte": "À faire du trading différemment",                   "correcte": false },
            { "texte": "À trader de manière plus sécuritaire",              "correcte": false }
          ]
        },
        {
          "libelle": "À quoi sert le theta ?",
          "explication_reussite": "Exact : le theta mesure l'érosion temporelle d'une option — la valeur qu'elle perd chaque jour qui passe, à mesure que l'échéance approche.",
          "explication_echec": "Le theta quantifie l'érosion temporelle (la perte de valeur avec le temps), pas la volatilité ni le rendement ajusté au risque.",
          "reponses": [
            { "texte": "Calculer la volatilité",                 "correcte": false },
            { "texte": "Calculer le rendement ajusté au risque", "correcte": false },
            { "texte": "Calculer l'érosion temporelle",          "correcte": true }
          ]
        },
        {
          "libelle": "À quoi sert le ratio de Sharpe ?",
          "explication_reussite": "Exact : le ratio de Sharpe mesure la performance ajustée au risque — combien de rendement on obtient par unité de risque prise. Plus il est élevé, mieux c'est.",
          "explication_echec": "Le ratio de Sharpe rapporte le rendement au risque (la performance ajustée au risque), il ne calcule ni un simple écart type ni un écart plus-haut/plus-bas.",
          "reponses": [
            { "texte": "Calculer l'écart type",                    "correcte": false },
            { "texte": "Calculer la performance ajustée au risque", "correcte": true },
            { "texte": "Calculer la différence entre le plus haut et le plus bas d'un actif sur une période donnée", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une covariance ?",
          "explication_reussite": "D'après le cours, la covariance est ici définie comme la différence de volatilité implicite entre deux sous-jacents.",
          "explication_echec": "Selon le cours, la bonne réponse est « la différence de volatilité implicite entre deux sous-jacents ». C'est la définition retenue ici.",
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
          "explication_reussite": "Exact : le dollar américain est la devise de référence mondiale — monnaie du commerce international, des réserves des banques centrales et de la plupart des matières premières.",
          "explication_echec": "La devise majeure du monde est le dollar : c'est la monnaie de réserve internationale, devant l'euro et le yen. Le pétrole et l'or se cotent d'ailleurs en dollars.",
          "reponses": [
            { "texte": "Euro",   "correcte": false },
            { "texte": "Dollar", "correcte": true },
            { "texte": "Yen",    "correcte": false }
          ]
        },
        {
          "libelle": "Que signifie dovish ?",
          "explication_reussite": "Exact : « dovish » (colombe) qualifie une banque centrale accommodante, encline à baisser les taux pour soutenir l'économie. Son contraire est « hawkish » (faucon).",
          "explication_echec": "« Dovish » désigne une posture accommodante : la banque centrale penche pour baisser les taux, pas les augmenter (ce serait « hawkish »).",
          "reponses": [
            { "texte": "Que la banque est encline à augmenter les taux", "correcte": false },
            { "texte": "Que la banque est encline à baisser les taux",   "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une opération d'open market ?",
          "explication_reussite": "Exact : lors d'une opération d'open market, la banque centrale achète (ou vend) des titres sur le marché pour injecter ou retirer des liquidités et piloter les taux.",
          "explication_echec": "Une opération d'open market, c'est la banque centrale qui achète un titre pour agir sur les liquidités et stabiliser le marché — pas une émission de titres ni l'arrivée d'un nouvel intervenant.",
          "reponses": [
            { "texte": "Quand de nouveaux titres sont émis pour la première fois sur le marché", "correcte": false },
            { "texte": "Quand la banque centrale achète un titre pour stabiliser le cours",       "correcte": true },
            { "texte": "Quand de nouveaux intervenants arrivent sur le marché",                   "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le risk on ?",
          "explication_reussite": "Exact : en phase de « risk on », les investisseurs sont confiants et se tournent vers les actifs risqués (actions, crypto). À l'inverse, le « risk off » est un repli vers la sécurité.",
          "explication_echec": "« Risk on » décrit un marché où les investisseurs prennent du risque, pas où ils deviennent prudents (ce serait « risk off »).",
          "reponses": [
            { "texte": "Quand les investisseurs sont enclins à prendre du risque", "correcte": true },
            { "texte": "Quand les investisseurs deviennent de nature prudente",    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la balance commerciale ?",
          "explication_reussite": "Exact : la balance commerciale est la différence entre les exportations et les importations d'un pays. Positive, elle est excédentaire ; négative, déficitaire.",
          "explication_echec": "La balance commerciale n'est pas le total des importations ni des exportations, mais leur différence : ce que le pays vend à l'étranger moins ce qu'il achète.",
          "reponses": [
            { "texte": "La différence entre les importations et les exportations dans le pays", "correcte": true },
            { "texte": "Le total d'importation dans un pays",                                   "correcte": false },
            { "texte": "Le total d'exportation d'un pays",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'impact du déficit sur l'économie ?",
          "explication_reussite": "Exact : d'après le cours, un déficit finit par se financer par l'impôt, ce qui alourdit la charge pesant sur les entreprises. C'est l'impact retenu ici.",
          "explication_echec": "Selon le cours, le déficit se traduit par des hausses d'impôts qui pèsent sur les entreprises. C'est cet effet qui est attendu, plutôt que l'inflation.",
          "reponses": [
            { "texte": "Il cause des augmentations d'impôts qui pèsent sur les entreprises", "correcte": true },
            { "texte": "Il peut faire augmenter l'inflation",                                "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'inflation finalement ?",
          "explication_reussite": "Exact : l'inflation, c'est à la fois une hausse des prix, une baisse de la valeur de l'argent et un déséquilibre entre l'offre et la demande. Les trois facettes sont vraies.",
          "explication_echec": "Chaque proposition décrit une facette de l'inflation : hausse des prix, perte de valeur de la monnaie, déséquilibre offre/demande. C'est pourquoi toutes ces réponses sont vraies.",
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
          "explication_reussite": "Exact : l'Allemagne est la première puissance économique d'Europe — plus grand PIB de la zone, moteur industriel et exportateur majeur du continent.",
          "explication_echec": "Le leader économique européen est l'Allemagne, devant la France et la Suisse : c'est la plus grosse économie de l'Union.",
          "reponses": [
            { "texte": "France",    "correcte": false },
            { "texte": "Allemagne", "correcte": true },
            { "texte": "Suisse",    "correcte": false }
          ]
        },
        {
          "libelle": "Quel est le leader économique mondial ?",
          "explication_reussite": "Exact : les États-Unis sont la première puissance économique mondiale — plus grand PIB, monnaie de réserve et marchés financiers dominants.",
          "explication_echec": "Le leader économique mondial reste les États-Unis, devant la Chine, loin devant la Russie ou le Japon en termes de PIB et d'influence financière.",
          "reponses": [
            { "texte": "Russie",      "correcte": false },
            { "texte": "États-Unis",  "correcte": true },
            { "texte": "Japon",       "correcte": false }
          ]
        },
        {
          "libelle": "Le Bovespa est l'indice de quel pays ?",
          "explication_reussite": "Exact : le Bovespa (Ibovespa) est l'indice boursier de référence du Brésil, à la bourse de São Paulo.",
          "explication_echec": "Le Bovespa est l'indice phare du Brésil (bourse de São Paulo), pas d'un autre pays d'Amérique latine comme l'Argentine.",
          "reponses": [
            { "texte": "Amérique latine", "correcte": false },
            { "texte": "Brésil",          "correcte": true },
            { "texte": "Argentine",       "correcte": false }
          ]
        },
        {
          "libelle": "Quel est l'indice du dollar ?",
          "explication_reussite": "Exact : le DXY (Dollar Index) mesure la valeur du dollar face à un panier de devises majeures. Il donne la « force » globale du billet vert.",
          "explication_echec": "L'indice du dollar s'écrit DXY, pas « DXYX » ni « DXX ». Il suit le dollar contre un panier de devises (euro, yen, livre…).",
          "reponses": [
            { "texte": "DXYX", "correcte": false },
            { "texte": "DXX",  "correcte": false },
            { "texte": "DXY",  "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le principal secteur de dominance des États-Unis ?",
          "explication_reussite": "Exact : la technologie est le secteur où les États-Unis dominent le monde — les géants du Nasdaq (Apple, Microsoft, Nvidia…) pèsent une part énorme des marchés.",
          "explication_echec": "Le secteur de dominance des États-Unis est la technologie, pas la médecine ni la manufacture. C'est le cœur de leur puissance boursière.",
          "reponses": [
            { "texte": "La technologie", "correcte": true },
            { "texte": "La médecine",    "correcte": false },
            { "texte": "La manufacture", "correcte": false }
          ]
        },
        {
          "libelle": "Le FTSE250 est l'indice :",
          "explication_reussite": "Exact : le FTSE 250 est un indice de la bourse de Londres, regroupant des sociétés britanniques (les 250 suivant le FTSE 100).",
          "explication_echec": "Le FTSE 250 est un indice du Royaume-Uni (bourse de Londres), pas du Japon ni de l'Australie.",
          "reponses": [
            { "texte": "Du Japon",       "correcte": false },
            { "texte": "D'Australie",    "correcte": false },
            { "texte": "Du Royaume-Uni", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Nasdaq 100 ?",
          "explication_reussite": "Exact : le Nasdaq 100 regroupe les 100 plus grosses entreprises technologiques cotées aux États-Unis. C'est le baromètre de la tech américaine.",
          "explication_echec": "Le Nasdaq 100, ce sont les 100 plus grosses boîtes tech US — la dimension technologique est essentielle, ce n'est pas juste « les 100 plus grosses » toutes catégories.",
          "reponses": [
            { "texte": "Les 100 plus grosses boîtes tech US", "correcte": true },
            { "texte": "Les 100 plus grosses boîtes US",      "correcte": false },
            { "texte": "C'est une bourse",                    "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Nasdaq ?",
          "explication_reussite": "Exact : le Nasdaq est à la fois une bourse américaine ET un indice regroupant ses ~3000 sociétés (surtout technologiques). Les deux définitions sont vraies.",
          "explication_echec": "Le mot « Nasdaq » désigne les deux à la fois : la bourse et l'indice de ses milliers de sociétés cotées. C'est pourquoi les deux réponses sont vraies.",
          "reponses": [
            { "texte": "Une bourse",                                                        "correcte": false },
            { "texte": "Les 3000 plus grosses boîtes non financières cotées aux États-Unis", "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                     "correcte": true }
          ]
        },
        {
          "libelle": "Combien y a-t-il de cycles immobiliers ?",
          "explication_reussite": "Exact : le cours retient quatre phases dans le cycle immobilier (reprise, expansion, surchauffe, récession). Retiens : 4.",
          "explication_echec": "D'après le cours, le cycle immobilier compte quatre phases. La bonne réponse est 4.",
          "reponses": [
            { "texte": "4",         "correcte": true },
            { "texte": "5",         "correcte": false },
            { "texte": "ça dépend", "correcte": false }
          ]
        },
        {
          "libelle": "Quelle est la différence entre un ETF et un indice ?",
          "explication_reussite": "Exact : un ETF réplique un indice mais, contrairement à lui, s'achète et se revend en bourse. L'indice n'est qu'une mesure ; l'ETF est le produit investissable qui le suit. Les deux réponses sont vraies.",
          "explication_echec": "Les deux affirmations sont justes : l'ETF est corrélé à l'indice ET seul l'ETF peut s'acheter/se trader (l'indice, lui, ne se trade pas directement). D'où « les deux réponses sont vraies ».",
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
          "explication_reussite": "Exact : le FOMC (Federal Open Market Committee) est la réunion officielle de la FED qui décide des taux directeurs américains. Ses annonces font bouger tous les marchés.",
          "explication_echec": "Le FOMC est la réunion officielle de la FED (pas un simple communiqué ni un discours) : c'est là que se décide la politique monétaire des États-Unis.",
          "reponses": [
            { "texte": "Réunion officielle de la FED",        "correcte": true },
            { "texte": "Communiqué sur les taux directeurs",  "correcte": false },
            { "texte": "Discours de la FED",                  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le JOLTS ?",
          "explication_reussite": "Exact : le JOLTS est un indicateur du marché de l'emploi américain (offres et dynamique de l'emploi). Il renseigne sur la santé du travail aux États-Unis.",
          "explication_echec": "Le JOLTS concerne la création et la dynamique de l'emploi, pas le chômage ni la recherche d'emploi. C'est un baromètre du marché du travail.",
          "reponses": [
            { "texte": "Annonce de création d'emploi",   "correcte": true },
            { "texte": "Annonce du chômage",             "correcte": false },
            { "texte": "Annonce de recherche d'emploi",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le NFP ?",
          "explication_reussite": "Exact : le NFP (Non-Farm Payrolls) mesure les créations d'emploi non agricoles aux États-Unis. Publié chaque mois, c'est l'une des données les plus suivies.",
          "explication_echec": "Le NFP annonce les créations d'emploi (hors secteur agricole) aux États-Unis, pas le chômage ni la recherche d'emploi. C'est un indicateur majeur de l'activité.",
          "reponses": [
            { "texte": "Annonce de création d'emploi",   "correcte": true },
            { "texte": "Annonce du chômage",             "correcte": false },
            { "texte": "Annonce de recherche d'emploi",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le retails sales ?",
          "explication_reussite": "Exact : le retail sales mesure les ventes au détail — la consommation des ménages. C'est un thermomètre clé de la demande et de la santé économique.",
          "explication_echec": "Le retail sales, ce sont les ventes au détail (la consommation), pas la rotation des stocks ni les commandes aux fournisseurs.",
          "reponses": [
            { "texte": "La rotation des stocks",     "correcte": false },
            { "texte": "Les ventes au détail",       "correcte": true },
            { "texte": "Les commandes fournisseurs", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'IPC ?",
          "explication_reussite": "Exact : l'IPC (Indice des Prix à la Consommation) mesure l'évolution des prix d'un panier de biens et services. C'est l'indicateur de référence de l'inflation.",
          "explication_echec": "L'IPC mesure les prix à la consommation (l'inflation), pas les dépenses des ménages ni la confiance dans l'économie.",
          "reponses": [
            { "texte": "L'indice des prix à la consommation",  "correcte": true },
            { "texte": "L'indice de dépense des ménages",      "correcte": false },
            { "texte": "L'indice de confiance en l'économie",  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que le GDP Growth rate ?",
          "explication_reussite": "Exact : le GDP Growth rate est le taux de croissance du PIB — la vitesse à laquelle l'économie progresse (ou recule) d'une période à l'autre.",
          "explication_echec": "Le GDP Growth rate n'est pas le PIB lui-même mais son taux de croissance : de combien l'économie grandit en pourcentage.",
          "reponses": [
            { "texte": "L'annonce du PIB",             "correcte": false },
            { "texte": "Le taux de croissance du PIB", "correcte": true },
            { "texte": "Le PIB trimestriel",           "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'inflation rate ?",
          "explication_reussite": "Exact : l'inflation rate est généralement mesurée sur 12 mois glissants — la hausse des prix sur un an, comparée au même mois de l'année précédente.",
          "explication_echec": "L'inflation rate se lit sur 12 mois glissants (variation annuelle des prix), pas seulement depuis le début de l'année (YTD) ni comme une vague « évolution ».",
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
          "explication_reussite": "Exact : un ratio financier met en rapport deux grandeurs comptables pour évaluer la santé d'une entreprise (endettement, rentabilité, liquidité…). Il aide à lire sa valeur.",
          "explication_echec": "Un ratio financier est un indicateur qui éclaire la valeur comptable et la santé d'une entreprise, au-delà d'un simple calcul de rentabilité ou de résultat.",
          "reponses": [
            { "texte": "Indicateur permettant de connaître la valeur comptable d'une entreprise", "correcte": true },
            { "texte": "Calcul de rentabilité",                                                   "correcte": false },
            { "texte": "Calcul permettant de savoir combien gagne et perd une entreprise",        "correcte": false }
          ]
        },
        {
          "libelle": "Le pétrole est-il une commodité importante dans le monde ?",
          "explication_reussite": "Exact : le pétrole est la matière première la plus stratégique du monde — énergie, transport, industrie. Son prix influence toute l'économie mondiale.",
          "explication_echec": "Oui, sans hésiter : le pétrole est une commodité majeure. Il pèse sur l'énergie, l'inflation et la géopolitique mondiale.",
          "reponses": [
            { "texte": "Oui",       "correcte": true },
            { "texte": "Non",       "correcte": false },
            { "texte": "ça dépend", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qui a le plus de valeur entre l'or et l'argent ?",
          "explication_reussite": "Exact : à quantité égale, l'or vaut bien plus que l'argent (le métal). Plus rare et refuge par excellence, son cours est nettement supérieur.",
          "explication_echec": "Entre les deux métaux, c'est l'or qui a le plus de valeur à poids égal — de loin plus cher que l'argent.",
          "reponses": [
            { "texte": "L'or",           "correcte": true },
            { "texte": "L'argent",       "correcte": false },
            { "texte": "C'est différent", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un bilan ?",
          "explication_reussite": "Exact : le bilan est une photographie de la santé financière d'une entreprise à un instant donné — ce qu'elle possède (actif) face à ce qu'elle doit (passif).",
          "explication_echec": "Le bilan reflète la santé financière de l'entreprise (patrimoine, dettes), il ne se résume ni à « charges moins résultat » ni à la seule rentabilité.",
          "reponses": [
            { "texte": "La santé financière de l'entreprise", "correcte": true },
            { "texte": "Les charges - moins le résultat",     "correcte": false },
            { "texte": "La rentabilité de l'entreprise",      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une obligation ?",
          "explication_reussite": "Exact : une obligation est une dette émise par une entreprise ou une société pour se financer. L'acheteur prête de l'argent et perçoit des intérêts.",
          "explication_echec": "Une obligation est une dette émise par une entreprise ou une société : en l'achetant, tu prêtes de l'argent contre des intérêts. C'est la réponse retenue par le cours.",
          "reponses": [
            { "texte": "Une dette émise par un État pour financer son déficit",           "correcte": false },
            { "texte": "Une dette émise par une entreprise pour régler ses problèmes",    "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                   "correcte": false },
            { "texte": "Une dette émise par une entreprise, par une société ou une entreprise", "correcte": true }
          ]
        },
        {
          "libelle": "Les obligations sont des produits :",
          "explication_reussite": "Exact : les obligations sont considérées comme des placements d'investissement peu risqués — revenu régulier via les intérêts, capital généralement remboursé à l'échéance.",
          "explication_echec": "Les obligations sont des produits d'investissement peu risqués, pas des outils de spéculation ou de trading : on les détient pour leurs intérêts, pas pour spéculer.",
          "reponses": [
            { "texte": "De spéculation / trading",       "correcte": false },
            { "texte": "D'investissement peu risqué",    "correcte": true }
          ]
        },
        {
          "libelle": "Investir en obligation revient-il à investir sur un État ?",
          "explication_reussite": "Exact : dans le cadre du cours, investir en obligation revient à prêter à un émetteur — souvent un État — dont on parie sur la capacité à rembourser sa dette.",
          "explication_echec": "Selon le cours, la réponse attendue est « Oui » : acheter une obligation, c'est prêter à un émetteur (typiquement un État) et miser sur son remboursement.",
          "reponses": [
            { "texte": "Oui", "correcte": true },
            { "texte": "Non", "correcte": false }
          ]
        },
        {
          "libelle": "Une obligation :",
          "explication_reussite": "Exact : une obligation verse des intérêts réguliers pendant sa durée de vie ET rembourse le capital à l'échéance. Les deux caractéristiques sont vraies.",
          "explication_echec": "Une obligation combine les deux : elle verse des intérêts durant sa vie et rembourse le capital à l'échéance. C'est pourquoi « les deux réponses sont vraies ».",
          "reponses": [
            { "texte": "Est remboursée totalement à l'échéance",                        "correcte": false },
            { "texte": "Verse des intérêts constants pendant la période de détention",  "correcte": false },
            { "texte": "Les deux réponses sont vraies",                                 "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le risque d'une obligation ?",
          "explication_reussite": "Exact : le principal risque d'une obligation est le risque de crédit — que l'émetteur ne rembourse pas (défaut). C'est pour cela que la solidité de l'émetteur est primordiale.",
          "explication_echec": "Le risque clé d'une obligation est le risque de crédit (défaut de l'émetteur). La « faillite » en est une forme, mais le terme financier consacré est le risque de crédit.",
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
          "explication_reussite": "Exact : en modèle A book, le broker transmet directement les ordres au marché réel. Il se rémunère sur les commissions, sans se positionner contre le trader.",
          "explication_echec": "Le A book, c'est la transmission directe des ordres du broker vers le marché — pas une transmission indirecte. Le broker n'est alors qu'un pont vers la liquidité.",
          "reponses": [
            { "texte": "Une transmission directe des ordres du broker sur le marché", "correcte": true },
            { "texte": "Une transmission indirecte des ordres au marché",             "correcte": false }
          ]
        },
        {
          "libelle": "Le B book est-il de l'arnaque ?",
          "explication_reussite": "Exact : le B book (le broker prend la contrepartie en interne) n'est pas une arnaque en soi — c'est un modèle économique légal et courant. Tout dépend de son exécution et de sa transparence.",
          "explication_echec": "Non : le B book n'est pas une arnaque, c'est un modèle légal où le broker prend la contrepartie. Il devient problématique seulement en cas de mauvaises pratiques.",
          "reponses": [
            { "texte": "Oui", "correcte": false },
            { "texte": "Non", "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le meilleur choix ?",
          "explication_reussite": "Exact : entre A book et B book, il n'y a pas de gagnant universel — tout dépend de ta manière de trader (style, volume, fréquence). Le bon modèle est celui qui s'y adapte.",
          "explication_echec": "Ni le A book ni le B book ne sont « meilleurs » dans l'absolu : le bon choix dépend de la manière de trader. D'où « tout dépend de la manière de trader ».",
          "reponses": [
            { "texte": "A book",                             "correcte": false },
            { "texte": "B book",                             "correcte": false },
            { "texte": "tout dépend de la manière de trader", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une fusion en finance ?",
          "explication_reussite": "Exact : une fusion, c'est deux entreprises qui se réunissent pour n'en former qu'une seule. Elles mettent en commun leurs actifs et leur activité.",
          "explication_echec": "Une fusion, c'est deux entreprises qui fusionnent en une seule — pas seulement une association, ni forcément deux acteurs du même secteur.",
          "reponses": [
            { "texte": "2 entreprises du même secteur qui fusionnent", "correcte": false },
            { "texte": "2 entreprises qui fusionnent",                 "correcte": true },
            { "texte": "2 entreprises qui s'associent",               "correcte": false }
          ]
        },
        {
          "libelle": "Dans une acquisition, comment est appelée l'entreprise qui se fait acheter ?",
          "explication_reussite": "Exact : dans une acquisition, l'entreprise visée s'appelle la cible. L'acquéreur cherche à en prendre le contrôle.",
          "explication_echec": "L'entreprise rachetée est la cible d'une acquisition — le terme consacré. Ni « proie » ni « objectif » ne sont le vocabulaire employé en finance.",
          "reponses": [
            { "texte": "Proie",    "correcte": false },
            { "texte": "Cible",    "correcte": true },
            { "texte": "Objectif", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un swap ?",
          "explication_reussite": "Exact : le swap est le coût (ou gain) appliqué quand on laisse une position ouverte la nuit — les frais liés au report d'un trade au-delà de la séance.",
          "explication_echec": "Ici, le swap désigne les frais payés pour garder un trade ouvert le soir (report overnight), pas le spread ni les frais du week-end pris isolément.",
          "reponses": [
            { "texte": "Les frais payés pour laisser un trade tourner le soir",                "correcte": true },
            { "texte": "Les frais payés pour laisser un trade tourner le week-end",            "correcte": false },
            { "texte": "La différence entre le bid et le ask qui constitue la commission du broker", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un spread ?",
          "explication_reussite": "Exact : le spread est l'écart entre le prix d'achat (ask) et le prix de vente (bid). C'est la commission implicite que prend le broker sur chaque trade.",
          "explication_echec": "Le spread est la différence entre le bid et le ask — le coût de transaction du broker — pas un frais de report (ça, c'est le swap).",
          "reponses": [
            { "texte": "Les frais payés pour laisser un trade tourner le soir",                "correcte": false },
            { "texte": "Les frais payés pour laisser un trade tourner le week-end",            "correcte": false },
            { "texte": "La différence entre le bid et le ask qui constitue la commission du broker", "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'une fusion verticale ?",
          "explication_reussite": "Exact : une fusion verticale réunit des entreprises situées à différents maillons d'une même chaîne de production (fournisseur + fabricant, par ex.) pour gagner en efficacité et réduire les coûts.",
          "explication_echec": "La fusion verticale concerne des acteurs de la même chaîne de production (amont/aval), pas des concurrents du même secteur (ça, c'est une fusion horizontale).",
          "reponses": [
            { "texte": "Deux entreprises de taille similaire qui s'unissent pour former une nouvelle entité", "correcte": false },
            { "texte": "Des entreprises du même secteur d'activité qui se regroupent pour augmenter leur part de marché", "correcte": false },
            { "texte": "Des entreprises de la même chaîne de production qui se regroupent pour améliorer l'efficacité et réduire les coûts", "correcte": true }
          ]
        },
        {
          "libelle": "Quel est le cycle économique le plus long ?",
          "explication_reussite": "Exact : le cycle de Kondratieff est le plus long (environ 40 à 60 ans), lié aux grandes vagues d'innovation technologique. Juglar et Kitchin sont bien plus courts.",
          "explication_echec": "Le cycle le plus long est celui de Kondratieff (plusieurs décennies), pas celui de Juglar (~10 ans) ni de Kitchin (~3-4 ans).",
          "reponses": [
            { "texte": "Celui de Kondratieff", "correcte": true },
            { "texte": "Celui de Juglar",      "correcte": false },
            { "texte": "Celui de Kitchin",     "correcte": false }
          ]
        },
        {
          "libelle": "Quel est le cycle économique le plus court ?",
          "explication_reussite": "Exact : le cycle de Kitchin est le plus court (environ 3 à 4 ans), lié aux variations de stocks des entreprises.",
          "explication_echec": "Le cycle le plus court est celui de Kitchin (~3-4 ans), pas Juglar (~10 ans) ni Kondratieff (plusieurs décennies).",
          "reponses": [
            { "texte": "Celui de Kondratieff", "correcte": false },
            { "texte": "Celui de Juglar",      "correcte": false },
            { "texte": "Celui de Kitchin",     "correcte": true }
          ]
        },
        {
          "libelle": "Pendant une période de creux :",
          "explication_reussite": "Exact : le creux, c'est le bas de cycle — le moment d'acheter ce qui sous-performe à bon prix pour le revendre plus haut quand la reprise arrive. « Acheter la peur ».",
          "explication_echec": "En période de creux, la stratégie gagnante est de racheter ce qui sous-performe pour revendre plus haut ensuite — pas de vendre à perte ni d'attendre passivement.",
          "reponses": [
            { "texte": "On revend nos mauvais investissements et on assume notre perte",       "correcte": false },
            { "texte": "On en profite pour racheter ce qui sous-performe pour revendre plus haut", "correcte": true },
            { "texte": "On attend la reprise économique",                                      "correcte": false }
          ]
        },
        {
          "libelle": "Pendant une période de pic :",
          "explication_reussite": "Exact : au pic du cycle, on revend les actifs spéculatifs qui ont beaucoup monté, avant le retournement. « Vendre l'euphorie ».",
          "explication_echec": "En période de pic, on revend les actifs spéculatifs à leur sommet — pas les actifs défensifs (safe). L'idée est de sécuriser les gains avant la baisse.",
          "reponses": [
            { "texte": "On revend les actifs spéculatifs à leur pic", "correcte": true },
            { "texte": "On revend les actifs safe à leur pic",        "correcte": false },
            { "texte": "On revend les actifs cycliques à leur pic",   "correcte": false },
            { "texte": "Les 3 réponses sont vraies",                  "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que la Due diligence ?",
          "explication_reussite": "Exact : la due diligence est l'audit approfondi d'une cible avant une acquisition — on vérifie ses comptes, ses risques et sa vraie valeur avant de s'engager.",
          "explication_echec": "La due diligence est l'audit et l'évaluation d'une cible avant rachat, pas une offre d'achat publique ni un montage fiscal.",
          "reponses": [
            { "texte": "Une offre d'achat publique",         "correcte": false },
            { "texte": "L'audit et l'évaluation d'une cible", "correcte": true },
            { "texte": "Un montage fiscal pour le M&A",      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un LBO ?",
          "explication_reussite": "Exact : un LBO (Leveraged Buy-Out) est le rachat d'une cible principalement financé par de la dette, remboursée ensuite grâce aux bénéfices de l'entreprise rachetée.",
          "explication_echec": "Un LBO, c'est l'achat d'une cible grâce à de la dette (effet de levier), pas une défense anti-OPA ni un dispositif de rétention d'employés.",
          "reponses": [
            { "texte": "L'offre d'action à bas prix envers les actionnaires existants pour éviter une OPA hostile", "correcte": false },
            { "texte": "L'achat d'une cible grâce à de la dette", "correcte": true },
            { "texte": "Des conditions favorables données à des employés après une fusion pour éviter qu'ils quittent la boîte", "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un golden parachute ?",
          "explication_reussite": "Exact : un golden parachute est une indemnité généreuse versée à un dirigeant s'il est écarté après une fusion ou une acquisition. Une « sortie en or ».",
          "explication_echec": "Le golden parachute est une compensation financière pour un dirigeant licencié suite à une fusion/acquisition, pas un plan de restructuration ni de rentabilisation.",
          "reponses": [
            { "texte": "Compensation financière accordée à un gérant en cas de licenciement après une fusion ou acquisition", "correcte": true },
            { "texte": "Projet de restructuration pour une société en faillite",                  "correcte": false },
            { "texte": "Projet pour rentabiliser l'achat d'une société par une plus grosse",      "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce que l'Altman Z score ?",
          "explication_reussite": "Exact : l'Altman Z-score est un modèle qui combine plusieurs ratios financiers pour estimer la probabilité de faillite d'une entreprise. Plus il est bas, plus le risque est élevé.",
          "explication_echec": "L'Altman Z-score prédit la probabilité de faillite, pas la surperformance ni la rentabilité d'un rachat. C'est un indicateur de risque de défaillance.",
          "reponses": [
            { "texte": "Modèle de scoring pour prédire la probabilité de surperformance",       "correcte": false },
            { "texte": "Modèle de scoring pour prédire la rentabilité de l'achat d'une société", "correcte": false },
            { "texte": "Modèle de scoring pour prédire la probabilité de faillite",             "correcte": true }
          ]
        },
        {
          "libelle": "Qu'est-ce que le Sharpe ratio ?",
          "explication_reussite": "Exact : le Sharpe ratio mesure le rendement ajusté au risque — combien de performance on obtient pour le risque pris. Plus il est élevé, meilleur est le placement.",
          "explication_echec": "Le Sharpe ratio, c'est le rendement rapporté au risque (rendement ajusté au risque), pas seulement ajusté à la volatilité ni à la volatilité implicite du CFD.",
          "reponses": [
            { "texte": "Le rendement ajusté au risque",                              "correcte": true },
            { "texte": "Le rendement ajusté à la volatilité",                        "correcte": false },
            { "texte": "Le rendement ajusté à la volatilité implicite sur du CFD",   "correcte": false }
          ]
        },
        {
          "libelle": "Qu'est-ce qu'un roadshow ?",
          "explication_reussite": "Exact : un roadshow est une tournée de présentation où une entreprise va convaincre des investisseurs lors d'une levée de fonds (avant une introduction en bourse, par ex.).",
          "explication_echec": "Un roadshow est un tour de table pour lever des fonds auprès d'investisseurs, pas une simple vente d'actions ni une mesure de mobilité salariale.",
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
      -- explication_reussite / explication_echec : retour pédagogique optionnel.
      insert into questions (
        id_quiz, libelle, position, type, explication_reussite, explication_echec
      )
      values (
        v_id_quiz,
        q ->> 'libelle',
        v_pos,
        coalesce(q ->> 'type', 'choix_unique'),
        q ->> 'explication_reussite',
        q ->> 'explication_echec'
      )
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
