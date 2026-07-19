-- =============================================================================
-- TradingCorp — Contenu des 8 introductions de module + étape d'introduction
--
-- Pour chaque module :
--   1. Renseigne le contenu affiché par app-module-intro : sections.introduction
--      (paragraphes) et sections.objectifs (liste). Pas d'accroche distincte
--      (homogène : aucun des 8 n'en fournit).
--   2. Crée l'ÉTAPE d'introduction : une leçon type 'intro' en position 0
--      (ancre de progression). Elle verrouille la 1re vidéo tant qu'elle n'est
--      pas validée (déblocage séquentiel existant) et se valide par le bouton
--      « Suivant » (terminer_lecon). Son contenu reste sur la section.
--
-- Prérequis : migration 20260719100000_chapitre_intro.sql (type 'intro').
-- IDEMPOTENT : ré-exécutable (update du contenu, garde anti-doublon sur l'intro).
-- =============================================================================

do $$
declare
  v_id_formation uuid;
  v_id_section   uuid;
  m              jsonb;

  c_modules constant jsonb := $json$
  [
    {
      "titre": "Développement personnel",
      "introduction": "Ce premier module est fondamental. Si tu ne dépasses pas tes croyances limitantes, tu resteras paralysé face aux opportunités.\n\nQue tu te lances dans le trading, l'immobilier ou l'entrepreneuriat, ton état d'esprit est la clé de ta réussite. Le moment d'agir, c'est maintenant, car rester dans ta zone de confort te coûte bien plus que l'échec.\n\nTu dois adopter une mentalité gagnante dès aujourd'hui pour affronter les défis et saisir les opportunités que beaucoup ratent.",
      "objectifs": [
        "Développe une mentalité de gagnant.",
        "Crée les bases pour réussir dans l'entrepreneuriat.",
        "Saisis les opportunités avant qu'il ne soit trop tard.",
        "Brise ta zone de confort pour avancer.",
        "Ton état d'esprit définit ta réussite ou ton échec."
      ]
    },
    {
      "titre": "Éducation financière",
      "introduction": "Ce second module est crucial : il t'ouvre les yeux sur l'éducation financière, une arme indispensable pour naviguer dans le monde complexe de l'argent.\n\nSi tu ne comprends pas l'inflation, la déflation et les rôles des banques ainsi que des banques centrales, tu risques de subir le système plutôt que de l'utiliser à ton avantage.\n\nAttendre, c'est déjà prendre du retard.\n\nNous parlerons également de ta psychologie d'investisseur, nous établirons ton profil financier et tu apprendras à maximiser chaque centime investi.",
      "objectifs": [
        "Comprendre l'argent et ses mécanismes.",
        "Comprendre l'inflation et la déflation.",
        "Découvrir le rôle des banques et des banques centrales.",
        "Découvrir les principaux produits d'investissement.",
        "Construire une stratégie pour lutter contre l'inflation.",
        "Établir ton profil d'investisseur."
      ]
    },
    {
      "titre": "Fiscalité",
      "introduction": "Dans ce troisième module, nous allons nous plonger dans la création de ta structure juridique afin de pratiquer le trading de manière légale et optimisée.\n\nTu apprendras à déclarer correctement tes revenus, comprendre les obligations fiscales liées au trading, remplir les formulaires nécessaires et calculer tes plus-values ainsi que tes moins-values.\n\nNous terminerons par plusieurs stratégies permettant d'optimiser légalement ta fiscalité.",
      "objectifs": [
        "Créer ta structure juridique.",
        "Comprendre quand déclarer tes revenus.",
        "Identifier les formulaires fiscaux importants.",
        "Calculer tes plus-values et moins-values.",
        "Optimiser ta fiscalité.",
        "Maximiser légalement tes bénéfices."
      ]
    },
    {
      "titre": "Les marchés",
      "introduction": "Ce quatrième module est une immersion dans l'univers des marchés financiers et des cryptomonnaies.\n\nTu découvriras le fonctionnement de la bourse, l'entrée en bourse des entreprises, les actions, les dividendes ainsi que les principaux actifs numériques.\n\nNous explorerons également les NFT, le Web3, le métavers, les mécanismes de consensus, le minage et les différentes façons de générer des revenus grâce à ces nouvelles technologies.",
      "objectifs": [
        "Comprendre le fonctionnement de la bourse.",
        "Découvrir les actions et les dividendes.",
        "Comprendre les cryptomonnaies.",
        "Découvrir le minage et les consensus.",
        "Acheter et stocker des cryptomonnaies.",
        "Comprendre les NFT.",
        "Découvrir le métavers.",
        "Comprendre les différences entre le Web1, Web2 et Web3.",
        "Identifier des projets crypto innovants.",
        "Comprendre pourquoi la blockchain représente une innovation majeure.",
        "Découvrir les opportunités offertes par le Web3."
      ]
    },
    {
      "titre": "Trading",
      "introduction": "Ce cinquième module t'immerge dans le cœur du trading.\n\nAprès une introduction aux bases, tu apprendras à analyser les graphiques, interpréter les bougies japonaises, identifier les supports et résistances ainsi que les principaux patterns.\n\nNous aborderons également les indicateurs techniques, les structures de marché, les liquidités, l'orderflow, les kill zones, le hedging et les options.",
      "objectifs": [
        "Comprendre les bases du trading.",
        "Lire les bougies japonaises.",
        "Identifier les supports et résistances.",
        "Reconnaître les principaux patterns.",
        "Utiliser les indicateurs techniques.",
        "Comprendre les structures de marché.",
        "Analyser les liquidités.",
        "Découvrir l'orderflow.",
        "Comprendre les biais journaliers.",
        "Utiliser les kill zones.",
        "Découvrir le hedging et les options."
      ]
    },
    {
      "titre": "Analyse fondamentale",
      "introduction": "Ce sixième module est consacré à l'analyse fondamentale.\n\nTu découvriras le fonctionnement de l'économie mondiale, les cycles économiques, les corrélations entre les marchés ainsi que les principaux indicateurs économiques.\n\nNous analyserons également le calendrier économique, les banques centrales, les taux d'intérêt et les outils permettant de suivre efficacement l'actualité financière.",
      "objectifs": [
        "Comprendre les bases de l'économie.",
        "Identifier les cycles économiques.",
        "Comprendre les cycles de dettes.",
        "Analyser les indices.",
        "Lire le calendrier économique.",
        "Comprendre les taux d'intérêt.",
        "Comprendre le rôle des banques centrales.",
        "Mettre en place une veille économique.",
        "Identifier les grandes puissances économiques.",
        "Découvrir les principaux sites d'information financière."
      ]
    },
    {
      "titre": "Investissement",
      "introduction": "Dans ce septième module, nous mettrons en pratique l'ensemble des connaissances acquises jusqu'à présent.\n\nNous construirons progressivement un portefeuille d'investissement complet en justifiant chaque décision, chaque valeur sélectionnée et chaque allocation.\n\nL'objectif est de bâtir une stratégie cohérente, réfléchie et adaptée à tes objectifs.",
      "objectifs": [
        "Sélectionner les valeurs.",
        "Comprendre chaque choix d'investissement.",
        "Déterminer les bonnes proportions.",
        "Construire une stratégie personnalisée.",
        "Mettre en pratique les connaissances acquises.",
        "Construire un portefeuille équilibré."
      ]
    },
    {
      "titre": "Optimisation",
      "introduction": "Ce dernier module est consacré à l'optimisation.\n\nNous approfondirons plusieurs notions complémentaires comme les différents types de brokers, les opérations de fusion-acquisition, les ratios financiers, les swaps, les spreads ou encore le sentiment analysis.\n\nNous verrons également comment adapter une stratégie selon les différents cycles économiques.",
      "objectifs": [
        "Optimiser ses stratégies d'investissement.",
        "Comprendre les brokers A Book et B Book.",
        "Découvrir les opérations de fusion-acquisition.",
        "Comprendre les ratios financiers, swaps et spreads.",
        "Découvrir le sentiment analysis.",
        "Adapter une stratégie selon les cycles économiques."
      ]
    }
  ]
  $json$::jsonb;
begin
  select id_formation into v_id_formation from formations where slug = 'trader-pro';
  if v_id_formation is null then
    raise exception 'Formation "trader-pro" introuvable.';
  end if;

  for m in select * from jsonb_array_elements(c_modules)
  loop
    select id_section into v_id_section
    from sections
    where id_formation = v_id_formation and titre = (m ->> 'titre');

    if v_id_section is null then
      raise notice 'Module "%" introuvable — ignoré.', m ->> 'titre';
      continue;
    end if;

    -- 1) Contenu de l'intro (affiché par app-module-intro).
    update sections
       set accroche = null,
           introduction = m ->> 'introduction',
           objectifs = array(select jsonb_array_elements_text(m -> 'objectifs'))
     where id_section = v_id_section;

    -- 2) Étape d'introduction (ancre de progression, position 0).
    if not exists (
      select 1 from lecons where id_section = v_id_section and type = 'intro'
    ) then
      insert into lecons (id_section, titre, type, position, est_publiee, apercu_gratuit)
      values (v_id_section, 'Introduction', 'intro', 0, true, false);
    end if;
  end loop;

  raise notice 'Introductions des 8 modules renseignées + étape intro créée.';
end $$;
