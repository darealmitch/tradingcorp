-- =============================================================================
-- Contenu d'introduction — Module 1 « Développement personnel »
-- Texte fourni par le client, repris tel quel (aucune reformulation).
--
-- Prérequis : seed_modules.sql (crée les 8 modules).
-- Idempotent : ré-exécutable, met simplement le contenu à jour.
-- =============================================================================

update sections s
set
  accroche = $txt$Construis la mentalité nécessaire pour réussir dans le trading, l'investissement et l'entrepreneuriat.$txt$,

  -- Paragraphes séparés par une ligne vide (le front les rend un par un).
  introduction = $txt$Ce premier module est fondamental. Si tu ne dépasses pas tes croyances limitantes, tu resteras paralysé face aux opportunités.

Que tu te lances dans le trading, l'immobilier ou l'entrepreneuriat, ton état d'esprit est la clé de ta réussite.

Le moment d'agir est maintenant, car rester dans ta zone de confort te coûte bien plus que l'échec.

Tu dois adopter une mentalité gagnante dès aujourd'hui pour affronter les défis et saisir les opportunités que beaucoup ratent.$txt$,

  objectifs = array[
    $txt$Développe une mentalité de gagnant$txt$,
    $txt$Crée les bases pour réussir dans l'entrepreneuriat$txt$,
    $txt$Saisis les opportunités avant qu'il ne soit trop tard$txt$,
    $txt$Brise ta zone de confort pour avancer$txt$,
    $txt$Ton état d'esprit définit ta réussite ou ton échec$txt$
  ],

  -- Le module d'introduction est visible dès maintenant.
  est_publiee = true
from formations f
where s.id_formation = f.id_formation
  and f.slug = 'trader-pro'
  and s.titre = 'Développement personnel';
