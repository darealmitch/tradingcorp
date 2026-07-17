-- =============================================================================
-- Contenu d'introduction — Module 1 « Développement personnel »
-- Texte du client, peaufiné et validé par lui (message conservé, style resserré).
--
-- Prérequis : seed_modules.sql (crée les 8 modules).
-- Idempotent : ré-exécutable, met simplement le contenu à jour.
-- =============================================================================

update sections s
set
  accroche = $txt$Construis l'état d'esprit qui fait la différence — en trading, en investissement comme en entrepreneuriat.$txt$,

  -- Paragraphes séparés par une ligne vide (le front les rend un par un).
  introduction = $txt$Ce module est le socle de tout le reste. Tant que tu n'auras pas dépassé tes croyances limitantes, tu resteras spectateur des opportunités au lieu de les saisir.

Trading, immobilier, entrepreneuriat : peu importe la voie, c'est ton état d'esprit qui décide du résultat. Les compétences s'apprennent — la mentalité, elle, se construit, et c'est elle qui creuse l'écart.

Le vrai risque n'est pas d'échouer, c'est de rester dans ta zone de confort pendant que le temps file. Chaque jour d'immobilisme a un coût que personne ne facture, mais que tout le monde finit par payer.

Adopte dès aujourd'hui une mentalité de gagnant : celle qui affronte les défis au lieu de les fuir, et qui saisit les occasions que la plupart laissent passer.$txt$,

  objectifs = array[
    $txt$Forge une véritable mentalité de gagnant$txt$,
    $txt$Pose les fondations d'un état d'esprit d'entrepreneur$txt$,
    $txt$Repère et saisis les opportunités avant qu'elles ne passent$txt$,
    $txt$Sors de ta zone de confort pour enfin avancer$txt$,
    $txt$Fais de ton état d'esprit ton plus grand atout$txt$
  ],

  -- Le module d'introduction est visible dès maintenant.
  est_publiee = true
from formations f
where s.id_formation = f.id_formation
  and f.slug = 'trader-pro'
  and s.titre = 'Développement personnel';
