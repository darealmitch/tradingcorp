/** Statut de modération, commun aux avis et aux commentaires. */
export type StatutModeration = 'en_attente' | 'approuve' | 'rejete';

/** Avis d'un apprenant sur une formation — un seul par formation et par compte. */
export interface Avis {
  id_avis: string;
  id_formation: string;
  note: number;
  contenu: string | null;
  statut: StatutModeration;
  date_creation: string;
}

/**
 * Commentaire d'un chapitre. `id_parent` porte les réponses : un fil se
 * reconstruit en rattachant chaque réponse à son message.
 *
 * `profils` vient de la jointure PostgREST ; il est nul si le compte auteur a
 * été supprimé entre-temps.
 */
export interface Commentaire {
  id_commentaire: string;
  id_parent: string | null;
  contenu: string;
  statut: StatutModeration;
  date_creation: string;
  id_profil: string;
  profils: { prenom: string; nom: string } | null;
}

/** Un message et ses réponses, prêt à afficher. */
export interface FilCommentaire {
  message: Commentaire;
  reponses: Commentaire[];
}

/** Longueur maximale acceptée par la base (contrainte `*_contenu_borne`). */
export const LONGUEUR_MAX_CONTENU = 5000;
