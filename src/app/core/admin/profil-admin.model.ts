import { Role } from '../auth/profil.model';

/** Ligne renvoyée par la RPC lister_profils_admin (profil + e-mail auth). */
export interface ProfilAdmin {
  id_profil: string;
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  date_creation: string;
  /** Mot de passe temporaire pas encore remplacé (activation en attente). */
  doit_changer_mdp: boolean;
  /** Compte de démonstration, exclu des statistiques. */
  est_test: boolean;
}
