-- =============================================================================
-- GABARIT — Ajouter une leçon vidéo + son quiz à un module
--
-- Réutilise l'architecture existante (lecons, quiz, questions, reponses) : rien
-- de nouveau, tu ne fais que REMPLIR les << ... >>. Duplique ce fichier par
-- leçon. À exécuter dans le SQL editor.
--
-- Rappels :
--   • La 1re étape d'un module (l'intro) est la page du module, PAS une leçon.
--     Les leçons créées ici sont donc les étapes VIDÉO (position 1, 2, 3, …).
--   • video_provider_id = le public_id Cloudinary de ta vidéo (uploadée via
--     MediaService/Cloudinary). pdf_public_id = idem pour le PDF, ou null.
--   • Le PDF ne se débloque qu'après la vidéo (géré par l'app) ; inutile d'y
--     toucher ici.
--   • Le quiz est obligatoire pour valider la leçon ; score_requis = seuil en %
--     (70 = il faut 70 % de bonnes réponses). La colonne `correcte` n'est jamais
--     envoyée au client : la correction se fait dans l'Edge Function.
--   • Les textes utilisent le dollar-quoting $q$…$q$ : colle ton contenu tel
--     quel, sans échapper les apostrophes.
--   • Idempotent : un garde sur le titre évite les doublons si tu ré-exécutes.
-- =============================================================================

do $$
declare
  v_id_formation uuid;
  v_id_section   uuid;
  v_id_lecon     uuid;
  v_id_quiz      uuid;
  v_id_question  uuid;

  -- >>> Le SEUL réglage à changer selon le module ciblé :
  c_module constant text := $q$Développement personnel$q$;
  -- Titre de la leçon (sert aussi de garde anti-doublon) :
  c_titre_lecon constant text := $q$<< TITRE DE LA LEÇON >>$q$;
begin
  select f.id_formation, s.id_section
    into v_id_formation, v_id_section
  from formations f
  join sections s on s.id_formation = f.id_formation
  where f.slug = 'trader-pro' and s.titre = c_module;

  if v_id_section is null then
    raise exception 'Module "%" introuvable — exécute d''abord seed_modules.sql', c_module;
  end if;

  if exists (select 1 from lecons where id_section = v_id_section and titre = c_titre_lecon) then
    raise notice 'Leçon "%" déjà présente — rien à faire.', c_titre_lecon;
    return;
  end if;

  -- 1) LEÇON VIDÉO ------------------------------------------------------------
  insert into lecons (
    id_section, titre, description, position, duree_s,
    video_provider, video_provider_id, pdf_public_id,
    apercu_gratuit, est_publiee
  )
  values (
    v_id_section,
    c_titre_lecon,
    $q$<< DESCRIPTION COURTE (optionnel) >>$q$,
    1,                              -- position : ordre de la leçon dans le module
    0,                              -- duree_s : durée de la vidéo en secondes
    'cloudinary',
    $q$<< PUBLIC_ID VIDÉO CLOUDINARY >>$q$,
    null,                           -- pdf_public_id : public_id du PDF, ou null
    false,                          -- apercu_gratuit
    true                            -- est_publiee : visible par l'apprenant
  )
  returning id_lecon into v_id_lecon;

  -- 2) QUIZ de la leçon -------------------------------------------------------
  -- score_requis non précisé : le seuil de réussite (80 %) vient du défaut de
  -- la colonne, source unique de la règle pour tous les quiz.
  insert into quiz (id_formation, id_lecon, titre, position)
  values (v_id_formation, v_id_lecon, $q$Quiz — validation de la leçon$q$, 1)
  returning id_quiz into v_id_quiz;

  -- 3) QUESTION 1 (duplique ce bloc pour chaque question) ---------------------
  --    type : 'choix_unique' (une bonne réponse) ou 'choix_multiple' (plusieurs)
  insert into questions (id_quiz, libelle, position, type)
  values (v_id_quiz, $q$<< ÉNONCÉ DE LA QUESTION 1 >>$q$, 1, 'choix_unique')
  returning id_question into v_id_question;

  insert into reponses (id_question, contenu, correcte) values
    (v_id_question, $q$<< bonne réponse >>$q$,     true),
    (v_id_question, $q$<< mauvaise réponse >>$q$,  false),
    (v_id_question, $q$<< mauvaise réponse >>$q$,  false),
    (v_id_question, $q$<< mauvaise réponse >>$q$,  false);

  -- 4) QUESTION 2 -------------------------------------------------------------
  insert into questions (id_quiz, libelle, position, type)
  values (v_id_quiz, $q$<< ÉNONCÉ DE LA QUESTION 2 >>$q$, 2, 'choix_unique')
  returning id_question into v_id_question;

  insert into reponses (id_question, contenu, correcte) values
    (v_id_question, $q$<< bonne réponse >>$q$,     true),
    (v_id_question, $q$<< mauvaise réponse >>$q$,  false),
    (v_id_question, $q$<< mauvaise réponse >>$q$,  false),
    (v_id_question, $q$<< mauvaise réponse >>$q$,  false);

  -- … duplique les blocs QUESTION autant que nécessaire (position 3, 4, …).

  raise notice 'Leçon "%" + quiz créés.', c_titre_lecon;
end $$;
