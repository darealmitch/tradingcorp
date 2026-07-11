/**
 * Modèles du domaine « formation » : modules (sections), étapes (leçons) et
 * leurs contenus. Les médias (vidéo, PDF, ressources) sont référencés par leur
 * `public_id` Cloudinary — jamais stockés dans le code.
 */

export type VideoProvider = 'youtube' | 'bunny' | 'cloudinary';

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
  titre: string;
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

/** Leçon complète (vue étape) : champs de contenu + ressources. */
export interface LeconDetail extends LeconResume {
  id_section: string;
  description: string | null;
  contenu: string | null;
  ressources: Ressource[];
}

/** Progression agrégée : étapes terminées / total accessible. */
export interface ProgressionResume {
  terminees: number;
  total: number;
}
