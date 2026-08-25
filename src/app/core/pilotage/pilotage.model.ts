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

/**
 * Décompte des apprenants, comptes de démonstration inclus mais identifiés.
 *
 * Deux nombres plutôt qu'un : masquer les comptes de test donnait un total faux,
 * les confondre avec des clients donnerait un total trompeur.
 */
export interface DecompteApprenants {
  /** Tous les comptes de rôle apprenant, comptes de démonstration compris. */
  total: number;
  /** Part du total qui n'est pas un apprenant réel. */
  test: number;
}

/** Inscription récente, telle qu'affichée dans le fil d'activité du tableau de bord. */
export interface InscriptionRecente {
  date_inscription: string;
  profils: { prenom: string; nom: string } | null;
  formations: { titre: string } | null;
}

/**
 * Certificat délivré, vu par le staff.
 *
 * La table `certificats` ne porte que des identifiants : le titulaire et la
 * formation viennent des jointures, comme partout ailleurs dans ce domaine —
 * on ne recopie pas un nom dans une table qui n'a pas à le porter.
 */
export interface CertificatEmis {
  id_certificat: string;
  numero: string;
  date_obtention: string;
  /** Nul si le compte du titulaire a été supprimé depuis la délivrance. */
  profils: { prenom: string; nom: string } | null;
  formations: { titre: string } | null;
}
