-- =============================================================================
-- TradingCorp — Ressources pédagogiques réelles (SEED, idempotent et rejouable)
--
-- Source unique des ressources complémentaires des leçons. Chaque ligne est
-- rattachée à sa leçon par (module.position, lecon.titre) — jamais par UUID
-- codé en dur, qui changerait à chaque réinitialisation.
--
-- REJOUABLE : ON CONFLICT (id_lecon, nom) met à jour la ligne existante. Les
-- réglages faits à la main sur les colonnes volatiles — `url` d'un partenaire,
-- `est_active`, `cloudinary_public_id` une fois le fichier téléversé — sont
-- PRÉSERVÉS via coalesce, pour qu'un rejeu ne défasse pas le travail
-- d'administration. Seuls les libellés et l'ordre sont réalignés.
--
-- FICHIERS À TÉLÉVERSER. Les PDF, l'audio, le classeur et la vidéo ne sont pas
-- dans le dépôt : seule leur RÉFÉRENCE vit ici. Les lignes concernées sont
-- créées `est_active = false` avec le public_id Cloudinary attendu ; elles
-- apparaîtront dès que le fichier sera en ligne et la ligne activée.
--
-- VIDÉOS BUNNY. La bibliothèque 708929 restreint la lecture directe par
-- referer : seules les requêtes venant de iframe.mediadelivery.net passent.
--   • une ressource ouverte dans un onglet  -> URL d'EMBED (fonctionne tel quel)
--   • un chapitre lu par la balise <video>  -> MP4 direct
--     (vz-8e333926-6ea.b-cdn.net/<id>/play_720p.mp4), qui exige d'ajouter le
--     domaine du site aux referers autorisés dans Bunny Stream.
-- Ni l'URL /play/ (page de partage) ni le HLS ne sont lisibles par <video>.
--
-- LIENS PARTENAIRES. Les URL ci-dessous sont les adresses PUBLIQUES des
-- plateformes, pas des liens d'affiliation : à remplacer par les vrais liens
-- de parrainage. XTB est livré désactivé (partenariat à confirmer).
-- =============================================================================

-- Résolution d'une leçon par son module et son titre.
create or replace function pg_temp.lecon(p_module integer, p_titre text)
returns uuid
language sql stable
as $$
  select l.id_lecon
  from lecons l join sections s on s.id_section = l.id_section
  where s.position = p_module and l.titre = p_titre;
$$;

with donnees(module, lecon, nom, type, description, cloudinary_public_id, url,
             langage, contenu, est_active, position, type_mime) as (
  values
  -- ===== Module 2 — Éducation financière ====================================
  -- Livre audio hébergé sur YouTube : la ressource s'ouvre dans un nouvel
  -- onglet, l'URL de la page convient donc telle quelle.
  (2, '2.2 Les bases de la monnaie',
   'Les bases de la monnaie — livre audio', 'audio',
   'Version audio à écouter en complément de la vidéo.',
   null, 'https://www.youtube.com/watch?v=ONrCHaGLKIg',
   null, null, true, 1, null),

  (2, '2.4 Profil d''investisseur',
   'Questionnaire profil d''investisseur', 'pdf',
   'À compléter pour situer ton profil de risque avant d''investir.',
   'tradingcorp/ressources/module-2/questionnaire-profil-investisseur', null,
   null, null, false, 1, 'application/pdf'),

  -- ===== Module 4 — Les marchés =============================================
  (4, '4.1 Qu''est-ce que la bourse ?',
   'La Bourse pour les Nuls — Gérard Horny', 'pdf',
   'Ouvrage de référence pour découvrir le fonctionnement des marchés.',
   'La_bourse_pour_les_nuls_j8o7fd', null,
   null, null, true, 1, 'application/pdf'),

  -- ===== Module 5 — Trading =================================================
  (5, '5.1 Initiation au graphique - Partie 1',
   'TradingView', 'lien',
   'La plateforme de graphiques utilisée tout au long du module.',
   null, 'https://www.tradingview.com/',
   null, null, true, 1, null),

  (5, '5.1 Initiation au graphique - Partie 1',
   'Ouvrir un compte XTB', 'partenaire',
   'Courtier partenaire — inscription gratuite.',
   null, 'https://www.xtb.com/fr',
   null, null, false, 2, null),

  (5, '5.1 Initiation au graphique - Partie 3',
   'Bougies japonaises : anticiper les marchés', 'pdf',
   'Lecture des chandeliers et anticipation des retournements.',
   'Anticiper_le_marché_avec_les_bougies_japonaises_mj9t0x', null,
   null, null, true, 1, 'application/pdf'),

  (5, '5.1 Initiation au graphique - Partie 3',
   'Chandeliers japonais', 'pdf',
   'Les figures de chandeliers et leur interprétation.',
   'Chandelier_japonais_ianavi', null,
   null, null, true, 2, 'application/pdf'),

  (5, '5.1 Initiation au graphique - Partie 3',
   'La Bourse pour les Nuls', 'pdf',
   'Ouvrage de référence pour découvrir le fonctionnement des marchés.',
   'La_bourse_pour_les_nuls_j8o7fd', null,
   null, null, true, 3, 'application/pdf'),

  (5, '5.1 Initiation au graphique - Partie 3',
   'Maîtriser l''analyse technique — Thami Kabbaj', 'pdf',
   'Approfondissement de l''analyse technique.',
   'Maitriser_l_analyse_technique_par_Thami_Kabaj_tkymop', null,
   null, null, true, 4, 'application/pdf'),

  (5, '5.2 Le trading - Partie 2',
   'Ouvrir un compte Capital.com', 'partenaire',
   'Courtier partenaire — inscription gratuite.',
   null, 'https://capital.com/',
   null, null, true, 1, null),

  (5, '5.5 Méthodologie',
   'Journal de trading (.xlsx)', 'fichier',
   'Modèle de journal à remplir après chaque prise de position.',
   'tradingcorp/ressources/module-5/journal-de-trading', null,
   null, null, false, 1,
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),

  -- URL d'EMBED Bunny : la ressource s'ouvre dans un nouvel onglet, donc la
  -- page du lecteur convient et échappe à la protection referer de la
  -- bibliothèque (cf. note en tête de fichier).
  (5, '5.13 Options',
   'Faire une option sur TradingView', 'video',
   'Démonstration pas à pas sur TradingView.',
   null, 'https://iframe.mediadelivery.net/embed/708929/475152ff-da6c-47ac-8b91-5935798783eb',
   null, null, true, 1, null)
)
insert into ressources (
  id_lecon, nom, type, description, cloudinary_public_id, url,
  langage, contenu, est_active, position, type_mime
)
select pg_temp.lecon(d.module, d.lecon), d.nom, d.type, d.description,
       d.cloudinary_public_id, d.url, d.langage, d.contenu,
       d.est_active, d.position, d.type_mime
from donnees d
where pg_temp.lecon(d.module, d.lecon) is not null
on conflict (id_lecon, nom) do update set
  type = excluded.type,
  description = excluded.description,
  position = excluded.position,
  type_mime = excluded.type_mime,
  langage = excluded.langage,
  -- Colonnes d'administration : on ne remplace que si rien n'a encore été posé.
  cloudinary_public_id = coalesce(ressources.cloudinary_public_id, excluded.cloudinary_public_id),
  url = coalesce(ressources.url, excluded.url),
  contenu = coalesce(excluded.contenu, ressources.contenu);

-- =============================================================================
-- Module 8 — Optimisation : documentation et exemples de code
--
-- Ces ressources n'ont pas de fichier : leur contenu est le texte lui-même,
-- stocké en base et rendu tel quel (bloc de code étiqueté par `langage`, ou
-- documentation en texte). Elles sont donc actives d'emblée.
-- Contenu repris à l'identique de la source fournie.
-- =============================================================================

with donnees(module, lecon, nom, type, description, langage, contenu, position) as (
  values
  (8, 'Optimisation - Partie 1',
   'Vader Sentiment — installation', 'code',
   'Analyse de sentiment appliquée aux marchés.', 'bash',
   'pip install vaderSentiment', 1),

  (8, 'Optimisation - Partie 1',
   'Vader Sentiment — exemple', 'code',
   'Score de sentiment d''un texte de marché.', 'python',
   E'from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer\n\nanalyzer = SentimentIntensityAnalyzer()\n\ntexte = "The stock market is booming today!"\n\nscores = analyzer.polarity_scores(texte)\nprint(scores)', 2),

  (8, 'Optimisation - Partie 1',
   'IBM Watson Tone Analyzer — installation', 'code',
   'Analyse de tonalité des communications financières.', 'bash',
   'pip install ibm-watson', 3),

  (8, 'Optimisation - Partie 1',
   'IBM Watson Tone Analyzer — exemple', 'code',
   'Connexion au service et analyse d''un texte.', 'python',
   E'from ibm_watson import ToneAnalyzerV3\nfrom ibm_cloud_sdk_core.authenticators import IAMAuthenticator\n\nauthenticator = IAMAuthenticator(''ta_clé_API'')\n\ntone_analyzer = ToneAnalyzerV3(\n    version=''2020-08-01'',\n    authenticator=authenticator\n)\n\ntone_analyzer.set_service_url(''URL_de_ton_instance_Watson'')\n\ntexte = "The market is showing signs of uncertainty, but some investors remain hopeful."\n\ntone_analysis = tone_analyzer.tone(\n    {''text'': texte},\n    content_type=''application/json''\n).get_result()\n\nprint(tone_analysis)', 4),

  (8, 'Optimisation - Partie 1',
   'TF-IDF (Scikit-learn) — exemple', 'code',
   'Pondération des termes d''un corpus de textes financiers.', 'python',
   E'from sklearn.feature_extraction.text import TfidfVectorizer\n\ndocuments = [\n    "The stock market is up today.",\n    "Investors are worried about the economy.",\n    "The economy is showing signs of recovery."\n]\n\nvectorizer = TfidfVectorizer()\n\nX = vectorizer.fit_transform(documents)\n\nterms = vectorizer.get_feature_names_out()\n\nprint(terms)\nprint(X.toarray())', 5),

  (8, 'Optimisation - Partie 2',
   'Raccourcis TradingView (Windows)', 'documentation',
   'Raccourcis clavier de la plateforme sous Windows.', null,
   E'Alt + T → Ligne de tendance\nAlt + F → Retracement de Fibonacci\nAlt + H → Ligne horizontale\nAlt + V → Ligne verticale\nAlt + C → Ligne transversale\nAlt + A → Ajouter une alerte\nAlt + S → Capture d''écran\nAlt + I → Inverser le graphique\nAlt + P → Graphique en pourcentage\nAlt + L → Graphique', 1),

  (8, 'Optimisation - Partie 2',
   'Raccourcis TradingView (macOS)', 'documentation',
   'Raccourcis clavier de la plateforme sous macOS.', null,
   E'⌥ + T → Ligne de tendance\n⌥ + F → Retracement de Fibonacci\n⌥ + H → Ligne horizontale\n⌥ + V → Ligne verticale\n⌥ + C → Ligne transversale\n⌥ + A → Ajouter une alerte\n⌥ + S → Capture d''écran\n⌥ + I → Inverser le graphique\n⌥ + P → Graphique en pourcentage\n⌥ + L → Graphique', 2)
)
insert into ressources (id_lecon, nom, type, description, langage, contenu, position, est_active)
select pg_temp.lecon(d.module, d.lecon), d.nom, d.type, d.description,
       d.langage, d.contenu, d.position, true
from donnees d
where pg_temp.lecon(d.module, d.lecon) is not null
on conflict (id_lecon, nom) do update set
  type = excluded.type,
  description = excluded.description,
  langage = excluded.langage,
  contenu = excluded.contenu,
  position = excluded.position;
