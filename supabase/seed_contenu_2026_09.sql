-- Contenu rédactionnel manquant, relevé le 01/09/2026.
--
-- Idempotent et rejouable : les valeurs sont posées par `update`, jamais
-- ajoutées. Rejouer ce fichier remet le texte dans l'état décrit ici — c'est
-- voulu, il fait autorité sur ces champs.
--
-- Deux manques distincts :
--   • « 2.4 Profil d'investisseur », seul chapitre publié sans contenu. Le
--     lecteur affichait son repli « sera publié prochainement » au milieu d'un
--     parcours payant ;
--   • la phrase d'accroche des huit modules, que le modèle déclare « affichée
--     sous le titre du module » et qu'aucun n'avait.
--
-- Le format d'un article est du TEXTE BRUT : les paragraphes sont séparés par
-- une ligne vide (cf. `paragraphes()` dans lecon-player.ts), le premier étant
-- rendu en chapeau. Ni markdown ni HTML — le template interpole et échappe.

-- ---------------------------------------------------------------------------
-- 2.4 Profil d'investisseur — module 2, entre « Retraite et assurances » et
-- « Psychologie ». Sa place dans la progression dicte son propos : les
-- enveloppes viennent d'être vues, la psychologie suit ; ce chapitre est le
-- moment où l'apprenant se situe lui-même.
-- ---------------------------------------------------------------------------
update public.lecons l
set contenu = $texte$Avant de choisir un placement, il faut savoir qui tu es en tant qu'investisseur. C'est l'étape que presque tout le monde saute — et c'est celle qui explique la plupart des décisions regrettées : on ne se trompe pas seulement de produit, on se trompe de profil.

Ton profil se définit par trois éléments, et aucun ne suffit seul.

Le premier est l'horizon. Dans combien de temps auras-tu besoin de cet argent ? Un apport pour un achat dans deux ans et une préparation de retraite dans vingt-cinq ans n'appellent pas les mêmes placements. Plus l'horizon est court, moins tu peux te permettre d'attendre qu'un marché baissier se retourne. C'est une contrainte de calendrier, pas une question de courage.

Le deuxième est ta tolérance au risque. Attention au piège : il ne s'agit pas de celle que tu t'imagines quand tout monte, mais de celle que tu constateras quand ton portefeuille aura perdu trente pour cent. Pose-toi la question dans ces termes, très concrètement : si la somme que tu envisages de placer était amputée d'un tiers l'an prochain, est-ce que tu tiendrais ta position, ou est-ce que tu vendrais ? La bonne réponse n'est pas celle qui te flatte, c'est celle qui décrit ce que tu ferais réellement.

Le troisième est ta capacité financière, et il prime sur les deux autres. Elle se mesure à ce que tu peux immobiliser sans que cela change ta vie quotidienne. Avant tout placement, une épargne de précaution disponible immédiatement — l'équivalent de trois à six mois de dépenses est le repère le plus courant. Investir un argent dont tu auras besoin dans six mois, c'est se condamner à vendre au mauvais moment, quel que soit le talent qu'on met à choisir ses positions.

De la combinaison de ces trois éléments se dégagent des profils que tu retrouveras chez tous les intermédiaires. Le profil prudent privilégie la préservation du capital et accepte un rendement modeste. Le profil équilibré accepte des variations réelles en échange d'une performance supérieure sur la durée. Le profil dynamique assume des baisses marquées, parce que son horizon est assez long pour les absorber.

Aucun de ces profils n'est meilleur qu'un autre. Le seul mauvais profil est celui qui ne correspond pas à ta situation : un profil dynamique avec un horizon de deux ans est une erreur de construction, pas une prise de risque assumée.

Un dernier point, souvent oublié : ton profil n'est pas figé. Une naissance, un achat immobilier, un changement de revenus le déplacent. Réévalue-le au moins une fois par an, et systématiquement après un événement qui change ta situation. Le chapitre suivant, consacré à la psychologie, montrera pourquoi cette honnêteté avec soi-même est la première protection du capital.

Ce chapitre a une visée pédagogique : il t'aide à te situer, il ne constitue pas un conseil en investissement personnalisé.$texte$
from public.sections s
where s.id_section = l.id_section
  and s.position = 2
  and l.titre = '2.4 Profil d''investisseur';

-- ---------------------------------------------------------------------------
-- Accroches des modules — une phrase sous le titre, qui dit ce que le module
-- change pour l'apprenant. Rapprochées par le titre, unique dans la formation.
-- ---------------------------------------------------------------------------
update public.sections set accroche = 'Avant les marchés, tes croyances. C''est là que tout commence — ou que tout bloque.'
  where titre = 'Développement personnel';
update public.sections set accroche = 'Comprendre l''argent avant de chercher à en gagner.'
  where titre = 'Éducation financière';
update public.sections set accroche = 'Gagner, c''est une chose. Garder ce que tu gagnes en est une autre.'
  where titre = 'Fiscalité';
update public.sections set accroche = 'Où circule l''argent, qui le fait circuler, et selon quelles règles.'
  where titre = 'Les marchés';
update public.sections set accroche = 'Lire un graphique, décider, exécuter — dans cet ordre.'
  where titre = 'Trading';
update public.sections set accroche = 'Ce qui fait bouger les marchés, au-delà des courbes.'
  where titre = 'Analyse fondamentale';
update public.sections set accroche = 'Construire un portefeuille, pas collectionner des positions.'
  where titre = 'Investissement';
update public.sections set accroche = 'Les réglages qui séparent celui qui pratique de celui qui essaie.'
  where titre = 'Optimisation';
