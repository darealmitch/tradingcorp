/** Rôles applicatifs — alignés sur le CHECK de la table `profils`. */
export type Role = 'apprenant' | 'formateur' | 'admin';

/** Ligne de la table `profils` (créée par trigger à l'inscription). */
export interface Profil {
  id_profil: string;
  prenom: string;
  nom: string;
  /** Pseudo public, modifiable par l'utilisateur une fois tous les 30 jours. */
  surnom: string | null;
  /** Dernière modification du surnom (fenêtre des 30 jours). */
  surnom_modifie_le: string | null;
  avatar_url: string | null;
  role: Role;
  date_creation: string;
  /** Compte créé par un admin : mot de passe temporaire à remplacer. */
  doit_changer_mdp: boolean;
  /** Compte de démonstration, exclu des statistiques. */
  est_test: boolean;
}
