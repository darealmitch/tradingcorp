/** Rôles applicatifs — alignés sur le CHECK de la table `profils`. */
export type Role = 'apprenant' | 'formateur' | 'admin';

/** Ligne de la table `profils` (créée par trigger à l'inscription). */
export interface Profil {
  id_profil: string;
  prenom: string;
  nom: string;
  role: Role;
  date_creation: string;
  /** Date de naissance (majorité vérifiée à l'inscription) — null si inconnue. */
  date_naissance: string | null;
  /** Compte créé par un admin : mot de passe temporaire à remplacer. */
  doit_changer_mdp: boolean;
  /** Compte de démonstration, exclu des statistiques. */
  est_test: boolean;
}
