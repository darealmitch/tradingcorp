import { Role } from '../auth/profil.model';

/**
 * Modèles du domaine « comptes » : les utilisateurs vus depuis le back-office.
 *
 * Distinct de `auth/profil.model` (le profil de l'utilisateur connecté, qui ne
 * connaît que lui-même) : ici on décrit *les autres*, e-mail compris — une
 * information que seule la RPC réservée aux administrateurs expose.
 */

/** Ligne renvoyée par la RPC `lister_profils_admin` (profil + e-mail auth). */
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
  /** Compte propriétaire : seul habilité à supprimer un administrateur. */
  est_proprietaire: boolean;
}

/** Données de création d'un compte par un administrateur. */
export interface CreationCompte {
  email: string;
  prenom: string;
  nom: string;
  /** Un administrateur ne se crée pas ici : il se promeut via `changerRole`. */
  role: 'apprenant' | 'formateur';
  id_formation: string | null;
}
