/**
 * Modèles du domaine « pilotage » : ce que le staff observe de la plateforme.
 *
 * Distinct du domaine pédagogique (`contenu/apprentissage.model`) : ici on
 * agrège pour décider, là-bas on restitue un parcours à un apprenant. Les deux
 * lisent les mêmes tables, mais ne répondent pas aux mêmes questions et n'ont
 * pas les mêmes lecteurs.
 */

/** Une ligne du suivi des apprenants : avancement d'un compte dans le programme. */
export interface ApprenantSuivi {
  id_profil: string;
  prenom: string;
  nom: string;
  date_creation: string;
  est_test: boolean;
  /** Une inscription active existe — l'accès au contenu est ouvert. */
  inscrit: boolean;
  terminees: number;
  /** Nombre total de leçons du programme, pour situer `terminees`. */
  total: number;
}

/** Inscription récente, telle qu'affichée dans le fil d'activité du tableau de bord. */
export interface InscriptionRecente {
  date_inscription: string;
  profils: { prenom: string; nom: string } | null;
  formations: { titre: string } | null;
}
