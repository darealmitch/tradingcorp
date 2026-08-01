-- =============================================================================
-- TradingCorp — Qui écrit quoi, dit là où on le lit
--
-- L'en-tête de 20260718100000_validation_video affirmait que le contrôle
-- « empêche la validation directe d'une leçon vidéo sans l'avoir visionnée ».
-- C'était faux : `video_terminee_le` fait partie des colonnes que le client a
-- le droit d'écrire. Le fichier a été rectifié — mais un fichier de migration
-- vieux de six semaines n'est pas ce qu'on ouvre avant d'ajouter une règle.
--
-- Ces commentaires portent donc l'information là où elle sera vue : dans le
-- dashboard Supabase et dans `\d+`. La règle qu'ils rappellent vaut au-delà de
-- ce cas : avant de bâtir un contrôle sur une colonne, regarder qui a le droit
-- de l'écrire.
-- =============================================================================

comment on column public.progression_lecons.video_terminee_le is
  'Signal de fin de lecture ÉCRIT PAR LE CLIENT (privilège colonne accordé à authenticated). Sert à débloquer le PDF et à autoriser la validation du chapitre : c''est une intention pédagogique, pas une preuve de visionnage. Ne jamais l''utiliser comme condition d''un contrôle d''intégrité.';

comment on column public.progression_lecons.terminee_le is
  'Validation du chapitre, écrite UNIQUEMENT par terminer_lecon() ou par l''Edge Function corriger-quiz. Jamais accordée au client. C''est elle qui gouverne lecon_debloquee(), donc l''accès en lecture au contenu des étapes suivantes.';

comment on function public.video_lecon_terminee(uuid) is
  'Vrai si l''apprenant a signalé la fin de la vidéo — sur la foi de video_terminee_le, que le client a le droit d''écrire. Vérifie une affirmation, pas un fait.';

comment on function public.terminer_lecon(uuid) is
  'Valide un chapitre vidéo ou article et pose terminee_le. Contrôle le type, le déblocage séquentiel, et pour une vidéo le signal de fin de lecture — signal client, donc contournable par un appel direct. Le verrou réel est ailleurs : terminee_le n''est pas accessible en écriture au client, et lecon_debloquee() ferme la LECTURE des étapes suivantes.';
