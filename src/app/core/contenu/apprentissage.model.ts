/**
 * Modèles du domaine « formation » : modules (sections), étapes (leçons) et
 * leurs contenus. Les médias (vidéo, PDF, ressources) sont référencés par leur
 * `public_id` Cloudinary — jamais stockés dans le code.
 */

export type VideoProvider = 'youtube' | 'bunny' | 'cloudinary';

/** Type d'un chapitre : présentation du module, contenu texte, vidéo, ou quiz. */
export type TypeChapitre = 'intro' | 'article' | 'video' | 'quiz';

/** Ressource complémentaire d'une leçon (PDF, image, fichier…). */
export interface Ressource {
  id_ressource: string;
  nom: string;
  type_mime: string;
  /** Référence Cloudinary (prioritaire) ou chemin d'un stockage tiers. */
  cloudinary_public_id: string | null;
  chemin_storage: string | null;
  taille: number | null;
}

/** Étape / leçon — version allégée pour les listes (structure du programme). */
export interface LeconResume {
  id_lecon: string;
  id_section: string;
  titre: string;
  type: TypeChapitre;
  position: number;
  duree_s: number | null;
  est_publiee: boolean;
  apercu_gratuit: boolean;
  video_provider: VideoProvider;
  /** public_id Cloudinary (ou id YouTube/Bunny selon le provider). */
  video_provider_id: string | null;
  /** public_id Cloudinary du PDF principal de la leçon. */
  pdf_public_id: string | null;
}

/** Module (section) d'une formation, avec ses étapes ordonnées. */
export interface Module {
  id_section: string;
  titre: string;
  description: string | null;
  position: number;
  est_publiee: boolean;
  lecons: LeconResume[];
}

/**
 * Contenu jouable d'une étape (RPC `lecon_contenu`) : la seule voie de lecture
 * d'une leçon. `pdf_public_id` et `id_quiz` sont redigés par le serveur tant
 * que la vidéo n'est pas terminée ; aucune ligne n'est renvoyée si l'étape
 * n'est pas déverrouillée.
 */
export interface LeconJouable {
  id_lecon: string;
  id_section: string;
  titre: string;
  type: TypeChapitre;
  description: string | null;
  contenu: string | null;
  duree_s: number | null;
  video_provider: VideoProvider;
  video_provider_id: string | null;
  /** URL de lecture externe (Bunny/MP4/HLS direct) — prioritaire sur Cloudinary. */
  video_url: string | null;
  /** Métadonnées libres du lecteur (durée réelle, résolutions, id Bunny…). */
  video_metadata: Record<string, unknown> | null;
  /** null tant que la vidéo n'est pas terminée (redaction serveur). */
  pdf_public_id: string | null;
  position: number;
  /** Reprise de lecture (signal client, non sécuritaire). */
  position_video_s: number;
  video_terminee_le: string | null;
  /** Posée uniquement par corriger-quiz — l'étape est validée. */
  terminee_le: string | null;
  /** null tant que la vidéo n'est pas terminée. */
  id_quiz: string | null;
  ressources: Ressource[];
}

/** État d'une étape dans la liste d'un module (RPC `etats_lecons`). */
export type EtatLecon = 'verrouille' | 'debloque' | 'en_cours' | 'termine';

export interface LeconEtape {
  id_lecon: string;
  titre: string;
  type: TypeChapitre;
  position: number;
  duree_s: number | null;
  a_pdf: boolean;
  video_termine: boolean;
  etat: EtatLecon;
}

/** Option de réponse publique (sans le champ `correcte`). */
export interface OptionReponse {
  id_reponse: string;
  contenu: string;
}

export interface QuestionQuiz {
  id_question: string;
  libelle: string;
  position: number;
  type: 'choix_unique' | 'choix_multiple';
  reponses: OptionReponse[];
}

/** Résultat renvoyé par l'Edge Function corriger-quiz. */
export interface ResultatQuiz {
  reussi: boolean;
  score: number;
  score_requis: number;
}

/** Progression agrégée : étapes terminées / total accessible. */
export interface ProgressionResume {
  terminees: number;
  total: number;
}

/** État d'un module, calculé exclusivement côté serveur (RPC etats_modules). */
export type EtatModule = 'verrouille' | 'debloque' | 'en_cours' | 'termine';

/** Module tel qu'affiché dans le parcours, avec son état serveur. */
export interface ModuleParcours {
  id_section: string;
  titre: string;
  description: string | null;
  /** Phrase d'accroche affichée sous le titre du module. */
  accroche: string | null;
  /** Texte d'introduction — paragraphes séparés par une ligne vide. */
  introduction: string | null;
  /** Ce que l'apprenant va acquérir dans ce module. */
  objectifs: string[] | null;
  position: number;
  total_lecons: number;
  lecons_terminees: number;
  etat: EtatModule;
}

/** Parcours complet d'un apprenant : formation + modules ordonnés. */
export interface Parcours {
  id_formation: string;
  titre: string;
  inscrit: boolean;
  modules: ModuleParcours[];
}
